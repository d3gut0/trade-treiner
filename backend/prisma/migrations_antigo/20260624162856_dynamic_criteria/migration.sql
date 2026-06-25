/*
  Warnings:

  - You are about to drop the `trade_justifications` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "trade_justifications" DROP CONSTRAINT "trade_justifications_tradeId_fkey";

-- DropTable
DROP TABLE "trade_justifications";

-- CreateTable
CREATE TABLE "TradeJustification" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "criterioFechamentoContrario" BOOLEAN,
    "criterioRompimentoReferencia" BOOLEAN,
    "criterioMediaMudouDirecao" BOOLEAN,
    "criteriosMarcados" JSONB,
    "criteriosConfirmadosIA" JSONB,
    "textoLivre" TEXT,
    "avaliacaoIA" TEXT,
    "gestaoRespeitada" BOOLEAN,
    "scoreIA" INTEGER,

    CONSTRAINT "TradeJustification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TradeJustification_tradeId_key" ON "TradeJustification"("tradeId");

-- AddForeignKey
ALTER TABLE "TradeJustification" ADD CONSTRAINT "TradeJustification_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "simulated_trades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
