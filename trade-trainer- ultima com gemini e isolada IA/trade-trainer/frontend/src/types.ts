export type Timeframe = 'M1' | 'M2' | 'M5';
export type TradeDirection = 'COMPRA' | 'VENDA';
export type TradeResult =
  | 'GAIN'
  | 'LOSS'
  | 'ENCERRADO_TEMPO'
  | 'ENCERRADO_MANUAL'
  | 'EM_ANDAMENTO';
export type SessionStatus = 'EM_ANDAMENTO' | 'FINALIZADA';
export type AvaliacaoIAStatus = 'PENDENTE' | 'AVALIADO' | 'ERRO';

export interface Asset {
  id: string;
  ticker: string;
  nome: string | null;
  _count?: { candles: number };
}

export interface Candle {
  id: string;
  assetId: string;
  timeframe: Timeframe;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ema9: number | null;
  ema21: number | null;
  vwap: number | null;
  sequenceIndex: number;
}

export interface Strategy {
  id: string;
  nome: string;
  descricao: string | null;
  criterios: Record<string, any> | null;
  createdAt: string;
  _count?: { trades: number };
}

export interface TrainingSession {
  id: string;
  assetId: string;
  timeframe: Timeframe;
  startSequenceIndex: number;
  endSequenceIndex: number;
  totalCandles: number;
  candlesRevealed: number;
  status: SessionStatus;
  createdAt: string;
  finishedAt: string | null;
}

export interface TradeJustification {
  id: string;
  tradeId: string;
  criterioFechamentoContrario: boolean;
  criterioRompimentoReferencia: boolean;
  criterioMediaMudouDirecao: boolean;
  textoLivre: string | null;
  avaliacaoStatus: AvaliacaoIAStatus;
  avaliacaoErro: string | null;
  avaliacaoIA: string | null;
  criteriosConfirmadosIA: {
    fechamentoContrario: boolean | null;
    rompimentoReferencia: boolean | null;
    mediaMudouDirecao: boolean | null;
  } | null;
  gestaoRespeitada: boolean | null;
  scoreIA: number | null;
  avaliadoEm: string | null;
}

export interface SimulatedTrade {
  id: string;
  sessionId: string;
  strategyId: string | null;
  strategy?: Strategy | null;
  direction: TradeDirection;
  entryPrice: number;
  stopGain: number;
  stopLoss: number;
  entrySequenceIndex: number;
  exitSequenceIndex: number | null;
  exitPrice: number | null;
  result: TradeResult;
  createdAt: string;
  closedAt: string | null;
  justification?: TradeJustification | null;
}

export interface SessionView {
  session: TrainingSession;
  candles: Candle[];
  candlesRevealed: number;
  totalCandles: number;
  podeAvancar: boolean;
  trades: SimulatedTrade[];
}
