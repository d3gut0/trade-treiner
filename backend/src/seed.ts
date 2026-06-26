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
      {
        nome: 'Retorno à Média (EMA21)',
        descricao: 'Ativos em forte tendência tendem a se afastar da EMA21. A entrada ocorre no candle de reversão gatilho após o preço tocar/aproximar-se da média e fechar a favor da tendência.',
        criterios: {
          indicadores: ['EMA21'],
          regra: 'retorno_media',
          confirmacao: ['toque_media', 'fechamento_a_favor'],
        },
      },
      {
        nome: 'Rompimento de Pivô',
        descricao: 'Identificação de uma estrutura de alta ou baixa (pivô). A entrada é disparada no rompimento da cabeça do pivô (topo ou fundo anterior) com volume acima da média.',
        criterios: {
          indicadores: ['Volume'],
          regra: 'rompimento_pivo',
          confirmacao: ['rompimento_referencia', 'volume_acima_media'],
        },
      },
      {
        nome: 'IFR2 (Moneyness/Sobrevenda)',
        descricao: 'Estratégia baseada em matemática/estatística. Compra-se no fechamento quando o IFR de 2 períodos estiver abaixo de 10 (ativo muito sobrevendido) buscando a saída em 2 ou 3 dias na máxima dos dois últimos candles.',
        criterios: {
          indicadores: ['IFR2'],
          regra: 'sobrevenda_estatistica',
          confirmacao: ['ifr_abaixo_limite', 'fechamento_contrario'],
        },
      },
    ],
    skipDuplicates: true,
  });

  console.log('Pronto. Novas estratégias inseridas com sucesso!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });