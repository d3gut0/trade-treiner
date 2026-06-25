import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Criando estratégias de exemplo...');

  await prisma.strategy.createMany({
    data: [
      {
        nome: 'Cruzamento EMA9/EMA21',
        descricao: 'Entrada quando EMA9 cruza EMA21 e o cruzamento e confirmado por fechamento de candle.',
        criterios: {
          indicadores: ['EMA9', 'EMA21'],
          regra: 'cruzamento',
          confirmacao: ['fechamento_contrario', 'media_mudou_direcao'],
        },
      },
      {
        nome: 'Pullback à VWAP',
        descricao: 'Preço retorna a VWAP em tendência e reage no toque, com fechamento a favor da tendência principal.',
        criterios: {
          indicadores: ['VWAP'],
          regra: 'pullback',
          confirmacao: ['fechamento_contrario', 'rompimento_referencia'],
        },
      },
      {
        nome: 'Reversão com 3 critérios completos',
        descricao: 'Só entra contra o movimento anterior se: fechamento contrário + rompimento de fundo/topo + EMA9 mudou de direção.',
        criterios: {
          indicadores: ['EMA9', 'EMA21'],
          regra: 'reversao_confirmada',
          confirmacao: [
            'fechamento_contrario',
            'rompimento_referencia',
            'media_mudou_direcao',
          ],
        },
      },
    ],
    skipDuplicates: true,
  });

  console.log('Pronto.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
