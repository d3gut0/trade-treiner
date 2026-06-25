import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CandlesService } from '../candles/candles.service';
import { TradesService } from '../trades/trades.service';
import { CreateSessionDto } from './dto/create-session.dto';

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly candlesService: CandlesService,
    @Inject(forwardRef(() => TradesService))
    private readonly tradesService: TradesService,
  ) {}

  /**
   * Cria uma nova sessao de treino escolhendo uma janela de candles
   * historicos. Se startSequenceIndex nao for informado, escolhe um
   * trecho aleatorio dentro do historico disponivel - isso e o que
   * torna o treino "as cegas" (o usuario nao sabe qual dia/hora e).
   */
  async create(dto: CreateSessionDto) {
    const totalDisponivel = await this.candlesService.countCandles(
      dto.assetId,
      dto.timeframe,
    );

    // Minimo absoluto para a sessao ter sentido (pelo menos 30 candles
    // para o usuario ter algum espaco para observar antes de operar)
    const minCandles = 30;
    if (totalDisponivel < minCandles) {
      throw new BadRequestException(
        `Ativo só tem ${totalDisponivel} candles. Baixe mais histórico (timeframe menor ou mais dias).`,
      );
    }

    // Se startSequenceIndex nao for informado, sorteia um ponto de partida
    // que deixe espaco suficiente para o usuario operar a vontade
    // (reservamos ao menos 60 candles a frente).
    let startSequenceIndex = dto.startSequenceIndex;
    if (startSequenceIndex == null) {
      const maxStart = Math.max(0, totalDisponivel - 60);
      startSequenceIndex = Math.floor(Math.random() * (maxStart + 1));
    }

    // endSequenceIndex passa a ser o ultimo candle disponivel - sessao
    // de tempo aberto. O usuario encerra quando quiser.
    const endSequenceIndex = totalDisponivel - 1;
    const totalCandles = endSequenceIndex - startSequenceIndex + 1;

    const session = await this.prisma.trainingSession.create({
      data: {
        assetId: dto.assetId,
        timeframe: dto.timeframe,
        startSequenceIndex,
        endSequenceIndex,
        totalCandles,
        candlesRevealed: 1, // comeca mostrando so o primeiro candle
      },
    });

    return this.getSessionView(session.id);
  }

  /**
   * Retorna o estado atual da sessao: apenas os candles ja revelados
   * (nunca os futuros - isso e o que garante que o usuario nao "veja o futuro").
   */
  async getSessionView(sessionId: string) {
    const session = await this.findOrThrow(sessionId);

    const visibleEnd = session.startSequenceIndex + session.candlesRevealed - 1;

    const candles = await this.candlesService.getCandleWindow(
      session.assetId,
      session.timeframe,
      session.startSequenceIndex,
      visibleEnd,
    );

    const trades = await this.prisma.simulatedTrade.findMany({
      where: { sessionId },
      include: { justification: true, strategy: true, coachingTip: true },
      orderBy: { createdAt: 'asc' },
    });

    return {
      session,
      candles,
      candlesRevealed: session.candlesRevealed,
      totalCandles: session.totalCandles,
      podeAvancar: session.candlesRevealed < session.totalCandles,
      trades,
    };
  }

  /**
   * Avanca o replay manualmente em 1 candle (botao "proximo candle" no front).
   * Apos revelar, verifica automaticamente se ha uma entrada em andamento
   * cujo stop (gain ou loss) foi tocado pelo novo candle.
   */
  async revealNext(sessionId: string) {
    const session = await this.findOrThrow(sessionId);

    if (session.status === 'FINALIZADA') {
      throw new BadRequestException('Sessão já finalizada.');
    }

    if (session.candlesRevealed >= session.totalCandles) {
      await this.prisma.trainingSession.update({
        where: { id: sessionId },
        data: { status: 'FINALIZADA', finishedAt: new Date() },
      });
      throw new BadRequestException(
        'Todos os candles já foram revelados. Sessão finalizada.',
      );
    }

    const updated = await this.prisma.trainingSession.update({
      where: { id: sessionId },
      data: { candlesRevealed: session.candlesRevealed + 1 },
    });

    const novoSequenceIndex = updated.startSequenceIndex + updated.candlesRevealed - 1;
    const [novoCandle] = await this.candlesService.getCandleWindow(
      updated.assetId,
      updated.timeframe,
      novoSequenceIndex,
      novoSequenceIndex,
    );

    // verifica se ha trade em andamento e se o stop foi tocado no novo candle
    const tradeAberta = await this.prisma.simulatedTrade.findFirst({
      where: { sessionId, result: 'EM_ANDAMENTO' },
    });
    if (tradeAberta && novoCandle) {
      await this.tradesService.checkStopHit(
        tradeAberta.id,
        novoCandle.high,
        novoCandle.low,
        novoSequenceIndex,
      );
    }

    const sessaoEsgotada = updated.candlesRevealed >= updated.totalCandles;
    if (sessaoEsgotada) {
      // se ainda houver trade em andamento (stop nao tocado), fecha a mercado
      const aindaAberta = await this.prisma.simulatedTrade.findFirst({
        where: { sessionId, result: 'EM_ANDAMENTO' },
      });
      if (aindaAberta && novoCandle) {
        await this.tradesService.closeByTimeout(
          aindaAberta.id,
          novoCandle.close,
          novoSequenceIndex,
        );
      }

      await this.prisma.trainingSession.update({
        where: { id: sessionId },
        data: { status: 'FINALIZADA', finishedAt: new Date() },
      });
    }

    return this.getSessionView(sessionId);
  }

  async finishManually(sessionId: string) {
    await this.findOrThrow(sessionId);
    await this.prisma.trainingSession.update({
      where: { id: sessionId },
      data: { status: 'FINALIZADA', finishedAt: new Date() },
    });
    return this.getSessionView(sessionId);
  }

  async findOrThrow(sessionId: string) {
    const session = await this.prisma.trainingSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('Sessão de treino não encontrada.');
    return session;
  }

  async listAll() {
    return this.prisma.trainingSession.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        asset: true,
        trades: {
          include: {
            justification: true,
            strategy: true,
            coachingTip: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }
}
