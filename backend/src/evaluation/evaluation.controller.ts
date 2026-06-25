import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { EvaluationService } from './evaluation.service';
import { EvaluateTradeDto } from './dto/evaluate-trade.dto';

@Controller('evaluation')
export class EvaluationController {
  constructor(private readonly evaluationService: EvaluationService) { }

  // POST /evaluation
  @Post()
  evaluate(@Body() dto: EvaluateTradeDto) {
    return this.evaluationService.evaluate(dto);
  }

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

  // @Get('test-groq')
  // async testGroq() {
  //   // Acessa a instância privada do Groq criada no seu service
  //   const groqInstance = (this.evaluationService as any).groq;

  //   if (!groqInstance) {
  //     return {
  //       success: false,
  //       message: 'GROQ_API_KEY não está configurada ou não foi lida pelo NestJS.',
  //     };
  //   }

  //   try {
  //     // Teste com o modelo estável atualizado
  //     const completion = await groqInstance.chat.completions.create({
  //       model: 'llama-3.3-70b-specdec',
  //       messages: [
  //         { role: 'user', content: 'Responda apenas com a palavra: OK' }
  //       ],
  //       temperature: 0.1,
  //     });

  //     return {
  //       success: true,
  //       modelUsed: 'llama-3.3-70b-specdec',
  //       response: completion.choices[0]?.message?.content?.trim(),
  //     };
  //   } catch (err: any) {
  //     throw new BadRequestException({
  //       success: false,
  //       error: err.message,
  //       status: err.status,
  //       stack: err.stack,
  //     });
  //   }
  // }
}


