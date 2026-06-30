import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Criando estratégias de exemplo...');

  await prisma.strategy.createMany({
    data: [
      {
        nome: 'Cruzamento EMA9/EMA21',
        descricao:
          'Entrada quando EMA9 cruza EMA21 e o cruzamento e confirmado por fechamento de candle.',
        criterios: {
          indicadores: ['EMA9', 'EMA21'],
          regra: 'cruzamento',
          // chave unica e mais precisa para esse caso especifico (cruzamento
          // + fechamento de confirmacao), em vez de combinar 2 criterios
          // genericos que descreviam a mesma coisa de forma indireta
          confirmacao: ['cruzamento_confirmado'],
        },
      },
      {
        nome: 'Pullback à VWAP',
        descricao:
          'Preço retorna a VWAP em tendência e reage no toque, com fechamento a favor da tendência principal.',
        criterios: {
          indicadores: ['VWAP'],
          regra: 'pullback',
          // chave unica que ja descreve toque + rejeicao a favor da tendencia,
          // mais precisa que combinar fechamento_contrario + rompimento_referencia
          confirmacao: ['toque_vwap_com_rejeicao'],
        },
      },
      {
        nome: 'Reversão com 3 critérios completos',
        descricao:
          'Só entra contra o movimento anterior se: fechamento contrário + rompimento de fundo/topo + EMA9 mudou de direção.',
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
      {
        nome: 'IFR2 (Mean Reversion/Sobrevenda)',
        descricao:
          'Estratégia baseada em matemática/estatística (Larry Connors). Compra-se no fechamento ' +
          'quando o IFR de 2 períodos estiver abaixo de 10 (ativo muito sobrevendido), buscando a ' +
          'saída em 2 ou 3 dias na máxima dos dois últimos candles.',
        criterios: {
          indicadores: ['IFR2'],
          regra: 'sobrevenda_estatistica',
          confirmacao: ['ifr_abaixo_limite', 'fechamento_contrario'],
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
