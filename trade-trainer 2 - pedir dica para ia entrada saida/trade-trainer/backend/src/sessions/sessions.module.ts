import { Module, forwardRef } from '@nestjs/common';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { CandlesModule } from '../candles/candles.module';
import { TradesModule } from '../trades/trades.module';

@Module({
  imports: [CandlesModule, forwardRef(() => TradesModule)],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
