/**
 * A dica de coaching nao recebe nenhum input do usuario alem do tradeId
 * (que vem na URL via @Param). Este arquivo documenta o formato esperado
 * da resposta da IA, para referencia.
 *
 * Formato esperado de retorno do CoachingTip:
 * {
 *   entradaIdeal: {
 *     sequenceIndex: number | null,   // candle onde a IA sugere que a entrada teria sido melhor
 *     justificativa: string,          // referencia numerica concreta (preco, EMA9/21, VWAP)
 *     comparacaoComEntradaReal: string, // cedo demais / tarde demais / no ponto certo
 *   },
 *   saidaIdeal: {
 *     sequenceIndex: number | null,   // candle onde a IA sugere que a saida teria sido melhor
 *     justificativa: string,
 *     comparacaoComSaidaReal: string,
 *   },
 *   resumo: string,  // 2-3 frases de fechamento, prático e objetivo
 * }
 */
export {};
