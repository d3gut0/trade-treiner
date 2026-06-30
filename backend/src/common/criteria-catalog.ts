/**
 * Catalogo central de criterios de confirmacao de entrada possiveis.
 *
 * Cada estrategia (Strategy.criterios.confirmacao) referencia um subconjunto
 * destas chaves. A tela de justificativa monta os checkboxes dinamicamente
 * a partir da lista resolvida para a estrategia vinculada ao trade.
 *
 * Para adicionar um criterio novo: so adicionar uma entrada aqui e referenciar
 * a chave no campo `criterios.confirmacao` de uma Strategy (via seed ou
 * cadastro manual). Nao precisa alterar nenhuma logica de codigo.
 */

export interface CriterioDefinicao {
  chave: string;
  label: string;
  descricao: string;
}

export const CRITERIA_CATALOG: Record<string, CriterioDefinicao> = {
  fechamento_contrario: {
    chave: 'fechamento_contrario',
    label: 'O candle fechou no sentido contrário ao movimento anterior',
    descricao:
      'O corpo do candle (abertura->fechamento), não apenas o pavio, fecha na nova direção, ' +
      'superando o fechamento do candle anterior.',
  },
  rompimento_referencia: {
    chave: 'rompimento_referencia',
    label: 'O preço rompeu o último fundo/topo de referência',
    descricao:
      'O preço rompeu um nível de pivô validado por uma estrutura prévia de correção e novo ' +
      'teste - não é apenas o nível mais baixo/alto visível na tela.',
  },
  media_mudou_direcao: {
    chave: 'media_mudou_direcao',
    label: 'A média rápida (EMA9) realmente mudou de direção',
    descricao:
      'A EMA9 mudou de inclinação na direção da nova entrada - não apenas desacelerou.',
  },
  cruzamento_confirmado: {
    chave: 'cruzamento_confirmado',
    label: 'A EMA9 cruzou a EMA21 e o cruzamento foi confirmado por fechamento',
    descricao:
      'O cruzamento entre EMA9 e EMA21 ocorreu e o candle de entrada (ou o imediatamente ' +
      'anterior) fechou na direção do cruzamento, sem indecisão.',
  },
  toque_vwap_com_rejeicao: {
    chave: 'toque_vwap_com_rejeicao',
    label: 'O preço tocou a VWAP e reagiu a favor da tendência principal',
    descricao:
      'O preço retornou até a linha de VWAP durante uma tendência e o candle de toque mostrou ' +
      'rejeição (pavio na direção contrária ao toque, fechamento a favor da tendência).',
  },
  ifr_abaixo_limite: {
    chave: 'ifr_abaixo_limite',
    label: 'O IFR2 estava abaixo do limite de sobrevenda (ex: 10)',
    descricao:
      'O IFR2 (Índice de Força Relativa de 2 períodos) do candle de entrada estava abaixo do ' +
      'limite de sobrevenda estatística definido pela estratégia (tipicamente 10), indicando ' +
      'que o ativo caiu de forma anormalmente forte em relação ao seu próprio histórico recente.',
  },
};

/**
 * Resolve a lista de criterios aplicaveis para uma estrategia, na ordem
 * declarada em criterios.confirmacao. Chaves desconhecidas (que nao existem
 * no catalogo) sao ignoradas silenciosamente, para nao quebrar a tela caso
 * uma estrategia antiga referencie uma chave removida.
 */
export function resolveCriteriaForStrategy(
  strategyCriterios: unknown,
): CriterioDefinicao[] {
  const confirmacao = (strategyCriterios as any)?.confirmacao;
  if (!Array.isArray(confirmacao) || confirmacao.length === 0) {
    return getDefaultCriteria();
  }

  const resolved = confirmacao
    .map((chave: string) => CRITERIA_CATALOG[chave])
    .filter((def): def is CriterioDefinicao => !!def);

  // se nenhuma chave resolveu (todas desconhecidas), cai no fallback generico
  return resolved.length > 0 ? resolved : getDefaultCriteria();
}

/**
 * Fallback generico usado quando o trade nao tem estrategia vinculada,
 * ou quando a estrategia nao define criterios.confirmacao - os 3 criterios
 * completos de reversao (comportamento historico do produto).
 */
export function getDefaultCriteria(): CriterioDefinicao[] {
  return [
    CRITERIA_CATALOG.fechamento_contrario,
    CRITERIA_CATALOG.rompimento_referencia,
    CRITERIA_CATALOG.media_mudou_direcao,
  ];
}
