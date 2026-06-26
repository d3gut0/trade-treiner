import { IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * DTO para salvar a justificativa de um trade SEM chamar a IA.
 * A avaliação por IA é disparada depois, separadamente, via
 * POST /evaluation/:tradeId/run-ai-evaluation.
 *
 * criteriosMarcados e dinamico: as chaves dependem da estrategia vinculada
 * ao trade (ver common/criteria-catalog.ts e GET /evaluation/criteria/:tradeId).
 * Formato: { [chaveCriterio]: boolean }, ex: { "fechamento_contrario": true }
 */
export class SaveJustificationDto {
  @IsUUID()
  tradeId: string;

  @IsObject()
  criteriosMarcados: Record<string, boolean>;

  @IsOptional()
  @IsString()
  textoLivre?: string;
}
