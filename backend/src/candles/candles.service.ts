import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();
import { Timeframe } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { calculateEMA, calculateVWAP, CandleInput } from '../common/indicators';
import { FetchCandlesDto, Mercado } from './dto/fetch-candles.dto';

const TIMEFRAME_TO_YAHOO_INTERVAL: Record<Timeframe, string> = {
  M1: '1m',
  M2: '2m',
  M5: '5m',
};

@Injectable()
export class CandlesService {
  constructor(private readonly prisma: PrismaService) {}

  async fetchAndStore(dto: FetchCandlesDto) {
    const yahooTicker = this.toYahooTicker(dto.ticker, dto.mercado ?? Mercado.B3);
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

    const candleInputs: CandleInput[] = validQuotes.map((q: any) => ({
      close: q.close as number,
      high: q.high as number,
      low: q.low as number,
      volume: q.volume as number,
      timestamp: new Date(q.date),
    }));
    const vwap = calculateVWAP(candleInputs);

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
      sequenceIndex: i,
    }));

    await this.prisma.historicalCandle.createMany({
      data: rows,
      skipDuplicates: true,
    });

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

  /**
   * Resolve o ticker no formato que o yahoo-finance2 espera, de acordo com
   * o mercado informado:
   * - B3: PETR4 -> PETR4.SA
   * - CRIPTO: BTC -> BTC-USD
   */
  private toYahooTicker(ticker: string, mercado: Mercado): string {
    const clean = ticker.trim().toUpperCase();

    if (mercado === Mercado.CRIPTO) {
      return clean.endsWith('-USD') ? clean : `${clean}-USD`;
    }

    return clean.endsWith('.SA') ? clean : `${clean}.SA`;
  }
}