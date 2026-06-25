import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class EvaluateTradeDto {
  @IsUUID()
  tradeId: string;

  @IsBoolean()
  criterioFechamentoContrario: boolean;

  @IsBoolean()
  criterioRompimentoReferencia: boolean;

  @IsBoolean()
  criterioMediaMudouDirecao: boolean;

  @IsOptional()
  @IsString()
  textoLivre?: string;
}