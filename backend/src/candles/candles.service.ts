import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
// yahoo-finance2 v3+ exporta a CLASSE YahooFinance como default (breaking
// change da v2 para v3 - antes era um singleton já instanciado). Por isso
// precisamos instanciar com `new YahooFinance()` antes de usar.
// Ver: https://github.com/gadicc/yahoo-finance2/blob/dev/docs/UPGRADING.md
// eslint-disable-next-line @typescript-eslint/no-var-requires
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();
import { Timeframe } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { calculateEMA, calculateVWAP, calculateIFR2, CandleInput } from '../common/indicators';
import { FetchCandlesDto } from './dto/fetch-candles.dto';

// Mapeia nosso enum Timeframe para o intervalo aceito pelo yahoo-finance2
const TIMEFRAME_TO_YAHOO_INTERVAL: Record<Timeframe, string> = {
  M1: '1m',
  M2: '2m',
  M5: '5m',
};

@Injectable()
export class CandlesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Baixa candles historicos reais via yahoo-finance2, calcula EMA9/EMA21/VWAP
   * e persiste no banco. Se o ativo nao existir ainda, cria.
   *
   * Nota: yahoo-finance2 limita dados intraday (1m/2m) normalmente aos
   * ultimos ~60 dias. Para janelas maiores seria necessario timeframe maior.
   */
  async fetchAndStore(dto: FetchCandlesDto) {
    const yahooTicker = this.toYahooTicker(dto.ticker);
    const interval = TIMEFRAME_TO_YAHOO_INTERVAL[dto.timeframe];

    const period2 = new Date();
    const period1 = new Date();
    period1.setDate(period1.getDate() - (dto.days ?? 5));

    let chartResult: any;
    try {
      chartResult = await yahooFinance.chart(yahooTicker, {
        period1,
        period2,
        interval: interval as any,
      });
    } catch (err: any) {
      throw new BadRequestException(
        `Falha ao buscar dados no Yahoo Finance para ${yahooTicker}: ${err.message}`,
      );
    }

    const quotes: any[] = chartResult?.quotes ?? [];
    if (quotes.length === 0) {
      throw new BadRequestException(
        `Nenhum candle retornado para ${yahooTicker} no intervalo solicitado. ` +
          `Intervalos intraday geralmente só cobrem os últimos dias - tente reduzir "days".`,
      );
    }

    // filtra candles incompletos (yahoo as vezes retorna null em high/low/close)
    // Nota: como yahooFinance agora vem de require() (sem tipos estaticos),
    // anotamos explicitamente `q: any` nos callbacks abaixo para satisfazer
    // o strict mode do TypeScript (noImplicitAny).
    const validQuotes = quotes.filter(
      (q: any) =>
        q.open != null &&
        q.high != null &&
        q.low != null &&
        q.close != null &&
        q.volume != null,
    );

    const asset = await this.prisma.asset.upsert({
      where: { ticker: yahooTicker },
      update: {},
      create: { ticker: yahooTicker, nome: dto.ticker.toUpperCase() },
    });

    const closes = validQuotes.map((q: any) => q.close as number);
    const ema9 = calculateEMA(closes, 9);
    const ema21 = calculateEMA(closes, 21);
    const ifr2 = calculateIFR2(closes);

    const candleInputs: CandleInput[] = validQuotes.map((q: any) => ({
      close: q.close as number,
      high: q.high as number,
      low: q.low as number,
      volume: q.volume as number,
      timestamp: new Date(q.date),
    }));
    const vwap = calculateVWAP(candleInputs);

    // grava em lote. Usamos createMany com skipDuplicates pra permitir
    // grava em lote. Usamos upsert (em vez de createMany+skipDuplicates) para
    // permitir RE-FETCH com atualizacao: se o usuario baixar o mesmo ativo de
    // novo depois de um indicador novo ter sido adicionado ao sistema (ex:
    // IFR2), os candles existentes sao atualizados com o indicador recalculado,
    // em vez de simplesmente pulados por já existirem (que era o comportamento
    // antigo com skipDuplicates - candles antigos ficavam sem o indicador novo).
    const rows = validQuotes.map((q: any, i: number) => ({
      assetId: asset.id,
      timeframe: dto.timeframe,
      timestamp: new Date(q.date),
      open: q.open as number,
      high: q.high as number,
      low: q.low as number,
      close: q.close as number,
      volume: q.volume as number,
      ema9: ema9[i],
      ema21: ema21[i],
      vwap: vwap[i],
      ifr2: ifr2[i],
      sequenceIndex: i,
    }));

    await this.prisma.$transaction(
      rows.map((row) =>
        this.prisma.historicalCandle.upsert({
          where: {
            assetId_timeframe_timestamp: {
              assetId: row.assetId,
              timeframe: row.timeframe,
              timestamp: row.timestamp,
            },
          },
          create: row,
          update: {
            open: row.open,
            high: row.high,
            low: row.low,
            close: row.close,
            volume: row.volume,
            ema9: row.ema9,
            ema21: row.ema21,
            vwap: row.vwap,
            ifr2: row.ifr2,
            sequenceIndex: row.sequenceIndex,
          },
        }),
      ),
    );

    return {
      asset,
      candlesGravados: rows.length,
      primeiroCandle: rows[0]?.timestamp,
      ultimoCandle: rows[rows.length - 1]?.timestamp,
    };
  }

  async listAssets() {
    return this.prisma.asset.findMany({
      include: {
        _count: { select: { candles: true } },
      },
    });
  }

  /**
   * Retorna uma janela de candles de um ativo, ordenada por sequenceIndex.
   * Usada pelo modulo de sessions para escolher o trecho do replay.
   */
  async getCandleWindow(
    assetId: string,
    timeframe: Timeframe,
    startSequenceIndex: number,
    endSequenceIndex: number,
  ) {
    const candles = await this.prisma.historicalCandle.findMany({
      where: {
        assetId,
        timeframe,
        sequenceIndex: { gte: startSequenceIndex, lte: endSequenceIndex },
      },
      orderBy: { sequenceIndex: 'asc' },
    });

    if (candles.length === 0) {
      throw new NotFoundException('Nenhum candle encontrado para essa janela.');
    }

    return candles;
  }

  async countCandles(assetId: string, timeframe: Timeframe) {
    return this.prisma.historicalCandle.count({ where: { assetId, timeframe } });
  }

  private toYahooTicker(ticker: string): string {
    const clean = ticker.trim().toUpperCase();
    return clean.endsWith('.SA') ? clean : `${clean}.SA`;
  }
}
