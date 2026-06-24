import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

export class EvaluateTradeDto {
  @IsUUID()
  tradeId: string;

  // Lista dinâmica de chaves de critérios marcados pelo usuário.
  // - Trade COM strategy vinculada: chaves vêm de strategy.criterios.confirmacao
  // - Trade SEM strategy (fallback): chaves esperadas são as 3 fixas de reversão
  //   ('fechamentoContrario', 'rompimentoReferencia', 'mediaMudouDirecao')
  @IsArray()
  @IsString({ each: true })
  criteriosMarcados: string[];

  @IsOptional()
  @IsString()
  textoLivre?: string;
}
