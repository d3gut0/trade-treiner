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

/**
 * IFR2 (Indice de Forca Relativa, periodo 2) - tambem conhecido como RSI(2).
 * E o oscilador classico de Larry Connors para estrategias de sobrecompra/
 * sobrevenda de curtissimo prazo (geralmente usado com limites de 10/90 em
 * vez dos tradicionais 30/70 do RSI de periodo 14).
 *
 * Formula de Wilder (suavizacao exponencial dos ganhos/perdas medios):
 * 1. delta = close[i] - close[i-1]
 * 2. ganho = max(delta, 0), perda = max(-delta, 0)
 * 3. primeira media de ganhos/perdas = SMA simples dos primeiros `period` deltas
 * 4. medias seguintes = suavizacao de Wilder: media = (mediaAnterior * (period-1) + valorAtual) / period
 * 5. RS = mediaGanhos / mediaPerdas
 * 6. IFR = 100 - (100 / (1 + RS))
 *
 * Fixo para period=2 neste projeto (unico uso atual: estrategia IFR2 de
 * sobrevenda estatistica). Retorna null nos indices sem dados suficientes
 * (precisa de pelo menos period+1 closes para o primeiro valor).
 */
export function calculateIFR2(closes: number[]): (number | null)[] {
  const period = 2;
  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return result;

  const deltas: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    deltas.push(closes[i] - closes[i - 1]);
  }

  // primeira media (SMA simples) dos primeiros `period` deltas
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    const delta = deltas[i];
    avgGain += Math.max(delta, 0);
    avgLoss += Math.max(-delta, 0);
  }
  avgGain /= period;
  avgLoss /= period;

  const computeIFR = (gain: number, loss: number): number => {
    if (loss === 0) return gain === 0 ? 50 : 100; // sem perdas: IFR maximo (ou neutro se tambem sem ganhos)
    const rs = gain / loss;
    return 100 - 100 / (1 + rs);
  };

  // indice do closes[] correspondente ao primeiro IFR calculavel:
  // deltas[period-1] é a transicao closes[period-1] -> closes[period],
  // entao o primeiro IFR valido fica em closes[period]
  result[period] = computeIFR(avgGain, avgLoss);

  for (let i = period; i < deltas.length; i++) {
    const delta = deltas[i];
    const gain = Math.max(delta, 0);
    const loss = Math.max(-delta, 0);

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    result[i + 1] = computeIFR(avgGain, avgLoss);
  }

  return result;
}
