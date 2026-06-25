import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CandlesService } from './candles.service';
import { FetchCandlesDto } from './dto/fetch-candles.dto';
import { Timeframe } from '@prisma/client';

@Controller('candles')
export class CandlesController {
  constructor(private readonly candlesService: CandlesService) {}

  // POST /candles/fetch  { ticker: "PETR4", timeframe: "M1", days: 5 }
  @Post('fetch')
  fetch(@Body() dto: FetchCandlesDto) {
    return this.candlesService.fetchAndStore(dto);
  }

  // GET /candles/assets
  @Get('assets')
  listAssets() {
    return this.candlesService.listAssets();
  }

  // GET /candles/count?assetId=...&timeframe=M1
  @Get('count')
  count(@Query('assetId') assetId: string, @Query('timeframe') timeframe: Timeframe) {
    return this.candlesService.countCandles(assetId, timeframe);
  }
}
