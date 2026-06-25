import { Body, Controller, Get, Param, Post, BadRequestException } from '@nestjs/common';
import { EvaluationService } from './evaluation.service';
import { SaveJustificationDto } from './dto/save-justification.dto';

@Controller('evaluation')
export class EvaluationController {
  constructor(private readonly evaluationService: EvaluationService) {}

  // PASSO 1: salva a justificativa (criterios + texto) SEM chamar a IA.
  // Substitui o antigo POST /evaluation que fazia tudo de uma vez.
  @Post('justification')
  saveJustification(@Body() dto: SaveJustificationDto) {
    return this.evaluationService.saveJustification(dto);
  }

  // PASSO 2: dispara a avaliacao por IA para um trade que ja tem
  // justificativa salva. Pode ser chamado na hora ou dias depois,
  // revisitando o historico.
  @Post(':tradeId/run-ai-evaluation')
  runAiEvaluation(@Param('tradeId') tradeId: string) {
    return this.evaluationService.runAiEvaluation(tradeId);
  }

  // Lista justificativas pendentes ou com erro de avaliacao - alimenta
  // uma "fila de avaliacao" no historico.
  @Get('pending')
  listPending() {
    return this.evaluationService.listPendingEvaluations();
  }

  // Gera (ou regenera) uma dica de coaching sobre timing de entrada/saida
  // para um trade especifico. Independente do fluxo de justificativa -
  // pode ser chamado em qualquer momento.
  @Post(':tradeId/coaching-tip')
  getCoachingTip(@Param('tradeId') tradeId: string) {
    return this.evaluationService.getCoachingTip(tradeId);
  }

  // HEALTH CHECK: checa se a integracao com o Gemini esta online,
  // sem tocar no banco.
  @Get('test-gemini')
  async testGemini() {
    const aiInstance = this.evaluationService.ai;

    if (!aiInstance) {
      return { success: false, message: 'GEMINI_API_KEY não encontrada no .env.' };
    }

    try {
      const response = await aiInstance.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: 'Responda apenas com a palavra: OK',
      });

      return {
        success: true,
        modelUsed: 'gemini-2.5-flash',
        response: response.text?.trim(),
      };
    } catch (err: any) {
      throw new BadRequestException({ success: false, error: err.message });
    }
  }
}
