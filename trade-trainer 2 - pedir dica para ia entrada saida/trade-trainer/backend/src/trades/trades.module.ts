import { Module, forwardRef } from '@nestjs/common';
import { TradesController } from './trades.controller';
import { TradesService } from './trades.service';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [forwardRef(() => SessionsModule)],
  controllers: [TradesController],
  providers: [TradesService],
  exports: [TradesService],
})
export class TradesModule {}
