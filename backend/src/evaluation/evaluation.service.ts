import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import Groq from 'groq-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { EvaluateTradeDto } from './dto/evaluate-trade.dto';

// Quantos candles ANTES da entrada mandamos pra IA como contexto.
// Numero pequeno o suficiente pra manter o payload (e o custo) baixo,
// mas suficiente pra IA avaliar estrutura de movimento.
const CONTEXT_CANDLES_BEFORE_ENTRY = 12;

interface CriteriosConfirmadosIA {
  fechamentoContrario: boolean;
  rompimentoReferencia: boolean;
  mediaMudouDirecao: boolean;
}

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
      include: { session: true },
    });
    if (!trade) throw new NotFoundException('Entrada não encontrada.');
    if (trade.result === 'EM_ANDAMENTO') {
      throw new BadRequestException(
        'A entrada ainda está em andamento - encerre-a (stop ou fim de sessão) antes de justificar.',
      );
    }

    // pega os candles de contexto: do inicio da sessao (ou N antes da entrada,
    // o que for maior) até o candle de saida
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
      // sem API key configurada - retorna uma avaliacao basica local,
      // mas deixa claro que a IA nao foi de fato consultada
      const fallback = this.buildLocalFallback(dto);
      avaliacaoIA = fallback.avaliacaoIA;
      criteriosConfirmadosIA = fallback.criteriosConfirmadosIA;
      gestaoRespeitada = fallback.gestaoRespeitada;
      scoreIA = fallback.scoreIA;
    } else {
      const aiResult = await this.callGroq(payload, dto);
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

  /**
   * Monta o payload SOMENTE com numeros (OHLC + indicadores) - sem imagem,
   * sem texto especulativo. Isso e o que torna a chamada barata e mais
   * confiavel para niveis de preco exatos.
   */
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
    dto: EvaluateTradeDto,
  ): Promise<{
    avaliacaoIA: string;
    criteriosConfirmadosIA: CriteriosConfirmadosIA;
    gestaoRespeitada: boolean;
    scoreIA: number;
  }> {
    const systemPrompt = `Você é um mentor objetivo de day trade, especializado em revisar disciplina de entrada e saída.
Você recebe dados NUMÉRICOS de candles (OHLC) e indicadores (EMA9, EMA21, VWAP), o trade que o usuário simulou,
e a justificativa que ele deu. NÃO invente preços. Avalie estritamente com base nos números fornecidos.

Os 3 critérios de confirmação que o usuário define para entrar contra um movimento (reversão) são:
1. fechamentoContrario: o candle de entrada (ou o candle imediatamente anterior) fechou no sentido contrário ao movimento prévio, não apenas pavio.
2. rompimentoReferencia: o preço rompeu o último fundo/topo de referência visível na janela de candles fornecida.
3. mediaMudouDirecao: a EMA9 mudou de inclinação (não apenas desacelerou) na direção da nova entrada, comparando os valores de ema9 nos últimos candles antes da entrada.

Também avalie gestaoRespeitada: true se o resultado é coerente com stopGain/stopLoss definidos (ou seja, o usuário não teria motivo aparente para ter alterado o stop no meio - isso é mais sobre se a estrutura do trade é coerente, já que o stop é travado no sistema e não pode ser alterado).

Responda SOMENTE em JSON válido, sem markdown, sem texto fora do JSON, no formato exato:
{
  "avaliacaoIA": "string em português, 2 a 4 frases, comentário objetivo e direto sobre se a entrada seguiu os critérios",
  "criteriosConfirmadosIA": { "fechamentoContrario": boolean, "rompimentoReferencia": boolean, "mediaMudouDirecao": boolean },
  "gestaoRespeitada": boolean,
  "scoreIA": number de 0 a 100 representando qualidade geral da decisão
}`;

    const userPrompt = `DADOS DO TRADE:
${JSON.stringify(payload, null, 2)}

CRITÉRIOS QUE O USUÁRIO MARCOU TER SEGUIDO (autoavaliação dele, pode estar errada):
- fechamentoContrario: ${dto.criterioFechamentoContrario}
- rompimentoReferencia: ${dto.criterioRompimentoReferencia}
- mediaMudouDirecao: ${dto.criterioMediaMudouDirecao}

JUSTIFICATIVA EM TEXTO DO USUÁRIO:
"${dto.textoLivre ?? '(não informado)'}"

Avalie com base nos números dos candles se os critérios marcados pelo usuário realmente bateram, e dê seu veredito.`;

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

      return {
        avaliacaoIA: parsed.avaliacaoIA ?? 'IA não retornou comentário.',
        criteriosConfirmadosIA: {
          fechamentoContrario: !!parsed.criteriosConfirmadosIA?.fechamentoContrario,
          rompimentoReferencia: !!parsed.criteriosConfirmadosIA?.rompimentoReferencia,
          mediaMudouDirecao: !!parsed.criteriosConfirmadosIA?.mediaMudouDirecao,
        },
        gestaoRespeitada: !!parsed.gestaoRespeitada,
        scoreIA: typeof parsed.scoreIA === 'number' ? parsed.scoreIA : 50,
      };
    } catch (err: any) {
      throw new BadRequestException(`Falha ao avaliar via Groq: ${err.message}`);
    }
  }

  /**
   * Fallback usado apenas se GROQ_API_KEY nao estiver configurada -
   * evita quebrar o fluxo, mas deixa claro que nao houve avaliacao real de IA.
   */
  private buildLocalFallback(dto: EvaluateTradeDto) {
    return {
      avaliacaoIA:
        '[GROQ_API_KEY não configurada - avaliação de IA não executada. Configure a variável de ambiente para avaliação real.]',
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
