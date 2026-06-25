import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import Groq from 'groq-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { EvaluateTradeDto } from './dto/evaluate-trade.dto';

const CONTEXT_CANDLES_BEFORE_ENTRY = 12;

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
    let criteriosConfirmadosIA: {
      fechamentoContrario: boolean;
      rompimentoReferencia: boolean;
      mediaMudouDirecao: boolean;
    };
    let gestaoRespeitada: boolean;
    let scoreIA: number;

    if (!this.groq) {
      avaliacaoIA =
        '[GROQ_API_KEY não configurada - avaliação de IA não executada. Configure a variável de ambiente para avaliação real.]';
      criteriosConfirmadosIA = {
        fechamentoContrario: dto.criterioFechamentoContrario,
        rompimentoReferencia: dto.criterioRompimentoReferencia,
        mediaMudouDirecao: dto.criterioMediaMudouDirecao,
      };
      gestaoRespeitada = true;
      scoreIA = 0;
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
    dto: EvaluateTradeDto,
  ): Promise<{
    avaliacaoIA: string;
    criteriosConfirmadosIA: {
      fechamentoContrario: boolean;
      rompimentoReferencia: boolean;
      mediaMudouDirecao: boolean;
    };
    gestaoRespeitada: boolean;
    scoreIA: number;
  }> {
    const systemPrompt = `Você é um mentor objetivo de day trade, especializado em revisar disciplina de entrada e saída.
Você recebe dados NUMÉRICOS de candles (OHLC) e indicadores (EMA9, EMA21, VWAP) e o trade que o usuário simulou.
NÃO invente preços. Avalie estritamente com base nos números fornecidos.

Os 3 critérios de confirmação de reversão são:
- fechamentoContrario: o candle fechou no sentido contrário ao movimento anterior (corpo, não pavio).
- rompimentoReferencia: o preço rompeu o último fundo/topo de referência (pivô + correção + novo teste).
- mediaMudouDirecao: a média rápida (EMA9) já mudou de direção (não só desacelerou).

O usuário alegou quais desses critérios bateram. Avalie, com base nos números dos candles, se essas
alegações realmente se sustentam.

Também avalie gestaoRespeitada: true se o resultado é coerente com stopGain/stopLoss definidos.

Responda SOMENTE em JSON válido, sem markdown, sem texto fora do JSON, no formato exato:
{
  "avaliacaoIA": "string em português, 2 a 4 frases, comentário objetivo",
  "criteriosConfirmadosIA": {
    "fechamentoContrario": boolean,
    "rompimentoReferencia": boolean,
    "mediaMudouDirecao": boolean
  },
  "gestaoRespeitada": boolean,
  "scoreIA": number de 0 a 100
}`;

    const userPrompt = `DADOS DO TRADE:
${JSON.stringify(payload, null, 2)}

ALEGAÇÕES DO USUÁRIO:
- fechamentoContrario: ${dto.criterioFechamentoContrario}
- rompimentoReferencia: ${dto.criterioRompimentoReferencia}
- mediaMudouDirecao: ${dto.criterioMediaMudouDirecao}

JUSTIFICATIVA EM TEXTO DO USUÁRIO:
"${dto.textoLivre ?? '(não informado)'}"

Avalie com base nos números dos candles se cada alegação realmente bateu.`;

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
      console.log('[DEBUG] Erro na chamada Groq:', {
        message: err.message,
        status: err.status,
        code: err.code,
        response: err.response?.data,
      });
      throw new BadRequestException(`Falha ao avaliar via Groq: ${err.message}`);
    }
  }
}
