/*
  Warnings:

  - You are about to drop the column `criteriosMarcados` on the `TradeJustification` table. All the data in the column will be lost.
  - Made the column `criterioFechamentoContrario` on table `TradeJustification` required. This step will fail if there are existing NULL values in that column.
  - Made the column `criterioRompimentoReferencia` on table `TradeJustification` required. This step will fail if there are existing NULL values in that column.
  - Made the column `criterioMediaMudouDirecao` on table `TradeJustification` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "TradeJustification" DROP COLUMN "criteriosMarcados",
ALTER COLUMN "criterioFechamentoContrario" SET NOT NULL,
ALTER COLUMN "criterioRompimentoReferencia" SET NOT NULL,
ALTER COLUMN "criterioMediaMudouDirecao" SET NOT NULL;
