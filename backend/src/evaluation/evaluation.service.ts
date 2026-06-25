
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai'; // <-- Novo SDK do Google
import { PrismaService } from '../prisma/prisma.service';
import { EvaluateTradeDto } from './dto/evaluate-trade.dto';

const CONTEXT_CANDLES_BEFORE_ENTRY = 12;

interface CriteriosConfirmadosIA {
  fechamentoContrario: boolean | null;
  rompimentoReferencia: boolean | null;
  mediaMudouDirecao: boolean | null;
}

@Injectable()
export class EvaluationService {
  // Alterado para o tipo do SDK do Google
  public readonly ai: GoogleGenAI | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    // Vamos usar a variável GEMINI_API_KEY no .env
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    this.ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
  }

  async evaluate(dto: EvaluateTradeDto) {
    const trade = await this.prisma.simulatedTrade.findUnique({
      where: { id: dto.tradeId },
      include: { session: true, strategy: true },
    });
    if (!trade) throw new NotFoundException('Entrada não encontrada.');
    if (trade.result === 'EM_ANDAMENTO') {
      throw new BadRequestException(
        'A entrada ainda está em andamento - encerre-a antes de justificar.',
      );
    }

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

    let avaliacaoIA: string;
    let criteriosConfirmadosIA: CriteriosConfirmadosIA;
    let gestaoRespeitada: boolean;
    let scoreIA: number;

    if (!this.ai) {
      const fallback = this.buildLocalFallback(dto);
      avaliacaoIA = fallback.avaliacaoIA;
      criteriosConfirmadosIA = fallback.criteriosConfirmadosIA;
      gestaoRespeitada = fallback.gestaoRespeitada;
      scoreIA = fallback.scoreIA;
    } {
      const aiResult = await this.callGemini(payload, dto);
      avaliacaoIA = aiResult.avaliacaoIA;
      criteriosConfirmadosIA = aiResult.criteriosConfirmadosIA;
      gestaoRespeitada = aiResult.gestaoRespeitada;
      scoreIA = aiResult.scoreIA;
    }

    const justification = await this.prisma.tradeJustification.upsert({
      where: { tradeId: dto.tradeId },
      create: {
        tradeId: dto.tradeId,
        criterioFechamentoContrario: dto.criterioFechamentoContrario,
        criterioRompimentoReferencia: dto.criterioRompimentoReferencia,
        criterioMediaMudouDirecao: dto.criterioMediaMudouDirecao,
        textoLivre: dto.textoLivre,
        avaliacaoIA,
        criteriosConfirmadosIA: criteriosConfirmadosIA as any,
        gestaoRespeitada,
        scoreIA,
      },
      update: {
        criterioFechamentoContrario: dto.criterioFechamentoContrario,
        criterioRompimentoReferencia: dto.criterioRompimentoReferencia,
        criterioMediaMudouDirecao: dto.criterioMediaMudouDirecao,
        textoLivre: dto.textoLivre,
        avaliacaoIA,
        criteriosConfirmadosIA: criteriosConfirmadosIA as any,
        gestaoRespeitada,
        scoreIA,
      },
    });

    return justification;
  }

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

  // Nova função para chamar a API do Gemini
  private async callGemini(
    payload: ReturnType<EvaluationService['buildNumericPayload']>,
    dto: EvaluateTradeDto,
  ): Promise<{
    avaliacaoIA: string;
    criteriosConfirmadosIA: CriteriosConfirmadosIA;
    gestaoRespeitada: boolean;
    scoreIA: number;
  }> {
    const criteriosMarcados: string[] = [];
    if (dto.criterioFechamentoContrario) criteriosMarcados.push('fechamentoContrario');
    if (dto.criterioRompimentoReferencia) criteriosMarcados.push('rompimentoReferencia');
    if (dto.criterioMediaMudouDirecao) criteriosMarcados.push('mediaMudouDirecao');

    const systemPrompt = `Você é um mentor objetivo de day trade, especializado em revisar disciplina de entrada e saída... [Mantenha seu Prompt do Sistema Exatamente Igual aqui]`;

    const userPrompt = `DADOS DO TRADE:
${JSON.stringify(payload, null, 2)}

criteriosQueOUsuarioMarcou: ${JSON.stringify(criteriosMarcados)}
estrategiaVinculada: ${payload.estrategiaVinculada ?? '(nenhuma)'}

JUSTIFICATIVA EM TEXTO DO USUÁRIO:
"${dto.textoLivre ?? '(não informado)'}"`;

    try {
      // Chamada usando o novo SDK 2026 unificado da Google Gen AI
      const response = await this.ai!.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: [
          { role: 'user', parts: [{ text: systemPrompt + '\n\n' + userPrompt }] }
        ],
        config: {
          temperature: 0.2,
          // Força o Gemini a responder estritamente em formato JSON
          responseMimeType: 'application/json',
        }
      });

      const raw = response.text ?? '{}';
      const parsed = JSON.parse(raw);

      const normalizeCriterio = (value: unknown): boolean | null =>
        value === true || value === false ? value : null;

      return {
        avaliacaoIA: parsed.avaliacaoIA ?? 'IA não retornou comentário.',
        criteriosConfirmadosIA: {
          fechamentoContrario: normalizeCriterio(parsed.criteriosConfirmadosIA?.fechamentoContrario),
          rompimentoReferencia: normalizeCriterio(parsed.criteriosConfirmadosIA?.rompimentoReferencia),
          mediaMudouDirecao: normalizeCriterio(parsed.criteriosConfirmadosIA?.mediaMudouDirecao),
        },
        gestaoRespeitada: !!parsed.gestaoRespeitada,
        scoreIA: typeof parsed.scoreIA === 'number' ? parsed.scoreIA : 50,
      };
    } catch (err: any) {
      console.error('Erro no Gemini:', err);
      throw new BadRequestException(`Falha ao avaliar via Gemini: ${err.message}`);
    }
  }

  private buildLocalFallback(dto: EvaluateTradeDto) {
    return {
      avaliacaoIA: '[GEMINI_API_KEY não configurada.]',
      criteriosConfirmadosIA: {
        fechamentoContrario: dto.criterioFechamentoContrario,
        rompimentoReferencia: dto.criterioRompimentoReferencia,
        mediaMudouDirecao: dto.criterioMediaMudouDirecao,
      },
      gestaoRespeitada: true,
      scoreIA: 0,
    };
  }
}

// import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
// import Groq from 'groq-sdk';
// import { PrismaService } from '../prisma/prisma.service';
// import { EvaluateTradeDto } from './dto/evaluate-trade.dto';
// import { ConfigService } from '@nestjs/config';

// // Quantos candles ANTES da entrada mandamos pra IA como contexto.
// // Numero pequeno o suficiente pra manter o payload (e o custo) baixo,
// // mas suficiente pra IA avaliar estrutura de movimento.
// const CONTEXT_CANDLES_BEFORE_ENTRY = 12;

// interface CriteriosConfirmadosIA {
//   fechamentoContrario: boolean | null;
//   rompimentoReferencia: boolean | null;
//   mediaMudouDirecao: boolean | null;
// }

// @Injectable()
// export class EvaluationService {
//   private readonly groq: Groq | null;

//   constructor(
//     private readonly prisma: PrismaService,
//     private readonly configService: ConfigService // <-- Injete aqui
//   ) {
//     // Busca a chave usando o configService de forma segura
//     const apiKey = this.configService.get<string>('GROQ_API_KEY');
//     this.groq = apiKey ? new Groq({ apiKey }) : null;
//   }

//   async evaluate(dto: EvaluateTradeDto) {
//     const trade = await this.prisma.simulatedTrade.findUnique({
//       where: { id: dto.tradeId },
//       include: { session: true, strategy: true },
//     });
//     if (!trade) throw new NotFoundException('Entrada não encontrada.');
//     if (trade.result === 'EM_ANDAMENTO') {
//       throw new BadRequestException(
//         'A entrada ainda está em andamento - encerre-a (stop ou fim de sessão) antes de justificar.',
//       );
//     }

//     // pega os candles de contexto: do inicio da sessao (ou N antes da entrada,
//     // o que for maior) até o candle de saida
//     const contextStart = Math.max(
//       trade.session.startSequenceIndex,
//       trade.entrySequenceIndex - CONTEXT_CANDLES_BEFORE_ENTRY,
//     );
//     const contextEnd = trade.exitSequenceIndex ?? trade.entrySequenceIndex;

//     const candles = await this.prisma.historicalCandle.findMany({
//       where: {
//         assetId: trade.session.assetId,
//         timeframe: trade.session.timeframe,
//         sequenceIndex: { gte: contextStart, lte: contextEnd },
//       },
//       orderBy: { sequenceIndex: 'asc' },
//     });

//     const payload = this.buildNumericPayload(trade, candles);

//     let avaliacaoIA: string;
//     let criteriosConfirmadosIA: CriteriosConfirmadosIA;
//     let gestaoRespeitada: boolean;
//     let scoreIA: number;

//     if (!this.groq) {
//       // sem API key configurada - retorna uma avaliacao basica local,
//       // mas deixa claro que a IA nao foi de fato consultada
//       const fallback = this.buildLocalFallback(dto);
//       avaliacaoIA = fallback.avaliacaoIA;
//       criteriosConfirmadosIA = fallback.criteriosConfirmadosIA;
//       gestaoRespeitada = fallback.gestaoRespeitada;
//       scoreIA = fallback.scoreIA;
//     } else {
//       const aiResult = await this.callGroq(payload, dto);
//       avaliacaoIA = aiResult.avaliacaoIA;
//       criteriosConfirmadosIA = aiResult.criteriosConfirmadosIA;
//       gestaoRespeitada = aiResult.gestaoRespeitada;
//       scoreIA = aiResult.scoreIA;
//     }

//     const justification = await this.prisma.tradeJustification.upsert({
//       where: { tradeId: dto.tradeId },
//       create: {
//         tradeId: dto.tradeId,
//         criterioFechamentoContrario: dto.criterioFechamentoContrario,
//         criterioRompimentoReferencia: dto.criterioRompimentoReferencia,
//         criterioMediaMudouDirecao: dto.criterioMediaMudouDirecao,
//         textoLivre: dto.textoLivre,
//         avaliacaoIA,
//         criteriosConfirmadosIA: criteriosConfirmadosIA as any,
//         gestaoRespeitada,
//         scoreIA,
//       },
//       update: {
//         criterioFechamentoContrario: dto.criterioFechamentoContrario,
//         criterioRompimentoReferencia: dto.criterioRompimentoReferencia,
//         criterioMediaMudouDirecao: dto.criterioMediaMudouDirecao,
//         textoLivre: dto.textoLivre,
//         avaliacaoIA,
//         criteriosConfirmadosIA: criteriosConfirmadosIA as any,
//         gestaoRespeitada,
//         scoreIA,
//       },
//     });

//     return justification;
//   }

//   /**
//    * Monta o payload SOMENTE com numeros (OHLC + indicadores) - sem imagem,
//    * sem texto especulativo. Isso e o que torna a chamada barata e mais
//    * confiavel para niveis de preco exatos.
//    */
//   private buildNumericPayload(trade: any, candles: any[]) {
//     return {
//       direction: trade.direction,
//       entryPrice: trade.entryPrice,
//       stopGain: trade.stopGain,
//       stopLoss: trade.stopLoss,
//       exitPrice: trade.exitPrice,
//       result: trade.result,
//       entrySequenceIndex: trade.entrySequenceIndex,
//       exitSequenceIndex: trade.exitSequenceIndex,
//       estrategiaVinculada: trade.strategy?.nome ?? null,
//       candles: candles.map((c) => ({
//         seq: c.sequenceIndex,
//         o: c.open,
//         h: c.high,
//         l: c.low,
//         c: c.close,
//         ema9: c.ema9,
//         ema21: c.ema21,
//         vwap: c.vwap,
//       })),
//     };
//   }

//   private async callGroq(
//     payload: ReturnType<EvaluationService['buildNumericPayload']>,
//     dto: EvaluateTradeDto,
//   ): Promise<{
//     avaliacaoIA: string;
//     criteriosConfirmadosIA: CriteriosConfirmadosIA;
//     gestaoRespeitada: boolean;
//     scoreIA: number;
//   }> {
//     const criteriosMarcados: string[] = [];
//     if (dto.criterioFechamentoContrario) criteriosMarcados.push('fechamentoContrario');
//     if (dto.criterioRompimentoReferencia) criteriosMarcados.push('rompimentoReferencia');
//     if (dto.criterioMediaMudouDirecao) criteriosMarcados.push('mediaMudouDirecao');

//     const systemPrompt = `Você é um mentor objetivo de day trade, especializado em revisar disciplina de entrada e saída.
// Você recebe dados NUMÉRICOS de candles (OHLC) e indicadores (EMA9, EMA21, VWAP), o trade que o usuário simulou,
// a estratégia que ele vinculou (se houver) e a justificativa que ele deu. NÃO invente preços. Avalie estritamente
// com base nos números fornecidos.

// IMPORTANTE - REGRA DE ESCOPO DA AVALIAÇÃO:
// O usuário tem 3 critérios pessoais de confirmação que ele usa especificamente para decidir ENTRADAS DE REVERSÃO
// (operar contra o movimento anterior, apostando que ele está virando). Esses critérios NÃO são um checklist
// universal obrigatório para toda e qualquer entrada - eles só fazem sentido quando o usuário está de fato tentando
// uma reversão.

// Os 3 critérios são:
// 1. fechamentoContrario: o candle de entrada (ou o candle imediatamente anterior) fechou no sentido contrário ao
//    movimento prévio, não apenas pavio.
// 2. rompimentoReferencia: o preço rompeu o último fundo/topo de referência visível na janela de candles fornecida.
// 3. mediaMudouDirecao: a EMA9 mudou de inclinação (não apenas desacelerou) na direção da nova entrada.

// REGRAS PARA SUA AVALIAÇÃO:
// - Avalie SOMENTE os critérios que aparecem na lista "criteriosQueOUsuarioMarcou" do prompt do usuário. Para
//   qualquer critério que NÃO esteja nessa lista, retorne null nesse campo de "criteriosConfirmadosIA" - não invente
//   uma avaliação para um critério que o usuário nem alegou ter seguido.
// - Se a lista de critérios marcados estiver vazia, ou se a estratégia vinculada (campo "estrategiaVinculada") for
//   claramente uma lógica diferente de reversão (ex: "Cruzamento EMA9/EMA21", "Pullback à VWAP", continuação de
//   tendência), NÃO penalize a entrada por "não confirmar os 3 critérios de reversão" - esse julgamento só se aplica
//   quando o próprio usuário está tentando uma reversão. Avalie a entrada pela lógica que ele de fato usou.
// - O comentário em "avaliacaoIA" deve mencionar apenas os critérios relevantes ao que o usuário realmente alegou
//   (critérios marcados e/ou estratégia vinculada), nunca cobrar critérios que ele não disse estar usando.

// Também avalie gestaoRespeitada: true se o resultado é coerente com stopGain/stopLoss definidos (ou seja, o usuário
// não teria motivo aparente para ter alterado o stop no meio - isso é mais sobre se a estrutura do trade é coerente,
// já que o stop é travado no sistema e não pode ser alterado).

// Responda SOMENTE em JSON válido, sem markdown, sem texto fora do JSON, no formato exato:
// {
//   "avaliacaoIA": "string em português, 2 a 4 frases, comentário objetivo sobre os critérios que o usuário realmente alegou seguir (marcados e/ou pela estratégia vinculada) - nunca cobre critérios não alegados",
//   "criteriosConfirmadosIA": { "fechamentoContrario": boolean ou null, "rompimentoReferencia": boolean ou null, "mediaMudouDirecao": boolean ou null },
//   "gestaoRespeitada": boolean,
//   "scoreIA": number de 0 a 100 representando qualidade geral da decisão, considerando apenas o que o usuário alegou seguir
// }`;

//     const userPrompt = `DADOS DO TRADE:
// ${JSON.stringify(payload, null, 2)}

// criteriosQueOUsuarioMarcou: ${JSON.stringify(criteriosMarcados)}
// (esta é a lista de critérios que o usuário alega ter seguido - avalie SOMENTE estes; retorne null para os demais)

// estrategiaVinculada: ${payload.estrategiaVinculada ?? '(nenhuma)'}

// JUSTIFICATIVA EM TEXTO DO USUÁRIO:
// "${dto.textoLivre ?? '(não informado)'}"

// Avalie com base nos números dos candles se os critérios da lista "criteriosQueOUsuarioMarcou" realmente bateram,
// e dê seu veredito. Não avalie critérios fora dessa lista.`;

//     try {
//       // const completion = await this.groq!.chat.completions.create({
//       //   model: 'llama3-70b-8192', // <-- Altere aqui também
//       //   messages: [
//       //     { role: 'system', content: systemPrompt },
//       //     { role: 'user', content: userPrompt },
//       //   ],
//       //   temperature: 0.2,
//       //   response_format: { type: 'json_object' },
//       // });

//       const completion = await this.groq!.chat.completions.create({
//         model: 'llama3-8b-8192', // <-- O modelo mais leve e imune a gargalos
//         messages: [
//           { role: 'user', content: 'OK' }
//         ],
//         temperature: 0.1,
//       });

//       const raw = completion.choices[0]?.message?.content ?? '{}';
//       const parsed = JSON.parse(raw);

//       const normalizeCriterio = (value: unknown): boolean | null =>
//         value === true || value === false ? value : null;

//       return {
//         avaliacaoIA: parsed.avaliacaoIA ?? 'IA não retornou comentário.',
//         criteriosConfirmadosIA: {
//           fechamentoContrario: normalizeCriterio(parsed.criteriosConfirmadosIA?.fechamentoContrario),
//           rompimentoReferencia: normalizeCriterio(parsed.criteriosConfirmadosIA?.rompimentoReferencia),
//           mediaMudouDirecao: normalizeCriterio(parsed.criteriosConfirmadosIA?.mediaMudouDirecao),
//         },
//         gestaoRespeitada: !!parsed.gestaoRespeitada,
//         scoreIA: typeof parsed.scoreIA === 'number' ? parsed.scoreIA : 50,
//       };
//     } catch (err: any) {
//       throw new BadRequestException(`Falha ao avaliar via Groq: ${err.message}`);
//     }
//   }

//   /**
//    * Fallback usado apenas se GROQ_API_KEY nao estiver configurada -
//    * evita quebrar o fluxo, mas deixa claro que nao houve avaliacao real de IA.
//    */
//   private buildLocalFallback(dto: EvaluateTradeDto) {
//     return {
//       avaliacaoIA:
//         '[GROQ_API_KEY não configurada - avaliação de IA não executada. Configure a variável de ambiente para avaliação real.]',
//       criteriosConfirmadosIA: {
//         fechamentoContrario: dto.criterioFechamentoContrario,
//         rompimentoReferencia: dto.criterioRompimentoReferencia,
//         mediaMudouDirecao: dto.criterioMediaMudouDirecao,
//       },
//       gestaoRespeitada: true,
//       scoreIA: 0,
//     };
//   }
// }
