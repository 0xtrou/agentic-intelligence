/**
 * @module trades.module
 * @description NestJS module for trades endpoints.
 *
 * Registers TradesController and TradesService.
 * Imports SignalsModule to access PaperTradingEngine.
 */

import { Module, forwardRef } from '@nestjs/common';
import { TradesController } from './trades.controller';
import { TradesService } from './trades.service';
import { SignalsModule } from '../signals/signals.module';

@Module({
  imports: [forwardRef(() => SignalsModule)],
  controllers: [TradesController],
  providers: [TradesService],
  exports: [TradesService],
})
export class TradesModule {}
