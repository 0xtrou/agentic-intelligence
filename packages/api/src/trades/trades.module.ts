/**
 * @module trades.module
 * @description NestJS module for trades endpoints.
 *
 * Registers TradesController and TradesService.
 */

import { Module } from '@nestjs/common';
import { TradesController } from './trades.controller';
import { TradesService } from './trades.service';

@Module({
  controllers: [TradesController],
  providers: [TradesService],
  exports: [TradesService], // Export for use in other modules (e.g., signals)
})
export class TradesModule {}
