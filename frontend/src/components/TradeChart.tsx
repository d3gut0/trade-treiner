import { useEffect, useRef } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  LineData,
  UTCTimestamp,
} from 'lightweight-charts';
import type { Candle, SimulatedTrade } from '../types';

interface Props {
  candles: Candle[];
  trades: SimulatedTrade[];
}

// id de price scale customizado para o painel de IFR2 - separa visualmente
// do price scale principal (candles/EMA/VWAP), simulando um sub-painel
// embaixo do grafico de preco (tecnica padrao no lightweight-charts v4,
// que ainda nao tem paineis nativos como a v5).
const IFR2_PRICE_SCALE_ID = 'ifr2-scale';

export function TradeChart({ candles, trades }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const ema9SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema21SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const vwapSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ifr2SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ifr2UpperBandRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ifr2LowerBandRef = useRef<ISeriesApi<'Line'> | null>(null);

  // se algum candle visivel tem ifr2 calculado, mostramos o painel -
  // isso evita reservar espaco vazio em ativos/sessoes sem essa estrategia
  const hasIFR2 = candles.some((c) => c.ifr2 != null);

  // cria o chart uma unica vez
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 480,
      layout: {
        background: { color: '#11141a' },
        textColor: '#d1d5db',
      },
      grid: {
        vertLines: { color: '#1f2430' },
        horzLines: { color: '#1f2430' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: { mode: 0 },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });
    // reserva a faixa inferior do grafico para o painel de IFR2 (quando houver)
    candleSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.05, bottom: 0.3 },
    });

    const ema9Series = chart.addLineSeries({
      color: '#fbbf24',
      lineWidth: 2,
      title: 'EMA9',
    });
    const ema21Series = chart.addLineSeries({
      color: '#60a5fa',
      lineWidth: 2,
      title: 'EMA21',
    });
    const vwapSeries = chart.addLineSeries({
      color: '#c084fc',
      lineWidth: 1,
      lineStyle: 2, // dashed
      title: 'VWAP',
    });

    // painel de IFR2: price scale propria (0-100), confinada na faixa
    // inferior do grafico (abaixo dos candles), com linhas de referencia
    // de sobrevenda (10) e sobrecompra (90)
    const ifr2Series = chart.addLineSeries({
      color: '#34d399',
      lineWidth: 2,
      title: 'IFR2',
      priceScaleId: IFR2_PRICE_SCALE_ID,
    });
    const ifr2UpperBand = chart.addLineSeries({
      color: '#6b7280',
      lineWidth: 1,
      lineStyle: 2,
      priceScaleId: IFR2_PRICE_SCALE_ID,
      title: 'Sobrecompra (90)',
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    const ifr2LowerBand = chart.addLineSeries({
      color: '#6b7280',
      lineWidth: 1,
      lineStyle: 2,
      priceScaleId: IFR2_PRICE_SCALE_ID,
      title: 'Sobrevenda (10)',
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    chart.priceScale(IFR2_PRICE_SCALE_ID).applyOptions({
      scaleMargins: { top: 0.75, bottom: 0.02 },
      borderVisible: true,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    ema9SeriesRef.current = ema9Series;
    ema21SeriesRef.current = ema21Series;
    vwapSeriesRef.current = vwapSeries;
    ifr2SeriesRef.current = ifr2Series;
    ifr2UpperBandRef.current = ifr2UpperBand;
    ifr2LowerBandRef.current = ifr2LowerBand;

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  // atualiza os dados quando candles mudam (a cada "proximo candle")
  useEffect(() => {
    if (!candleSeriesRef.current || candles.length === 0) return;

    const toTime = (iso: string): UTCTimestamp =>
      Math.floor(new Date(iso).getTime() / 1000) as UTCTimestamp;

    const candleData: CandlestickData[] = candles.map((c) => ({
      time: toTime(c.timestamp),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    candleSeriesRef.current.setData(candleData);

    const ema9Data: LineData[] = candles
      .filter((c) => c.ema9 != null)
      .map((c) => ({ time: toTime(c.timestamp), value: c.ema9 as number }));
    ema9SeriesRef.current?.setData(ema9Data);

    const ema21Data: LineData[] = candles
      .filter((c) => c.ema21 != null)
      .map((c) => ({ time: toTime(c.timestamp), value: c.ema21 as number }));
    ema21SeriesRef.current?.setData(ema21Data);

    const vwapData: LineData[] = candles
      .filter((c) => c.vwap != null)
      .map((c) => ({ time: toTime(c.timestamp), value: c.vwap as number }));
    vwapSeriesRef.current?.setData(vwapData);

    if (hasIFR2) {
      const ifr2Data: LineData[] = candles
        .filter((c) => c.ifr2 != null)
        .map((c) => ({ time: toTime(c.timestamp), value: c.ifr2 as number }));
      ifr2SeriesRef.current?.setData(ifr2Data);

      // linhas de referencia fixas em 10 e 90, cobrindo toda a janela visivel
      const allTimes = candles.map((c) => toTime(c.timestamp));
      const upperBandData: LineData[] = allTimes.map((time) => ({ time, value: 90 }));
      const lowerBandData: LineData[] = allTimes.map((time) => ({ time, value: 10 }));
      ifr2UpperBandRef.current?.setData(upperBandData);
      ifr2LowerBandRef.current?.setData(lowerBandData);
    } else {
      // sem IFR2 nesta sessao/ativo - limpa qualquer dado residual de uma
      // troca de sessao anterior que tivesse IFR2
      ifr2SeriesRef.current?.setData([]);
      ifr2UpperBandRef.current?.setData([]);
      ifr2LowerBandRef.current?.setData([]);
    }

    chartRef.current?.timeScale().fitContent();
  }, [candles, hasIFR2]);

  // desenha marcadores de entrada/saida das trades simuladas
  useEffect(() => {
    if (!candleSeriesRef.current) return;

    const toTime = (iso: string): UTCTimestamp =>
      Math.floor(new Date(iso).getTime() / 1000) as UTCTimestamp;

    const candleBySeq = new Map(candles.map((c) => [c.sequenceIndex, c]));

    const markers = trades.flatMap((t) => {
      const entryCandle = candleBySeq.get(t.entrySequenceIndex);
      const marks = [];
      if (entryCandle) {
        marks.push({
          time: toTime(entryCandle.timestamp),
          position: t.direction === 'COMPRA' ? ('belowBar' as const) : ('aboveBar' as const),
          color: t.direction === 'COMPRA' ? '#22c55e' : '#ef4444',
          shape: t.direction === 'COMPRA' ? ('arrowUp' as const) : ('arrowDown' as const),
          text: `${t.direction} @ ${t.entryPrice.toFixed(2)}`,
        });
      }
      if (t.exitSequenceIndex != null) {
        const exitCandle = candleBySeq.get(t.exitSequenceIndex);
        if (exitCandle) {
          marks.push({
            time: toTime(exitCandle.timestamp),
            position: 'inBar' as const,
            color: t.result === 'GAIN' ? '#22c55e' : '#f87171',
            shape: 'circle' as const,
            text: `Saída: ${t.result}`,
          });
        }
      }
      return marks;
    });

    candleSeriesRef.current.setMarkers(markers);
  }, [trades, candles]);

  return (
    <div>
      <div ref={containerRef} style={{ width: '100%' }} />
      {hasIFR2 && (
        <p style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: '0.25rem', marginBottom: 0 }}>
          Painel inferior: IFR2 (0-100) — linhas tracejadas em 10 (sobrevenda) e 90 (sobrecompra)
        </p>
      )}
    </div>
  );
}
