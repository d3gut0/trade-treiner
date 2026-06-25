import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { StrategiesService } from './strategies.service';
import { CreateStrategyDto, UpdateStrategyDto } from './dto/strategy.dto';

@Controller('strategies')
export class StrategiesController {
  constructor(private readonly strategiesService: StrategiesService) {}

  @Post()
  create(@Body() dto: CreateStrategyDto) {
    return this.strategiesService.create(dto);
  }

  @Get()
  findAll() {
    return this.strategiesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.strategiesService.findOne(id);
  }

  @Get(':id/stats')
  getStats(@Param('id') id: string) {
    return this.strategiesService.getStats(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateStrategyDto) {
    return this.strategiesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.strategiesService.remove(id);
  }
}
