import { Body, Controller, Post } from '@nestjs/common';
import { EvaluationService } from './evaluation.service';
import { EvaluateTradeDto } from './dto/evaluate-trade.dto';

@Controller('evaluation')
export class EvaluationController {
  constructor(private readonly evaluationService: EvaluationService) {}

  // POST /evaluation
  @Post()
  evaluate(@Body() dto: EvaluateTradeDto) {
    return this.evaluationService.evaluate(dto);
  }
}
