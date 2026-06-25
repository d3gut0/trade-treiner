import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { CandlesModule } from './candles/candles.module';
import { SessionsModule } from './sessions/sessions.module';
import { TradesModule } from './trades/trades.module';
import { EvaluationModule } from './evaluation/evaluation.module';
import { StrategiesModule } from './strategies/strategies.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Torna o .env disponível no app inteiro
    }),
    PrismaModule,
    CandlesModule,
    SessionsModule,
    TradesModule,
    EvaluationModule,
    StrategiesModule,
  ],
})
export class AppModule {}
