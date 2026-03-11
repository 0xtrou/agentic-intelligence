/**
 * @module bayesian.module
 * @description NestJS module for Bayesian sensor lifecycle tracking.
 */

import { Module } from '@nestjs/common';
import { BayesianTrackerService } from './bayesian-tracker.service';

@Module({
  providers: [BayesianTrackerService],
  exports: [BayesianTrackerService],
})
export class BayesianModule {}
