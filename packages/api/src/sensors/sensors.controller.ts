/**
 * @module sensors.controller
 * @description HTTP endpoints for sensor lifecycle dashboard.
 *
 * Exposes Bayesian tracker state for monitoring sensor performance,
 * per-regime win rates, and lifecycle stages (probation/active/trusted/killed).
 */

import { Controller, Get } from '@nestjs/common';
import { BayesianTrackerService } from '../bayesian/bayesian-tracker.service';
import { credibleInterval } from '@agentic-intelligence/core';

@Controller('sensors')
export class SensorsController {
  constructor(private readonly bayesianTracker: BayesianTrackerService) {}

  /**
   * Get lifecycle state for all sensors across all regimes.
   *
   * Returns per-sensor, per-regime posteriors with:
   * - Lifecycle status (probation/active/trusted/killed)
   * - Win rate (mean + 80% CI)
   * - Sample count
   * - Distance to promotion/kill thresholds
   *
   * @returns Array of sensor lifecycle states
   */
  @Get('lifecycle')
  getLifecycleState() {
    const trackers = this.bayesianTracker.getAllTrackers();

    return {
      sensors: trackers.map((tracker) => {
        const ci = credibleInterval(tracker.posterior, 0.8);
        const mean = tracker.posterior.alpha / (tracker.posterior.alpha + tracker.posterior.beta);
        const n = tracker.tradeCount;

        // Distance to promotion (n=10, CI lower > 0.5)
        const samplesToPromotion = Math.max(0, 10 - n);
        const ciGapToPromotion = Math.max(0, 0.5 - ci.lower);

        // Distance to kill (n=20, CI lower <= 0.5)
        const samplesToKillCheck = Math.max(0, 20 - n);

        return {
          sensorId: tracker.sensorId,
          regime: tracker.regime,
          status: tracker.status,
          posterior: tracker.posterior,
          winRate: {
            mean: parseFloat((mean * 100).toFixed(2)),
            lower: parseFloat((ci.lower * 100).toFixed(2)),
            upper: parseFloat((ci.upper * 100).toFixed(2)),
          },
          tradeCount: n,
          thresholds: {
            samplesToPromotion,
            ciGapToPromotion: parseFloat((ciGapToPromotion * 100).toFixed(2)),
            samplesToKillCheck,
          },
          lastSignalTime: tracker.lastSignalTime,
          killedAt: tracker.killedAt,
          killedReason: tracker.killedReason,
        };
      }),
      summary: this.buildSummary(trackers),
    };
  }

  /**
   * Build high-level summary stats.
   */
  private buildSummary(trackers: any[]) {
    const byStatus = {
      probation: trackers.filter((t) => t.status === 'probation').length,
      active: trackers.filter((t) => t.status === 'active').length,
      trusted: trackers.filter((t) => t.status === 'trusted').length,
      killed: trackers.filter((t) => t.status === 'killed').length,
    };

    const totalTrades = trackers.reduce((sum, t) => sum + t.tradeCount, 0);

    return {
      totalTrackers: trackers.length,
      byStatus,
      totalTrades,
    };
  }
}
