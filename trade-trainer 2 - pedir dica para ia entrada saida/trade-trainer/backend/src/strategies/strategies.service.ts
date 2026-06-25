import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStrategyDto, UpdateStrategyDto } from './dto/strategy.dto';

@Injectable()
export class StrategiesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateStrategyDto) {
    return this.prisma.strategy.create({ data: dto });
  }

  findAll() {
    return this.prisma.strategy.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { trades: true } } },
    });
  }

  async findOne(id: string) {
    const strategy = await this.prisma.strategy.findUnique({ where: { id } });
    if (!strategy) throw new NotFoundException('Estratégia não encontrada.');
    return strategy;
  }

  async update(id: string, dto: UpdateStrategyDto) {
    await this.findOne(id);
    return this.prisma.strategy.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.strategy.delete({ where: { id } });
  }

  /**
   * Estatisticas de uma estrategia: quantos trades usaram ela, taxa de
   * acerto (GAIN / total fechados), e media de score de IA quando houver.
   */
  async getStats(id: string) {
    await this.findOne(id);

    const trades = await this.prisma.simulatedTrade.findMany({
      where: { strategyId: id },
      include: { justification: true },
    });

    const fechados = trades.filter((t) => t.result === 'GAIN' || t.result === 'LOSS');
    const gains = fechados.filter((t) => t.result === 'GAIN').length;
    const losses = fechados.filter((t) => t.result === 'LOSS').length;
    const taxaAcerto = fechados.length > 0 ? (gains / fechados.length) * 100 : null;

    const scores = trades
      .map((t) => t.justification?.scoreIA)
      .filter((s): s is number => typeof s === 'number');
    const mediaScoreIA =
      scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

    return {
      totalTrades: trades.length,
      gains,
      losses,
      taxaAcerto,
      mediaScoreIA,
    };
  }
}
