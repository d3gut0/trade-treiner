import axios from 'axios';
import type {
  Asset,
  Candle,
  SessionView,
  SimulatedTrade,
  Strategy,
  Timeframe,
  TradeDirection,
} from './types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3500';

export const api = axios.create({ baseURL: API_URL });

// ---------- Candles ----------
export async function fetchCandles(ticker: string, timeframe: Timeframe, days: number) {
  const { data } = await api.post('/candles/fetch', { ticker, timeframe, days });
  return data;
}

export async function listAssets(): Promise<Asset[]> {
  const { data } = await api.get('/candles/assets');
  return data;
}

// ---------- Sessions ----------
export async function createSession(
  assetId: string,
  timeframe: Timeframe,
): Promise<SessionView> {
  const { data } = await api.post('/sessions', { assetId, timeframe });
  return data;
}

export async function getSessionView(sessionId: string): Promise<SessionView> {
  const { data } = await api.get(`/sessions/${sessionId}`);
  return data;
}

export async function revealNextCandle(sessionId: string): Promise<SessionView> {
  const { data } = await api.post(`/sessions/${sessionId}/next-candle`);
  return data;
}

export async function finishSession(sessionId: string): Promise<SessionView> {
  const { data } = await api.post(`/sessions/${sessionId}/finish`);
  return data;
}

// ---------- Trades ----------
export async function openTrade(params: {
  sessionId: string;
  direction: TradeDirection;
  entryPrice: number;
  stopGain: number;
  stopLoss: number;
  strategyId?: string;
}): Promise<SimulatedTrade> {
  const { data } = await api.post('/trades', params);
  return data;
}

export async function closeTradeManual(
  tradeId: string,
  exitPrice: number,
): Promise<SimulatedTrade> {
  const { data } = await api.post(`/trades/${tradeId}/close`, { exitPrice });
  return data;
}

export async function getTradeChartContext(tradeId: string): Promise<{
  trade: SimulatedTrade;
  asset: { ticker: string };
  candles: Candle[];
}> {
  const { data } = await api.get(`/trades/${tradeId}/chart-context`);
  return data;
}

// ---------- Evaluation ----------
export async function evaluateTrade(params: {
  tradeId: string;
  criterioFechamentoContrario: boolean;
  criterioRompimentoReferencia: boolean;
  criterioMediaMudouDirecao: boolean;
  textoLivre?: string;
}) {
  const { data } = await api.post('/evaluation', params);
  return data;
}

// ---------- Strategies ----------
export async function listStrategies(): Promise<Strategy[]> {
  const { data } = await api.get('/strategies');
  return data;
}

export async function createStrategy(params: {
  nome: string;
  descricao?: string;
  criterios?: Record<string, any>;
}): Promise<Strategy> {
  const { data } = await api.post('/strategies', params);
  return data;
}

export async function getStrategyStats(strategyId: string) {
  const { data } = await api.get(`/strategies/${strategyId}/stats`);
  return data;
}
