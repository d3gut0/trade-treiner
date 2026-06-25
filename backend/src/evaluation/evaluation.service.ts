import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { PrismaService } from '../prisma/prisma.service';
import { EvaluateTradeDto } from './dto/evaluate-trade.dto';

const CONTEXT_CANDLES_BEFORE_ENTRY = 12;

interface CriteriosConfirmadosIA {
  fechamentoContrario: boolean | null;
  rompimentoReferencia: boolean | null;
  mediaMudouDirecao: boolean | null;
}

@Injectable()
export class EvaluationService {
  public readonly ai: GoogleGenAI | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    this.ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
  }

  async evaluate(dto: EvaluateTradeDto) {
    const trade = await this.prisma.simulatedTrade.findUnique({
      where: { id: dto.tradeId },
      include: { session: true, strategy: true },
    });
    
    if (!trade) throw new NotFoundException('Entrada não encontrada.');
    if (trade.result === 'EM_ANDAMENTO') {
      throw new BadRequestException(
        'A entrada ainda está em andamento - encerre-a (stop ou fim de sessão) antes de justificar.',
      );
    }

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

    if (!this.ai) {
      const fallback = this.buildLocalFallback(dto);
      avaliacaoIA = fallback.avaliacaoIA;
      criteriosConfirmadosIA = fallback.criteriosConfirmadosIA;
      gestaoRespeitada = fallback.gestaoRespeitada;
      scoreIA = fallback.scoreIA;
    } else {
      const aiResult = await this.callGemini(payload, dto);
      avaliacaoIA = aiResult.avaliacaoIA;
      criteriosConfirmadosIA = aiResult.criteriosConfirmadosIA;
      gestaoRespeitada = aiResult.gestaoRespeitada;
      scoreIA = aiResult.scoreIA;
    }

    const justification = await this.prisma.tradeJustification.upsert({
      where: { tradeId: dto.tradeId },
      create: {
        tradeId: dto.tradeId,
        criterioFechamentoContrario: dto.criterioFechamentoContrario,
        criterioRompimentoReferencia: dto.criterioRompimentoReferencia,
        criterioMediaMudouDirecao: dto.criterioMediaMudouDirecao,
        textoLivre: dto.textoLivre,
        avaliacaoIA,
        criteriosConfirmadosIA: criteriosConfirmadosIA as any,
        gestaoRespeitada,
        scoreIA,
      },
      update: {
        criterioFechamentoContrario: dto.criterioFechamentoContrario,
        criterioRompimentoReferencia: dto.criterioRompimentoReferencia,
        criterioMediaMudouDirecao: dto.criterioMediaMudouDirecao,
        textoLivre: dto.textoLivre,
        avaliacaoIA,
        criteriosConfirmadosIA: criteriosConfirmadosIA as any,
        gestaoRespeitada,
        scoreIA,
      },
    });

    return justification;
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

  private async callGemini(
    payload: ReturnType<EvaluationService['buildNumericPayload']>,
    dto: EvaluateTradeDto,
  ): Promise<{
    avaliacaoIA: string;
    criteriosConfirmadosIA: CriteriosConfirmadosIA;
    gestaoRespeitada: boolean;
    scoreIA: number;
  }> {
    const criteriosMarcados: string[] = [];
    if (dto.criterioFechamentoContrario) criteriosMarcados.push('fechamentoContrario');
    if (dto.criterioRompimentoReferencia) criteriosMarcados.push('rompimentoReferencia');
    if (dto.criterioMediaMudouDirecao) criteriosMarcados.push('mediaMudouDirecao');

    const systemPrompt = `Você é um mentor objetivo de day trade, especializado em revisar disciplina de entrada e saída.
Você recebe dados NUMÉRICOS de candles (OHLC) e indicadores (EMA9, EMA21, VWAP), o trade que o usuário simulou,
a estratégia que ele vinculou (se houver) e a justificativa que ele deu. NÃO invente preços. Avalie estritamente
com base nos números fornecidos.

IMPORTANTE - REGRA DE ESCOPO DA AVALIAÇÃO:
O usuário tem 3 critérios pessoais de confirmação que ele usa especificamente para decidir ENTRADAS DE REVERSÃO
(operar contra o movimento anterior, apostando que ele está virando). Esses critérios NÃO são um checklist
universal obrigatório para toda e qualquer entrada - eles só fazem sentido quando o usuário está de fato tentando
uma reversão.

Os 3 critérios são:
1. fechamentoContrario: o candle de entrada (ou o candle imediatamente anterior) fechou no sentido contrário ao movimento prévio, não apenas pavio.
2. rompimentoReferencia: o preço rompeu o último fundo/topo de referência visível na janela de candles fornecida.
3. mediaMudouDirecao: a EMA9 mudou de inclinação (não apenas desacelerou) na direção da nova entrada.

REGRAS PARA SUA AVALIAÇÃO:
- Avalie SOMENTE os critérios que aparecem na lista "criteriosQueOUsuarioMarcou" do prompt do usuário. Para qualquer critério que NÃO esteja nessa lista, retorne null nesse campo de "criteriosConfirmadosIA".
- Se a lista de critérios marcados estiver vazia, ou se a estratégia vinculada for claramente outra lógica (ex: "Cruzamento EMA9/EMA21", "Pullback à VWAP"), NÃO penalize a entrada por "não confirmar os 3 critérios de reversão". Avalie a entrada pela lógica que ele de fato usou.
- O comentário em "avaliacaoIA" deve mencionar apenas os critérios relevantes ao que o usuário realmente alegou.

Responda SOMENTE com o JSON estruturado abaixo, sem markdown, no formato exato:
{
  "avaliacaoIA": "string em português, 2 a 4 frases, comentário objetivo sobre os critérios que o usuário realmente alegou seguir",
  "criteriosConfirmadosIA": { "fechamentoContrario": boolean ou null, "rompimentoReferencia": boolean ou null, "mediaMudouDirecao": boolean ou null },
  "gestaoRespeitada": boolean,
  "scoreIA": number de 0 a 100 considerando apenas o que o usuário alegou seguir
}`;

    const userPrompt = `DADOS DO TRADE:
${JSON.stringify(payload, null, 2)}

criteriosQueOUsuarioMarcou: ${JSON.stringify(criteriosMarcados)}
estrategiaVinculada: ${payload.estrategiaVinculada ?? '(nenhuma)'}

JUSTIFICATIVA EM TEXTO DO USUÁRIO:
"${dto.textoLivre ?? '(não informado)'}"

Avalie com base nos números dos candles se os critérios da lista "criteriosQueOUsuarioMarcou" realmente bateram.`;

    try {
      const response = await this.ai!.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          { role: 'user', parts: [{ text: systemPrompt + '\n\n' + userPrompt }] }
        ],
        config: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        }
      });

      const raw = response.text ?? '{}';
      const parsed = JSON.parse(raw);

      const normalizeCriterio = (value: unknown): boolean | null =>
        value === true || value === false ? value : null;

      return {
        avaliacaoIA: parsed.avaliacaoIA ?? 'IA não retornou comentário.',
        criteriosConfirmadosIA: {
          fechamentoContrario: normalizeCriterio(parsed.criteriosConfirmadosIA?.fechamentoContrario),
          rompimentoReferencia: normalizeCriterio(parsed.criteriosConfirmadosIA?.rompimentoReferencia),
          mediaMudouDirecao: normalizeCriterio(parsed.criteriosConfirmadosIA?.mediaMudouDirecao),
        },
        gestaoRespeitada: !!parsed.gestaoRespeitada,
        scoreIA: typeof parsed.scoreIA === 'number' ? parsed.scoreIA : 50,
      };
    } catch (err: any) {
      console.error('Erro na chamada do Gemini:', err);
      throw new BadRequestException(`Falha ao avaliar via Gemini: ${err.message}`);
    }
  }

  private buildLocalFallback(dto: EvaluateTradeDto) {
    return {
      avaliacaoIA: '[GEMINI_API_KEY não configurada - executando fallback local.]',
      criteriosConfirmadosIA: {
        fechamentoContrario: dto.criterioFechamentoContrario,
        rompimentoReferencia: dto.criterioRompimentoReferencia,
        mediaMudouDirecao: dto.criterioMediaMudouDirecao,
      },
      gestaoRespeitada: true,
      scoreIA: 0,
    };
  }
}