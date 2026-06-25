import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Timeframe } from '@prisma/client';

export class FetchCandlesDto {
  @IsString()
  ticker: string; // ex: PETR4, VALE3 (sem .SA - o backend adiciona)

  @IsEnum(Timeframe)
  timeframe: Timeframe;

  // quantos dias de historico baixar (yahoo-finance2 limita intraday a ~60 dias)
  @IsOptional()
  @IsInt()
  @Min(1)
  days?: number = 5;
}
