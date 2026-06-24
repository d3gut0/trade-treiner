import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import Groq from 'groq-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { EvaluateTradeDto } from './dto/evaluate-trade.dto';

const CONTEXT_CANDLES_BEFORE_ENTRY = 12;

// Fallback fixo usado SOMENTE quando o trade nao tem strategy vinculada -
// preserva o comportamento original dos 3 criterios pessoais de reversao.
const CRITERIOS_REVERSAO_FALLBACK: Record<string, string> = {
  fechamentoContrario: 'O candle fechou no sentido contrário ao movimento anterior (corpo, não pavio).',
  rompimentoReferencia: 'O preço rompeu o último fundo/topo de referência (pivô + correção + novo teste).',
  mediaMudouDirecao: 'A média rápida (EMA9) já mudou de direção (não só desacelerou).',
};

type CriteriosConfirmadosIA = Record<string, boolean | null>;

@Injectable()
export class EvaluationService {
  private readonly groq: Groq | null;

  constructor(private readonly prisma: PrismaService) {
    const apiKey = process.env.GROQ_API_KEY;
    this.groq = apiKey ? new Groq({ apiKey }) : null;
  }

  async evaluate(dto: EvaluateTradeDto) {
    const trade = await this.prisma.simulatedTrade.findUnique({
      where: { id: dto.tradeId },
      include: { session: true, strategy: true },
    });
    
    
    console.log('[DEBUG] trade.result no banco:', trade?.result, '| dto.tradeId:', dto.tradeId);


    if (!trade) throw new NotFoundException('Entrada não encontrada.');


    if (trade.result === 'EM_ANDAMENTO') {
      throw new BadRequestException(
        'A entrada ainda está em andamento - encerre-a (stop ou fim de sessão) antes de justificar.',
      );
    }

    // Monta o dicionário de critérios disponíveis para este trade:
    // - se tem strategy com criterios.confirmacao -> usa essa lista (dinâmico)
    // - se não tem strategy -> usa o fallback fixo de reversão (comportamento legado)
    const criteriosDisponiveis = this.resolveCriteriosDisponiveis(trade.strategy);

    // Filtra só o que o usuário de fato marcou E que existe na lista de critérios
    // válidos para esse trade (evita lixo vindo do front).
    const criteriosMarcadosValidos = dto.criteriosMarcados.filter((chave) =>
      Object.prototype.hasOwnProperty.call(criteriosDisponiveis, chave),
    );

    const contextStart = Math.max(
      trade.session.startSequenceIndex,
      trade.entrySequenceIndex - CONTEXT_CANDLES_BEFORE_ENTRY,
    );
    const contextEnd = trade.exitSequenceIndex ?? trade.entrySequenceIndex;

    const candles = await this.prisma.historicalCandle.findMany({
      where: {
        assetId: trade.session.assetId,
        timeframe: trade.session.timeframe,
        sequenceIndex: { gte: contextStart, lte: contextEnd },
      },
      orderBy: { sequenceIndex: 'asc' },
    });

    const payload = this.buildNumericPayload(trade, candles);

    let avaliacaoIA: string;
    let criteriosConfirmadosIA: CriteriosConfirmadosIA;
    let gestaoRespeitada: boolean;
    let scoreIA: number;

    if (!this.groq) {
      const fallback = this.buildLocalFallback(criteriosMarcadosValidos);
      avaliacaoIA = fallback.avaliacaoIA;
      criteriosConfirmadosIA = fallback.criteriosConfirmadosIA;
      gestaoRespeitada = fallback.gestaoRespeitada;
      scoreIA = fallback.scoreIA;
    } else {
      const aiResult = await this.callGroq(
        payload,
        criteriosDisponiveis,
        criteriosMarcadosValidos,
        dto.textoLivre,
      );
      avaliacaoIA = aiResult.avaliacaoIA;
      criteriosConfirmadosIA = aiResult.criteriosConfirmadosIA;
      gestaoRespeitada = aiResult.gestaoRespeitada;
      scoreIA = aiResult.scoreIA;
    }

    // Para retrocompatibilidade: se este trade está usando o fallback de
    // reversão (sem strategy), também grava nos 3 campos legados, assim
    // qualquer tela antiga que ainda leia esses campos continua funcionando.
    const isFallbackReversao = !trade.strategyId;
    const legacyFields = isFallbackReversao
      ? {
        criterioFechamentoContrario: criteriosMarcadosValidos.includes('fechamentoContrario'),
        criterioRompimentoReferencia: criteriosMarcadosValidos.includes('rompimentoReferencia'),
        criterioMediaMudouDirecao: criteriosMarcadosValidos.includes('mediaMudouDirecao'),
      }
      : {
        criterioFechamentoContrario: null,
        criterioRompimentoReferencia: null,
        criterioMediaMudouDirecao: null,
      };

    const justification = await this.prisma.tradeJustification.upsert({
      where: { tradeId: dto.tradeId },
      create: {
        tradeId: dto.tradeId,
        ...legacyFields,
        criteriosMarcados: criteriosMarcadosValidos as any,
        textoLivre: dto.textoLivre,
        avaliacaoIA,
        criteriosConfirmadosIA: criteriosConfirmadosIA as any,
        gestaoRespeitada,
        scoreIA,
      },
      update: {
        ...legacyFields,
        criteriosMarcados: criteriosMarcadosValidos as any,
        textoLivre: dto.textoLivre,
        avaliacaoIA,
        criteriosConfirmadosIA: criteriosConfirmadosIA as any,
        gestaoRespeitada,
        scoreIA,
      },
    });

    return justification;
  }

  /**
   * Resolve o dicionário { chave: descricaoHumana } de critérios válidos
   * para este trade. Se a strategy tiver criterios.confirmacao (array de
   * strings), usa isso. Senão, cai no fallback fixo de reversão.
   */
  private resolveCriteriosDisponiveis(strategy: any): Record<string, string> {
    const confirmacao = strategy?.criterios?.confirmacao;
    if (Array.isArray(confirmacao) && confirmacao.length > 0) {
      return Object.fromEntries(
        confirmacao.map((chave: string) => [chave, this.humanizeChave(chave)]),
      );
    }
    return CRITERIOS_REVERSAO_FALLBACK;
  }

  /** Transforma 'toque_ema21_sem_romper' em 'toque ema21 sem romper' para o prompt. */
  private humanizeChave(chave: string): string {
    return chave.replace(/_/g, ' ');
  }

  private buildNumericPayload(trade: any, candles: any[]) {
    return {
      direction: trade.direction,
      entryPrice: trade.entryPrice,
      stopGain: trade.stopGain,
      stopLoss: trade.stopLoss,
      exitPrice: trade.exitPrice,
      result: trade.result,
      entrySequenceIndex: trade.entrySequenceIndex,
      exitSequenceIndex: trade.exitSequenceIndex,
      estrategiaVinculada: trade.strategy?.nome ?? null,
      candles: candles.map((c) => ({
        seq: c.sequenceIndex,
        o: c.open,
        h: c.high,
        l: c.low,
        c: c.close,
        ema9: c.ema9,
        ema21: c.ema21,
        vwap: c.vwap,
      })),
    };
  }

  private async callGroq(
    payload: ReturnType<EvaluationService['buildNumericPayload']>,
    criteriosDisponiveis: Record<string, string>,
    criteriosMarcados: string[],
    textoLivre: string | undefined,
  ): Promise<{
    avaliacaoIA: string;
    criteriosConfirmadosIA: CriteriosConfirmadosIA;
    gestaoRespeitada: boolean;
    scoreIA: number;
  }> {
    const listaCriteriosDescritos = Object.entries(criteriosDisponiveis)
      .map(([chave, descricao]) => `- ${chave}: ${descricao}`)
      .join('\n');

    const systemPrompt = `Você é um mentor objetivo de day trade, especializado em revisar disciplina de entrada e saída.
Você recebe dados NUMÉRICOS de candles (OHLC) e indicadores (EMA9, EMA21, VWAP), o trade que o usuário simulou,
a estratégia que ele vinculou (se houver) e a justificativa que ele deu. NÃO invente preços. Avalie estritamente
com base nos números fornecidos.

Para este trade, os critérios de confirmação VÁLIDOS são (chave: descrição):
${listaCriteriosDescritos}

REGRAS PARA SUA AVALIAÇÃO:
- Avalie SOMENTE os critérios que aparecem na lista "criteriosQueOUsuarioMarcou" do prompt do usuário. Para
  qualquer chave da lista de critérios válidos que NÃO esteja em "criteriosQueOUsuarioMarcou", retorne null
  nesse campo dentro de "criteriosConfirmadosIA" - não invente uma avaliação para um critério que o usuário
  nem alegou ter seguido.
- Use exatamente as mesmas chaves da lista de critérios válidos acima como chaves do objeto
  "criteriosConfirmadosIA" na sua resposta.
- Se a lista de critérios marcados estiver vazia, não penalize a entrada por "não confirmar critérios" - avalie
  a entrada pela lógica que o usuário de fato usou (estratégia vinculada + texto livre).
- O comentário em "avaliacaoIA" deve mencionar apenas os critérios relevantes ao que o usuário realmente alegou,
  nunca cobrar critérios que ele não disse estar usando.

Também avalie gestaoRespeitada: true se o resultado é coerente com stopGain/stopLoss definidos (o stop é travado
no sistema e não pode ser alterado no meio da operação, então isso é mais sobre coerência estrutural do trade).

Responda SOMENTE em JSON válido, sem markdown, sem texto fora do JSON, no formato exato:
{
  "avaliacaoIA": "string em português, 2 a 4 frases, comentário objetivo sobre os critérios que o usuário realmente alegou seguir - nunca cobre critérios não alegados",
  "criteriosConfirmadosIA": { "<chave1>": boolean ou null, "<chave2>": boolean ou null, ... },
  "gestaoRespeitada": boolean,
  "scoreIA": number de 0 a 100 representando qualidade geral da decisão, considerando apenas o que o usuário alegou seguir
}`;

    const userPrompt = `DADOS DO TRADE:
${JSON.stringify(payload, null, 2)}

criteriosQueOUsuarioMarcou: ${JSON.stringify(criteriosMarcados)}
(esta é a lista de critérios que o usuário alega ter seguido - avalie SOMENTE estes; retorne null para os demais)

estrategiaVinculada: ${payload.estrategiaVinculada ?? '(nenhuma)'}

JUSTIFICATIVA EM TEXTO DO USUÁRIO:
"${textoLivre ?? '(não informado)'}"

Avalie com base nos números dos candles se os critérios da lista "criteriosQueOUsuarioMarcou" realmente bateram,
e dê seu veredito. Não avalie critérios fora dessa lista.`;

    try {
      const completion = await this.groq!.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      });

      const raw = completion.choices[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(raw);

      const normalizeCriterio = (value: unknown): boolean | null =>
        value === true || value === false ? value : null;

      // Reconstrói o objeto de resposta garantindo que TODAS as chaves
      // válidas existam no resultado final (mesmo que a IA tenha esquecido
      // alguma), preenchendo com null nesse caso.
      const criteriosConfirmadosIA: CriteriosConfirmadosIA = {};
      for (const chave of Object.keys(criteriosDisponiveis)) {
        criteriosConfirmadosIA[chave] = normalizeCriterio(parsed.criteriosConfirmadosIA?.[chave]);
      }

      return {
        avaliacaoIA: parsed.avaliacaoIA ?? 'IA não retornou comentário.',
        criteriosConfirmadosIA,
        gestaoRespeitada: !!parsed.gestaoRespeitada,
        scoreIA: typeof parsed.scoreIA === 'number' ? parsed.scoreIA : 50,
      };
    } catch (err: any) {
      throw new BadRequestException(`Falha ao avaliar via Groq: ${err.message}`);
    }
  }

  /**
   * Fallback usado apenas se GROQ_API_KEY nao estiver configurada.
   */
  private buildLocalFallback(criteriosMarcados: string[]) {
    const criteriosConfirmadosIA: CriteriosConfirmadosIA = {};
    for (const chave of criteriosMarcados) {
      criteriosConfirmadosIA[chave] = true;
    }
    return {
      avaliacaoIA:
        '[GROQ_API_KEY não configurada - avaliação de IA não executada. Configure a variável de ambiente para avaliação real.]',
      criteriosConfirmadosIA,
      gestaoRespeitada: true,
      scoreIA: 0,
    };
  }
}
