import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { PrismaService } from '../prisma/prisma.service';
import { SaveJustificationDto } from './dto/save-justification.dto';
import {
  CRITERIA_CATALOG,
  CriterioDefinicao,
  resolveCriteriaForStrategy,
  getDefaultCriteria,
} from '../common/criteria-catalog';

// Quantos candles ANTES da entrada mandamos pra IA como contexto.
// Numero pequeno o suficiente pra manter o payload (e o custo) baixo,
// mas suficiente pra IA avaliar estrutura de movimento.
const CONTEXT_CANDLES_BEFORE_ENTRY = 12;

@Injectable()
export class EvaluationService {
  // publico para permitir health-check no controller (test-gemini),
  // sem precisar duplicar a logica de inicializacao do client
  public readonly ai: GoogleGenAI | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    this.ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
  }

  /**
   * Resolve a lista de criterios aplicaveis para a justificativa de um
   * trade, de acordo com a estrategia vinculada a ele. Usado pelo frontend
   * para montar os checkboxes dinamicamente, ANTES de salvar a justificativa.
   *
   * Se o trade nao tiver estrategia vinculada (ou a estrategia nao definir
   * criterios.confirmacao), cai no fallback generico (os 3 criterios
   * completos de reversao).
   */
  async getCriteriaForTrade(tradeId: string): Promise<CriterioDefinicao[]> {
    const trade = await this.prisma.simulatedTrade.findUnique({
      where: { id: tradeId },
      include: { strategy: true },
    });
    if (!trade) throw new NotFoundException('Entrada não encontrada.');

    if (!trade.strategy) {
      return getDefaultCriteria();
    }

    return resolveCriteriaForStrategy(trade.strategy.criterios);
  }

  /**
   * PASSO 1 do fluxo desacoplado: salva a justificativa do usuario
   * (criterios marcados + texto livre) SEM chamar a IA. O registro fica
   * com avaliacaoStatus = PENDENTE. A avaliacao por IA e disparada depois,
   * manualmente, via runAiEvaluation() - por exemplo quando o usuario
   * revisita o historico e decide avaliar aquele trade especifico.
   *
   * criteriosMarcados e dinamico - as chaves devem corresponder as
   * retornadas por getCriteriaForTrade() para este trade. Chaves que nao
   * existem no catalogo central sao ignoradas (nao quebram o salvamento,
   * mas tambem nao sao usadas na avaliacao por IA).
   */
  async saveJustification(dto: SaveJustificationDto) {
    const trade = await this.prisma.simulatedTrade.findUnique({
      where: { id: dto.tradeId },
    });
    if (!trade) throw new NotFoundException('Entrada não encontrada.');
    if (trade.result === 'EM_ANDAMENTO') {
      throw new BadRequestException(
        'A entrada ainda está em andamento - encerre-a (stop ou fim de sessão) antes de justificar.',
      );
    }

    return this.prisma.tradeJustification.upsert({
      where: { tradeId: dto.tradeId },
      create: {
        tradeId: dto.tradeId,
        criteriosMarcados: dto.criteriosMarcados as any,
        textoLivre: dto.textoLivre,
        avaliacaoStatus: 'PENDENTE',
      },
      update: {
        // permite o usuario editar a justificativa antes de avaliar
        criteriosMarcados: dto.criteriosMarcados as any,
        textoLivre: dto.textoLivre,
        // se o usuario editar uma justificativa que ja tinha sido avaliada,
        // os campos antigos de avaliacao da IA ficam mantidos ate ele decidir
        // reavaliar - nao apaga avaliacao previa so por editar o texto
      },
    });
  }

  /**
   * PASSO 2 do fluxo desacoplado: busca a justificativa JA SALVA de um
   * trade e dispara a avaliacao por IA agora. Pode ser chamado a qualquer
   * momento depois do saveJustification - inclusive dias depois, revisitando
   * o historico. Se a IA falhar, marca avaliacaoStatus = ERRO e guarda a
   * mensagem, sem perder a justificativa que ja estava salva.
   */
  async runAiEvaluation(tradeId: string) {
    const justification = await this.prisma.tradeJustification.findUnique({
      where: { tradeId },
    });
    if (!justification) {
      throw new NotFoundException(
        'Nenhuma justificativa salva para este trade ainda. Salve a justificativa antes de avaliar.',
      );
    }

    const trade = await this.prisma.simulatedTrade.findUnique({
      where: { id: tradeId },
      include: { session: true, strategy: true },
    });
    if (!trade) throw new NotFoundException('Entrada não encontrada.');

    const contextStart = Math.max(
      trade.session.startSequenceIndex,
      trade.entrySequenceIndex - CONTEXT_CANDLES_BEFORE_ENTRY,
    );
    const contextEnd = trade.exitSequenceIndex ?? trade.entrySequenceIndex;

    const candles = await this.prisma.historicalCandle.findMany({
      where: {
        assetId: trade.session.assetId,
        timeframe: trade.session.timeframe,
        sequenceIndex: { gte: contextStart, lte: contextEnd },
      },
      orderBy: { sequenceIndex: 'asc' },
    });

    const payload = this.buildNumericPayload(trade, candles);

    // resolve quais criterios sao aplicaveis a este trade (mesma logica de
    // getCriteriaForTrade), para o prompt saber os labels e validar as chaves
    const criteriaDefinitions = trade.strategy
      ? resolveCriteriaForStrategy(trade.strategy.criterios)
      : getDefaultCriteria();

    if (!this.ai) {
      return this.prisma.tradeJustification.update({
        where: { tradeId },
        data: {
          avaliacaoStatus: 'ERRO',
          avaliacaoErro: 'GEMINI_API_KEY não configurada no .env.',
        },
      });
    }

    try {
      const aiResult = await this.callGemini(payload, justification, criteriaDefinitions);

      return this.prisma.tradeJustification.update({
        where: { tradeId },
        data: {
          avaliacaoStatus: 'AVALIADO',
          avaliacaoErro: null,
          avaliacaoIA: aiResult.avaliacaoIA,
          criteriosConfirmadosIA: aiResult.criteriosConfirmadosIA as any,
          gestaoRespeitada: aiResult.gestaoRespeitada,
          scoreIA: aiResult.scoreIA,
          avaliadoEm: new Date(),
        },
      });
    } catch (err: any) {
      // Falha na chamada (rede, API key invalida, etc) - preserva a
      // justificativa, so marca o erro pra o usuario tentar de novo depois.
      await this.prisma.tradeJustification.update({
        where: { tradeId },
        data: {
          avaliacaoStatus: 'ERRO',
          avaliacaoErro: err.message ?? 'Erro desconhecido ao consultar a IA.',
        },
      });
      throw new BadRequestException(`Falha ao avaliar via Gemini: ${err.message}`);
    }
  }

  /**
   * Lista todos os trades com justificativa pendente de avaliacao por IA
   * (avaliacaoStatus = PENDENTE ou ERRO) - util pra uma tela de "fila de
   * avaliacao" no historico, onde o usuario escolhe quando avaliar.
   */
  async listPendingEvaluations() {
    return this.prisma.tradeJustification.findMany({
      where: { avaliacaoStatus: { in: ['PENDENTE', 'ERRO'] } },
      include: {
        trade: { include: { session: { include: { asset: true } }, strategy: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Gera (ou regenera) uma dica de coaching sobre timing de entrada/saida
   * para um trade especifico, considerando a estrategia vinculada (se
   * houver). Independente do fluxo de justificativa - pode ser chamado em
   * qualquer momento, mesmo sem o usuario ter justificado o trade ainda.
   *
   * Usa uma janela de candles maior que a avaliacao por criterios (mais
   * candles antes da entrada e depois da saida), porque a IA precisa de
   * espaco para identificar e comparar pontos alternativos de entrada/saida
   * que nao sejam os que o usuario de fato usou.
   */
  async getCoachingTip(tradeId: string) {
    const trade = await this.prisma.simulatedTrade.findUnique({
      where: { id: tradeId },
      include: { session: true, strategy: true },
    });
    if (!trade) throw new NotFoundException('Entrada não encontrada.');
    if (trade.result === 'EM_ANDAMENTO') {
      throw new BadRequestException(
        'A entrada ainda está em andamento - encerre-a antes de pedir uma dica.',
      );
    }

    const COACHING_CANDLES_BEFORE = 25;
    const COACHING_CANDLES_AFTER = 15;

    const windowStart = Math.max(
      trade.session.startSequenceIndex,
      trade.entrySequenceIndex - COACHING_CANDLES_BEFORE,
    );
    const exitRef = trade.exitSequenceIndex ?? trade.entrySequenceIndex;
    const windowEnd = Math.min(
      trade.session.endSequenceIndex,
      exitRef + COACHING_CANDLES_AFTER,
    );

    const candles = await this.prisma.historicalCandle.findMany({
      where: {
        assetId: trade.session.assetId,
        timeframe: trade.session.timeframe,
        sequenceIndex: { gte: windowStart, lte: windowEnd },
      },
      orderBy: { sequenceIndex: 'asc' },
    });

    const payload = this.buildNumericPayload(trade, candles);

    if (!this.ai) {
      return this.prisma.coachingTip.upsert({
        where: { tradeId },
        create: { tradeId, status: 'ERRO', erro: 'GEMINI_API_KEY não configurada no .env.' },
        update: { status: 'ERRO', erro: 'GEMINI_API_KEY não configurada no .env.' },
      });
    }

    try {
      const conteudo = await this.callGeminiCoaching(payload, trade.strategy?.nome ?? null);

      return this.prisma.coachingTip.upsert({
        where: { tradeId },
        create: {
          tradeId,
          status: 'GERADO',
          erro: null,
          conteudo: conteudo as any,
          geradoEm: new Date(),
        },
        update: {
          status: 'GERADO',
          erro: null,
          conteudo: conteudo as any,
          geradoEm: new Date(),
        },
      });
    } catch (err: any) {
      await this.prisma.coachingTip.upsert({
        where: { tradeId },
        create: {
          tradeId,
          status: 'ERRO',
          erro: err.message ?? 'Erro desconhecido ao consultar a IA.',
        },
        update: {
          status: 'ERRO',
          erro: err.message ?? 'Erro desconhecido ao consultar a IA.',
        },
      });
      throw new BadRequestException(`Falha ao gerar dica via Gemini: ${err.message}`);
    }
  }

  /**
   * Monta o payload SOMENTE com numeros (OHLC + indicadores) - sem imagem,
   * sem texto especulativo. Isso e o que torna a chamada barata e mais
   * confiavel para niveis de preco exatos.
   */
  private buildNumericPayload(trade: any, candles: any[]) {
    return {
      direction: trade.direction,
      entryPrice: trade.entryPrice,
      stopGain: trade.stopGain,
      stopLoss: trade.stopLoss,
      exitPrice: trade.exitPrice,
      result: trade.result,
      entrySequenceIndex: trade.entrySequenceIndex,
      exitSequenceIndex: trade.exitSequenceIndex,
      estrategiaVinculada: trade.strategy?.nome ?? null,
      candles: candles.map((c) => ({
        seq: c.sequenceIndex,
        o: c.open,
        h: c.high,
        l: c.low,
        c: c.close,
        ema9: c.ema9,
        ema21: c.ema21,
        vwap: c.vwap,
      })),
    };
  }

  /**
   * Avaliacao por criterios dinamicos: o prompt monta a lista de criterios
   * APLICAVEIS a este trade (resolvidos a partir da estrategia vinculada,
   * vindo de criteriaDefinitions), descreve cada um (label + descricao do
   * catalogo central), e avalia SOMENTE os que o usuario marcou como true em
   * justification.criteriosMarcados. Criterios nao marcados retornam null
   * ("nao avaliado"), nunca false por omissao.
   */
  private async callGemini(
    payload: ReturnType<EvaluationService['buildNumericPayload']>,
    justification: { criteriosMarcados: unknown; textoLivre: string | null },
    criteriaDefinitions: CriterioDefinicao[],
  ): Promise<{
    avaliacaoIA: string;
    criteriosConfirmadosIA: Record<string, boolean | null>;
    gestaoRespeitada: boolean;
    scoreIA: number;
  }> {
    const marcadosRaw = (justification.criteriosMarcados as Record<string, boolean>) ?? {};

    // filtra para considerar apenas chaves que SAO aplicaveis a esta
    // estrategia (evita que uma chave de uma estrategia antiga "vaze" para
    // uma avaliacao de estrategia diferente)
    const chavesAplicaveis = new Set(criteriaDefinitions.map((c) => c.chave));
    const criteriosMarcadosChaves = Object.entries(marcadosRaw)
      .filter(([chave, marcado]) => marcado === true && chavesAplicaveis.has(chave))
      .map(([chave]) => chave);

    const catalogoDescricao = criteriaDefinitions
      .map((c) => `- ${c.chave}: ${c.label}. ${c.descricao}`)
      .join('\n');

    const systemPrompt = `Você é um mentor objetivo de day trade, especializado em revisar disciplina de entrada e saída.
Você recebe dados NUMÉRICOS de candles (OHLC) e indicadores (EMA9, EMA21, VWAP), o trade que o usuário simulou,
a estratégia que ele vinculou (se houver) e a justificativa que ele deu. NÃO invente preços. Avalie estritamente
com base nos números fornecidos.

IMPORTANTE - REGRA DE ESCOPO DA AVALIAÇÃO:
Os critérios de confirmação são específicos da estratégia que o usuário vinculou ao trade - eles NÃO são um
checklist universal obrigatório para toda e qualquer entrada. Os critérios aplicáveis a ESTE trade específico,
de acordo com a estratégia vinculada (ou o padrão genérico se não houver estratégia), são:

${catalogoDescricao}

REGRAS PARA SUA AVALIAÇÃO:
- Avalie SOMENTE os critérios que aparecem na lista "criteriosQueOUsuarioMarcou" do prompt do usuário (usando a
  chave técnica exata). Para qualquer critério da lista de critérios aplicáveis acima que NÃO esteja em
  "criteriosQueOUsuarioMarcou", retorne null no campo correspondente de "criteriosConfirmadosIA" - não invente
  uma avaliação para um critério que o usuário nem alegou ter seguido.
- Se a lista de critérios marcados estiver vazia, não penalize a entrada por "não confirmar os critérios" -
  avalie a entrada apenas pela estratégia vinculada e pela justificativa em texto livre, de forma factual.
- O comentário em "avaliacaoIA" deve mencionar apenas os critérios relevantes ao que o usuário realmente alegou,
  nunca cobrar critérios que ele não disse estar usando.
- Use EXATAMENTE as mesmas chaves técnicas (ex: "fechamento_contrario", "cruzamento_confirmado") no objeto
  "criteriosConfirmadosIA" da sua resposta - não traduza, não invente chaves novas, não use os labels em
  português como chave.

Também avalie gestaoRespeitada: true se o resultado é coerente com stopGain/stopLoss definidos (ou seja, o usuário
não teria motivo aparente para ter alterado o stop no meio - isso é mais sobre se a estrutura do trade é coerente,
já que o stop é travado no sistema e não pode ser alterado).

Responda SOMENTE em JSON válido, sem markdown, sem texto fora do JSON, no formato exato:
{
  "avaliacaoIA": "string em português, 2 a 4 frases, comentário objetivo sobre os critérios que o usuário realmente alegou seguir - nunca cobre critérios não alegados",
  "criteriosConfirmadosIA": { "<chave_tecnica>": boolean ou null, ... } (uma entrada para cada critério aplicável listado acima, usando a chave técnica exata),
  "gestaoRespeitada": boolean,
  "scoreIA": number de 0 a 100 representando qualidade geral da decisão, considerando apenas o que o usuário alegou seguir
}`;

    const userPrompt = `DADOS DO TRADE:
${JSON.stringify(payload, null, 2)}

criteriosQueOUsuarioMarcou: ${JSON.stringify(criteriosMarcadosChaves)}
(esta é a lista de CHAVES TÉCNICAS que o usuário alega ter seguido - avalie SOMENTE estas; retorne null para as
demais chaves aplicáveis listadas no system prompt)

estrategiaVinculada: ${payload.estrategiaVinculada ?? '(nenhuma)'}

JUSTIFICATIVA EM TEXTO DO USUÁRIO:
"${justification.textoLivre ?? '(não informado)'}"

Avalie com base nos números dos candles se os critérios da lista "criteriosQueOUsuarioMarcou" realmente bateram,
e dê seu veredito. Não avalie critérios fora dessa lista.`;

    const response = await this.ai!.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: systemPrompt + '\n\n' + userPrompt }] }],
      config: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    });

    const raw = response.text ?? '{}';
    const parsed = JSON.parse(raw);

    const normalizeCriterio = (value: unknown): boolean | null =>
      value === true || value === false ? value : null;

    const criteriosConfirmadosIA: Record<string, boolean | null> = {};
    for (const def of criteriaDefinitions) {
      criteriosConfirmadosIA[def.chave] = normalizeCriterio(
        parsed.criteriosConfirmadosIA?.[def.chave],
      );
    }

    return {
      avaliacaoIA: parsed.avaliacaoIA ?? 'IA não retornou comentário.',
      criteriosConfirmadosIA,
      gestaoRespeitada: !!parsed.gestaoRespeitada,
      scoreIA: typeof parsed.scoreIA === 'number' ? parsed.scoreIA : 50,
    };
  }

  /**
   * Gera a dica de coaching sobre timing de entrada/saida. O prompt e
   * deliberadamente rigido para evitar respostas vagas tipo "espere mais
   * confirmacao" - toda sugestao precisa apontar um candle especifico (seq)
   * e justificar com numeros (preco, EMA9/21, VWAP), nunca com termos
   * genericos. Se a IA nao tiver uma alternativa numericamente melhor pra
   * apontar, ela deve dizer que a entrada/saida real já estava no ponto
   * adequado, em vez de inventar uma sugestao por obrigacao.
   */
  private async callGeminiCoaching(
    payload: ReturnType<EvaluationService['buildNumericPayload']>,
    estrategiaVinculada: string | null,
  ): Promise<{
    entradaIdeal: {
      sequenceIndex: number | null;
      justificativa: string;
      comparacaoComEntradaReal: 'CEDO_DEMAIS' | 'TARDE_DEMAIS' | 'NO_PONTO_CERTO';
    };
    saidaIdeal: {
      sequenceIndex: number | null;
      justificativa: string;
      comparacaoComSaidaReal: 'CEDO_DEMAIS' | 'TARDE_DEMAIS' | 'NO_PONTO_CERTO';
    };
    resumo: string;
  }> {
    const systemPrompt = `Você é um mentor técnico de day trade. Sua única tarefa é analisar o TIMING de entrada e
saída de UM trade específico já encerrado, e indicar se havia um ponto melhor para entrar e/ou sair, usando
APENAS os números de candles fornecidos (OHLC, EMA9, EMA21, VWAP). Você NUNCA opina sobre se a direção
(compra/venda) estava certa - isso já é fato consumado. Você foca só em SE o momento de entrar/sair poderia
ter sido mais cedo, mais tarde, ou já estava correto.

REGRA MAIS IMPORTANTE - PROIBIDO GENERALIZAR:
Toda sugestão de ponto melhor DEVE apontar o campo "seq" exato de um candle da lista fornecida, e justificar
citando os valores numéricos REAIS daquele candle (close, ema9, ema21, vwap, conforme disponíveis). Frases
genéricas como "espere mais confirmação", "aguarde o rompimento", "veja se a tendência se firma" são PROIBIDAS
sem um número e um "seq" concretos amarrados a elas. Se você não conseguir apontar um "seq" específico com
justificativa numérica clara, a resposta correta é dizer que o ponto usado já estava adequado (NO_PONTO_CERTO),
e não inventar uma alternativa vaga só para parecer útil.

CONTEXTO DA ANÁLISE - ADAPTE À ESTRATÉGIA USADA:
O campo "estrategiaVinculada" indica a lógica que o usuário disse estar seguindo neste trade (pode ser nula).
- Se for sobre cruzamento de médias (ex: "Cruzamento EMA9/EMA21"): avalie o timing comparando os valores de
  ema9 e ema21 candle a candle - identifique exatamente em qual "seq" o cruzamento ocorreu de fato, e compare
  com o "seq" em que o usuário entrou. Se ele entrou candles depois do cruzamento real, isso é TARDE_DEMAIS;
  se entrou antes do cruzamento se confirmar (ema9 ainda não cruzou claramente), isso é CEDO_DEMAIS.
- Se for sobre reversão/pullback ou não houver estratégia vinculada: avalie de forma factual olhando estrutura
  de preço (topos/fundos, fechamentos de força) e a inclinação das médias, sempre citando "seq" e valores.
- Nunca misture lógicas de estratégias diferentes na justificativa.

SOBRE A SAÍDA:
Avalie se o stopGain ou stopLoss definidos (que são fixos e não podem ser alterados nesse trade já encerrado)
combinavam com a estrutura do movimento. Se os candles APÓS a saída real mostram que o preço continuou na
mesma direção por vários candles antes de reverter, isso sugere que o stop gain poderia ter sido mais largo
(TARDE_DEMAIS na saída = saiu antes do necessário, deixou ganho na mesa). Se o preço reverteu rapidamente
contra a posição logo depois da entrada, isso sugere que o stop poderia ter sido mais curto, ou a entrada
mais cautelosa. Sempre cite o "seq" e os valores que sustentam essa leitura.

Esta dica é só para o usuário aprender para o PRÓXIMO trade - nunca sugira alterar o trade que já foi
encerrado, pois o stop já é histórico e imutável.

Responda SOMENTE em JSON válido, sem markdown, no formato exato:
{
  "entradaIdeal": {
    "sequenceIndex": number ou null (o "seq" do candle ideal, ou null se o ponto real já estava certo),
    "justificativa": "string em português citando valores numéricos concretos do candle apontado",
    "comparacaoComEntradaReal": "CEDO_DEMAIS" ou "TARDE_DEMAIS" ou "NO_PONTO_CERTO"
  },
  "saidaIdeal": {
    "sequenceIndex": number ou null,
    "justificativa": "string em português citando valores numéricos concretos",
    "comparacaoComSaidaReal": "CEDO_DEMAIS" ou "TARDE_DEMAIS" ou "NO_PONTO_CERTO"
  },
  "resumo": "string em português, 2 a 3 frases, fechamento prático e objetivo sobre o que aplicar no próximo trade"
}`;

    const userPrompt = `DADOS DO TRADE JÁ ENCERRADO:
${JSON.stringify(payload, null, 2)}

estrategiaVinculada: ${estrategiaVinculada ?? '(nenhuma - avalie de forma factual e genérica)'}

Analise o timing de entrada (entrySequenceIndex, entryPrice) e saída (exitSequenceIndex, exitPrice) usando
os candles fornecidos. Aponte pontos alternativos SOMENTE se houver um "seq" concreto e numericamente
justificável melhor que o usado. Se o ponto usado já era bom, diga isso claramente em vez de forçar uma
sugestão.`;

    const response = await this.ai!.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: systemPrompt + '\n\n' + userPrompt }] }],
      config: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    });

    const raw = response.text ?? '{}';
    const parsed = JSON.parse(raw);

    const normalizeComparacao = (value: unknown): 'CEDO_DEMAIS' | 'TARDE_DEMAIS' | 'NO_PONTO_CERTO' => {
      if (value === 'CEDO_DEMAIS' || value === 'TARDE_DEMAIS' || value === 'NO_PONTO_CERTO') return value;
      return 'NO_PONTO_CERTO';
    };

    return {
      entradaIdeal: {
        sequenceIndex:
          typeof parsed.entradaIdeal?.sequenceIndex === 'number'
            ? parsed.entradaIdeal.sequenceIndex
            : null,
        justificativa: parsed.entradaIdeal?.justificativa ?? 'Sem justificativa retornada.',
        comparacaoComEntradaReal: normalizeComparacao(parsed.entradaIdeal?.comparacaoComEntradaReal),
      },
      saidaIdeal: {
        sequenceIndex:
          typeof parsed.saidaIdeal?.sequenceIndex === 'number' ? parsed.saidaIdeal.sequenceIndex : null,
        justificativa: parsed.saidaIdeal?.justificativa ?? 'Sem justificativa retornada.',
        comparacaoComSaidaReal: normalizeComparacao(parsed.saidaIdeal?.comparacaoComSaidaReal),
      },
      resumo: parsed.resumo ?? 'IA não retornou um resumo.',
    };
  }
}
