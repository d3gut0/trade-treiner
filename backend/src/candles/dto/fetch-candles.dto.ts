import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Timeframe } from '@prisma/client';

export enum Mercado {
  B3 = 'B3',
  CRIPTO = 'CRIPTO',
}

export class FetchCandlesDto {
  @IsString()
  ticker: string; // B3: ex "PETR4" (sem .SA, backend adiciona)
                   // CRIPTO: ex "BTC", "ETH" (sem -USD, backend adiciona)

  @IsEnum(Timeframe)
  timeframe: Timeframe;

  @IsEnum(Mercado)
  @IsOptional()
  mercado?: Mercado = Mercado.B3;

  // quantos dias de historico baixar (yahoo-finance2 limita intraday a ~60 dias)
  @IsOptional()
  @IsInt()
  @Min(1)
  days?: number = 5;
}