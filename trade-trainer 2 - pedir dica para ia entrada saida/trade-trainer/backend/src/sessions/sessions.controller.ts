import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  create(@Body() dto: CreateSessionDto) {
    return this.sessionsService.create(dto);
  }

  @Get()
  listAll() {
    return this.sessionsService.listAll();
  }

  @Get(':id')
  getView(@Param('id') id: string) {
    return this.sessionsService.getSessionView(id);
  }

  @Post(':id/next-candle')
  revealNext(@Param('id') id: string) {
    return this.sessionsService.revealNext(id);
  }

  @Post(':id/finish')
  finish(@Param('id') id: string) {
    return this.sessionsService.finishManually(id);
  }
}
