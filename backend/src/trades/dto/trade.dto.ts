import { IsEnum, IsNumber, IsOptional, IsUUID } from 'class-validator';
import { TradeDirection } from '@prisma/client';

export class OpenTradeDto {
  @IsUUID()
  sessionId: string;

  @IsEnum(TradeDirection)
  direction: TradeDirection;

  @IsNumber()
  entryPrice: number;

  @IsNumber()
  stopGain: number;

  @IsNumber()
  stopLoss: number;

  @IsOptional()
  @IsUUID()
  strategyId?: string;
}

export class CloseTradeManualDto {
  @IsNumber()
  exitPrice: number;
}
