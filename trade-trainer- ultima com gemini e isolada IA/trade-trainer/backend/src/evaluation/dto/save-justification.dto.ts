import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * DTO para salvar a justificativa de um trade SEM chamar a IA.
 * A avaliação por IA é disparada depois, separadamente, via
 * POST /justifications/:tradeId/evaluate-ai (ver JustificationsController).
 */
export class SaveJustificationDto {
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
