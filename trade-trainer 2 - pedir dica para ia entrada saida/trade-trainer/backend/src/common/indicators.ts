/**
 * Calculo de indicadores tecnicos.
 *
 * Importante: estas funcoes sao usadas tanto para pre-calcular os indicadores
 * de todo o lote historico (ao baixar candles) quanto, futuramente, para
 * recalculo incremental se necessario. Mantemos puras (sem efeito colateral)
 * para facilitar testes.
 */

export interface CandleInput {
  close: number;
  high: number;
  low: number;
  volume: number;
  timestamp: Date;
}

/**
 * EMA (Exponential Moving Average) classica.
 * Retorna um array do mesmo tamanho que `closes`, com `null` nos indices
 * anteriores a `period - 1` (ainda nao ha dados suficientes).
 */
export function calculateEMA(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period) return result;

  const k = 2 / (period + 1);

  // primeira EMA = SMA dos primeiros `period` valores
  let sma = 0;
  for (let i = 0; i < period; i++) sma += closes[i];
  sma = sma / period;

  result[period - 1] = sma;
  let prevEma = sma;

  for (let i = period; i < closes.length; i++) {
    const ema = closes[i] * k + prevEma * (1 - k);
    result[i] = ema;
    prevEma = ema;
  }

  return result;
}

/**
 * VWAP (Volume Weighted Average Price) - calculado de forma acumulativa
 * dentro do dia (reseta a cada novo dia de pregao, que e o uso padrao
 * de VWAP intraday).
 *
 * typical price = (high + low + close) / 3
 */
export function calculateVWAP(candles: CandleInput[]): (number | null)[] {
  const result: (number | null)[] = new Array(candles.length).fill(null);

  let cumulativeVolume = 0;
  let cumulativeVolumePrice = 0;
  let currentDay: string | null = null;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const dayKey = c.timestamp.toISOString().slice(0, 10); // YYYY-MM-DD

    if (dayKey !== currentDay) {
      // novo dia de pregao -> reseta acumuladores
      currentDay = dayKey;
      cumulativeVolume = 0;
      cumulativeVolumePrice = 0;
    }

    const typicalPrice = (c.high + c.low + c.close) / 3;
    cumulativeVolumePrice += typicalPrice * c.volume;
    cumulativeVolume += c.volume;

    result[i] = cumulativeVolume > 0 ? cumulativeVolumePrice / cumulativeVolume : null;
  }

  return result;
}
