import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { Timeframe } from '@prisma/client';

export class CreateSessionDto {
  @IsUUID()
  assetId: string;

  @IsEnum(Timeframe)
  timeframe: Timeframe;

  // numero fixo de candles que a sessao vai ter (ex: 30)
  @IsOptional()
  @IsInt()
  @Min(5)
  totalCandles?: number = 30;

  // se nao informado, o backend escolhe um trecho aleatorio do historico
  // disponivel, garantindo totalCandles consecutivos
  @IsOptional()
  @IsInt()
  startSequenceIndex?: number;
}
