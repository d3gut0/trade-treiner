import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpenTradeDto, CloseTradeManualDto } from './dto/trade.dto';

@Injectable()
export class TradesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Abre uma entrada simulada. Validamos a coerencia logica do stop:
   * - COMPRA: stopGain > entryPrice > stopLoss
   * - VENDA:  stopGain < entryPrice < stopLoss
   *
   * Uma vez criado, stopGain/stopLoss NUNCA sao alterados (nao existe
   * endpoint de update neles) - isso e a regra de gestao de risco travada
   * que o usuario pediu.
   */
  async open(dto: OpenTradeDto) {
    const session = await this.prisma.trainingSession.findUnique({
      where: { id: dto.sessionId },
    });
    if (!session) throw new NotFoundException('Sessão não encontrada.');
    if (session.status === 'FINALIZADA') {
      throw new BadRequestException('Sessão já finalizada - não é possível abrir novas entradas.');
    }

    const existeAberta = await this.prisma.simulatedTrade.findFirst({
      where: { sessionId: dto.sessionId, result: 'EM_ANDAMENTO' },
    });
    if (existeAberta) {
      throw new BadRequestException(
        'Já existe uma entrada em andamento nesta sessão. Feche-a antes de abrir outra.',
      );
    }

    this.validateStopCoherence(dto);

    const entrySequenceIndex =
      session.startSequenceIndex + session.candlesRevealed - 1;

    return this.prisma.simulatedTrade.create({
      data: {
        sessionId: dto.sessionId,
        direction: dto.direction,
        entryPrice: dto.entryPrice,
        stopGain: dto.stopGain,
        stopLoss: dto.stopLoss,
        strategyId: dto.strategyId,
        entrySequenceIndex,
        result: 'EM_ANDAMENTO',
      },
    });
  }

  /**
   * Verifica se o stop foi tocado no candle atual (chamado automaticamente
   * apos cada "next-candle" do replay, via SessionsService no controller
   * ou pelo front ao receber a view atualizada).
   *
   * high >= stopGain ou low <= stopLoss (para COMPRA), e o inverso pra VENDA.
   */
  async checkStopHit(tradeId: string, candleHigh: number, candleLow: number, sequenceIndex: number) {
    const trade = await this.prisma.simulatedTrade.findUnique({ where: { id: tradeId } });
    if (!trade || trade.result !== 'EM_ANDAMENTO') return trade;

    let hitPrice: number | null = null;
    let result: 'GAIN' | 'LOSS' | null = null;

    if (trade.direction === 'COMPRA') {
      if (candleHigh >= trade.stopGain) {
        hitPrice = trade.stopGain;
        result = 'GAIN';
      } else if (candleLow <= trade.stopLoss) {
        hitPrice = trade.stopLoss;
        result = 'LOSS';
      }
    } else {
      // VENDA
      if (candleLow <= trade.stopGain) {
        hitPrice = trade.stopGain;
        result = 'GAIN';
      } else if (candleHigh >= trade.stopLoss) {
        hitPrice = trade.stopLoss;
        result = 'LOSS';
      }
    }

    if (result && hitPrice != null) {
      return this.prisma.simulatedTrade.update({
        where: { id: tradeId },
        data: {
          result,
          exitPrice: hitPrice,
          exitSequenceIndex: sequenceIndex,
          closedAt: new Date(),
        },
      });
    }

    return trade;
  }

  async closeManual(tradeId: string, dto: CloseTradeManualDto, sequenceIndex: number) {
    const trade = await this.findOrThrow(tradeId);
    if (trade.result !== 'EM_ANDAMENTO') {
      throw new BadRequestException('Esta entrada já foi encerrada.');
    }

    return this.prisma.simulatedTrade.update({
      where: { id: tradeId },
      data: {
        result: 'ENCERRADO_MANUAL',
        exitPrice: dto.exitPrice,
        exitSequenceIndex: sequenceIndex,
        closedAt: new Date(),
      },
    });
  }

  /**
   * Chamado quando a sessao acaba (tempo/candles esgotados) com uma
   * entrada ainda em andamento - fecha a mercado no ultimo preco visivel.
   */
  async closeByTimeout(tradeId: string, lastClosePrice: number, sequenceIndex: number) {
    const trade = await this.findOrThrow(tradeId);
    if (trade.result !== 'EM_ANDAMENTO') return trade;

    return this.prisma.simulatedTrade.update({
      where: { id: tradeId },
      data: {
        result: 'ENCERRADO_TEMPO',
        exitPrice: lastClosePrice,
        exitSequenceIndex: sequenceIndex,
        closedAt: new Date(),
      },
    });
  }

  async findOrThrow(tradeId: string) {
    const trade = await this.prisma.simulatedTrade.findUnique({ where: { id: tradeId } });
    if (!trade) throw new NotFoundException('Entrada não encontrada.');
    return trade;
  }

  async findBySession(sessionId: string) {
    return this.prisma.simulatedTrade.findMany({
      where: { sessionId },
      include: { justification: true, strategy: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  private validateStopCoherence(dto: OpenTradeDto) {
    if (dto.direction === 'COMPRA') {
      if (!(dto.stopGain > dto.entryPrice && dto.stopLoss < dto.entryPrice)) {
        throw new BadRequestException(
          'Para COMPRA: stop gain deve ser maior que o preço de entrada, e stop loss menor.',
        );
      }
    } else {
      if (!(dto.stopGain < dto.entryPrice && dto.stopLoss > dto.entryPrice)) {
        throw new BadRequestException(
          'Para VENDA: stop gain deve ser menor que o preço de entrada, e stop loss maior.',
        );
      }
    }
  }
}
