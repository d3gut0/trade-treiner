-- CreateEnum
CREATE TYPE "AvaliacaoIAStatus" AS ENUM ('PENDENTE', 'AVALIADO', 'ERRO');

-- AlterTable
ALTER TABLE "trade_justifications" ADD COLUMN     "avaliacaoErro" TEXT,
ADD COLUMN     "avaliacaoStatus" "AvaliacaoIAStatus" NOT NULL DEFAULT 'PENDENTE',
ADD COLUMN     "avaliadoEm" TIMESTAMP(3);
