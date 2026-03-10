/**
 * @module app.module
 * @description Root NestJS application module.
 *
 * Imports all feature modules and registers controllers.
 */

import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { SignalsModule } from './signals/signals.module';

@Module({
  imports: [SignalsModule],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
