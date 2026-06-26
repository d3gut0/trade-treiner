/*
  Warnings:

  - You are about to drop the column `criterioFechamentoContrario` on the `trade_justifications` table. All the data in the column will be lost.
  - You are about to drop the column `criterioMediaMudouDirecao` on the `trade_justifications` table. All the data in the column will be lost.
  - You are about to drop the column `criterioRompimentoReferencia` on the `trade_justifications` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "trade_justifications" DROP COLUMN "criterioFechamentoContrario",
DROP COLUMN "criterioMediaMudouDirecao",
DROP COLUMN "criterioRompimentoReferencia",
ADD COLUMN     "criteriosMarcados" JSONB NOT NULL DEFAULT '{}';
