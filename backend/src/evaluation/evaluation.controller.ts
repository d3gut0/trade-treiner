import { Controller, Post, Body, Get, BadRequestException } from '@nestjs/common';
import { EvaluationService } from './evaluation.service';
import { EvaluateTradeDto } from './dto/evaluate-trade.dto';

@Controller('evaluation')
export class EvaluationController {
  constructor(private readonly evaluationService: EvaluationService) {}

  // ROTA PRINCIPAL: Avalia o trade real montando histórico e salvando no Postgres
  @Post()
  async evaluate(@Body() dto: EvaluateTradeDto) {
    return this.evaluationService.evaluate(dto);
  }

  // HEALTH CHECK: Rota útil mantida para checar se a integração com o Google está online
  @Get('test-gemini')
  async testGemini() {
    const aiInstance = (this.evaluationService as any).ai;

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