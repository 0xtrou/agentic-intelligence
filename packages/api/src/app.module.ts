/**
 * @module app.module
 * @description Root NestJS application module.
 *
 * Imports all feature modules and registers controllers.
 */

import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { SignalsModule } from './signals/signals.module';
import { TradesModule } from './trades/trades.module';

@Module({
  imports: [SignalsModule, TradesModule],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
