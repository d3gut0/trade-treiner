import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { TradesService } from './trades.service';
import { OpenTradeDto, CloseTradeManualDto } from './dto/trade.dto';
import { PrismaService } from '../prisma/prisma.service';

@Controller('trades')
export class TradesController {
  constructor(
    private readonly tradesService: TradesService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  open(@Body() dto: OpenTradeDto) {
    return this.tradesService.open(dto);
  }

  @Get('session/:sessionId')
  findBySession(@Param('sessionId') sessionId: string) {
    return this.tradesService.findBySession(sessionId);
  }

  // retorna os candles ao redor do trade, para re-renderizar o grafico
  // exatamente como estava na hora da decisao (sem precisar de print)
  @Get(':id/chart-context')
  getChartContext(@Param('id') id: string) {
    return this.tradesService.getChartContext(id);
  }

  // fecha manualmente uma entrada em andamento, usando o sequenceIndex
  // do candle atualmente revelado na sessao
  @Post(':id/close')
  async closeManual(@Param('id') id: string, @Body() dto: CloseTradeManualDto) {
    const trade = await this.tradesService.findOrThrow(id);
    const session = await this.prisma.trainingSession.findUnique({
      where: { id: trade.sessionId },
    });
    const currentSequenceIndex =
      (session?.startSequenceIndex ?? 0) + (session?.candlesRevealed ?? 1) - 1;
    return this.tradesService.closeManual(id, dto, currentSequenceIndex);
  }
}
