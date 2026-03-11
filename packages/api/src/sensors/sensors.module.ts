/**
 * @module sensors.module
 * @description NestJS module for sensor lifecycle dashboard endpoints.
 */

import { Module } from '@nestjs/common';
import { SensorsController } from './sensors.controller';
import { BayesianModule } from '../bayesian/bayesian.module';

@Module({
  imports: [BayesianModule],
  controllers: [SensorsController],
})
export class SensorsModule {}
