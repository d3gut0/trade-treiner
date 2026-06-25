import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { CandlesModule } from './candles/candles.module';
import { SessionsModule } from './sessions/sessions.module';
import { TradesModule } from './trades/trades.module';
import { EvaluationModule } from './evaluation/evaluation.module';
import { StrategiesModule } from './strategies/strategies.module';

@Module({
  imports: [
    // isGlobal: true - precisa vir antes/junto dos outros modulos para que
    // ConfigService esteja disponivel via DI em qualquer service (ex:
    // EvaluationService le GEMINI_API_KEY do .env)
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CandlesModule,
    SessionsModule,
    TradesModule,
    EvaluationModule,
    StrategiesModule,
  ],
})
export class AppModule {}
