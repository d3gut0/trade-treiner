import { IsObject, IsOptional, IsString } from 'class-validator';

export class CreateStrategyDto {
  @IsString()
  nome: string;

  @IsOptional()
  @IsString()
  descricao?: string;

  // estrutura livre, ex:
  // { indicadores: ["EMA9","EMA21"], regra: "cruzamento", confirmacao: ["fechamento_contrario","rompimento_referencia"] }
  @IsOptional()
  @IsObject()
  criterios?: Record<string, any>;
}

export class UpdateStrategyDto {
  @IsOptional()
  @IsString()
  nome?: string;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsObject()
  criterios?: Record<string, any>;
}
