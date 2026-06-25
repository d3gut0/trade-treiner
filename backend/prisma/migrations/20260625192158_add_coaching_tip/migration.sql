-- CreateEnum
CREATE TYPE "CoachingTipStatus" AS ENUM ('PENDENTE', 'GERADO', 'ERRO');

-- CreateTable
CREATE TABLE "coaching_tips" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "status" "CoachingTipStatus" NOT NULL DEFAULT 'PENDENTE',
    "erro" TEXT,
    "conteudo" JSONB,
    "geradoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coaching_tips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coaching_tips_tradeId_key" ON "coaching_tips"("tradeId");

-- AddForeignKey
ALTER TABLE "coaching_tips" ADD CONSTRAINT "coaching_tips_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "simulated_trades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
