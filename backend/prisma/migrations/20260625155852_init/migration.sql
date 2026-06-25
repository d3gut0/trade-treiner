-- CreateEnum
CREATE TYPE "Timeframe" AS ENUM ('M1', 'M2', 'M5');

-- CreateEnum
CREATE TYPE "TradeDirection" AS ENUM ('COMPRA', 'VENDA');

-- CreateEnum
CREATE TYPE "TradeResult" AS ENUM ('GAIN', 'LOSS', 'ENCERRADO_TEMPO', 'ENCERRADO_MANUAL', 'EM_ANDAMENTO');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('EM_ANDAMENTO', 'FINALIZADA');

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "nome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historical_candles" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "timeframe" "Timeframe" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "open" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "volume" DOUBLE PRECISION NOT NULL,
    "ema9" DOUBLE PRECISION,
    "ema21" DOUBLE PRECISION,
    "vwap" DOUBLE PRECISION,
    "sequenceIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historical_candles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strategies" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "criterios" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strategies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_sessions" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "timeframe" "Timeframe" NOT NULL,
    "startSequenceIndex" INTEGER NOT NULL,
    "endSequenceIndex" INTEGER NOT NULL,
    "totalCandles" INTEGER NOT NULL,
    "candlesRevealed" INTEGER NOT NULL DEFAULT 1,
    "status" "SessionStatus" NOT NULL DEFAULT 'EM_ANDAMENTO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "training_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simulated_trades" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "strategyId" TEXT,
    "direction" "TradeDirection" NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "stopGain" DOUBLE PRECISION NOT NULL,
    "stopLoss" DOUBLE PRECISION NOT NULL,
    "entrySequenceIndex" INTEGER NOT NULL,
    "exitSequenceIndex" INTEGER,
    "exitPrice" DOUBLE PRECISION,
    "result" "TradeResult" NOT NULL DEFAULT 'EM_ANDAMENTO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "simulated_trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trade_justifications" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "criterioFechamentoContrario" BOOLEAN NOT NULL DEFAULT false,
    "criterioRompimentoReferencia" BOOLEAN NOT NULL DEFAULT false,
    "criterioMediaMudouDirecao" BOOLEAN NOT NULL DEFAULT false,
    "textoLivre" TEXT,
    "avaliacaoIA" TEXT,
    "criteriosConfirmadosIA" JSONB,
    "gestaoRespeitada" BOOLEAN,
    "scoreIA" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trade_justifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assets_ticker_key" ON "assets"("ticker");

-- CreateIndex
CREATE INDEX "historical_candles_assetId_timeframe_sequenceIndex_idx" ON "historical_candles"("assetId", "timeframe", "sequenceIndex");

-- CreateIndex
CREATE UNIQUE INDEX "historical_candles_assetId_timeframe_timestamp_key" ON "historical_candles"("assetId", "timeframe", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "trade_justifications_tradeId_key" ON "trade_justifications"("tradeId");

-- AddForeignKey
ALTER TABLE "historical_candles" ADD CONSTRAINT "historical_candles_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulated_trades" ADD CONSTRAINT "simulated_trades_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "training_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulated_trades" ADD CONSTRAINT "simulated_trades_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "strategies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_justifications" ADD CONSTRAINT "trade_justifications_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "simulated_trades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
