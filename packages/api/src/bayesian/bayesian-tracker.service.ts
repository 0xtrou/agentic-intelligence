/**
 * @module bayesian-tracker.service
 * @description Bayesian sensor lifecycle tracker with per-sensor, per-regime posteriors.
 *
 * Tracks sensor performance through lifecycle stages:
 * - Probation: n < 10 trades (collecting data)
 * - Active: n ≥ 10, EV > 0, lower 80% CI > 0.5 (validated)
 * - Trusted: n ≥ 30, stable performance (higher weight in brain)
 * - Killed: EV < 0 after n ≥ 20, or EV < -0.5R after n ≥ 10, or 60 days silent
 *
 * Traces to: #15 (edge lifecycle implementation), #13 (validation method)
 */

import { Injectable, Logger } from '@nestjs/common';
import { Trade, TradeOutcome, BayesianPosterior, MarketRegime } from '@agentic-intelligence/core';
import { updatePosterior, calculateCredibleInterval } from '@agentic-intelligence/core';

export enum SensorStatus {
  PROBATION = 'probation',
  ACTIVE = 'active',
  TRUSTED = 'trusted',
  KILLED = 'killed',
}

export interface SensorLifecycleState {
  sensorId: string;
  regime: MarketRegime;
  status: SensorStatus;
  posterior: BayesianPosterior;
  tradeCount: number;
  lastSignalTime: number | null;
  killedAt: number | null;
  killedReason: string | null;
}

@Injectable()
export class BayesianTrackerService {
  private readonly logger = new Logger(BayesianTrackerService.name);
  private trackers: Map<string, SensorLifecycleState> = new Map();

  /**
   * Get composite key for sensor + regime.
   */
  private getKey(sensorId: string, regime: MarketRegime): string {
    return `${sensorId}:${regime}`;
  }

  /**
   * Get or initialize tracker for a sensor in a specific regime.
   */
  private getTracker(sensorId: string, regime: MarketRegime): SensorLifecycleState {
    const key = this.getKey(sensorId, regime);
    let tracker = this.trackers.get(key);

    if (!tracker) {
      tracker = {
        sensorId,
        regime,
        status: SensorStatus.PROBATION,
        posterior: { alpha: 3, beta: 3 }, // Skeptical prior
        tradeCount: 0,
        lastSignalTime: null,
        killedAt: null,
        killedReason: null,
      };
      this.trackers.set(key, tracker);
      this.logger.log(`[Tracker Init] ${key} — starting in PROBATION`);
    }

    return tracker;
  }

  /**
   * Update tracker with a trade outcome and check lifecycle transitions.
   */
  updateWithTrade(
    sensorId: string,
    regime: MarketRegime,
    trade: Trade,
  ): { tracker: SensorLifecycleState; statusChanged: boolean; oldStatus: SensorStatus } {
    const tracker = this.getTracker(sensorId, regime);
    const oldStatus = tracker.status;

    // Don't update killed sensors
    if (tracker.status === SensorStatus.KILLED) {
      return { tracker, statusChanged: false, oldStatus };
    }

    // Skip BREAKEVEN trades
    if (!trade.outcome || trade.outcome === TradeOutcome.BREAKEVEN) {
      return { tracker, statusChanged: false, oldStatus };
    }

    // Update posterior
    const isWin = trade.outcome === TradeOutcome.WIN;
    tracker.posterior = updatePosterior(tracker.posterior, isWin);
    tracker.tradeCount++;
    tracker.lastSignalTime = Date.now();

    this.logger.log(
      `[Bayesian Update] ${this.getKey(sensorId, regime)} — ` +
      `${trade.outcome} (α=${tracker.posterior.alpha}, β=${tracker.posterior.beta}, n=${tracker.tradeCount})`
    );

    // Check lifecycle transitions
    const newStatus = this.checkLifecycleStatus(tracker);
    const statusChanged = newStatus !== oldStatus;

    if (statusChanged) {
      this.logger.log(`[Lifecycle] ${this.getKey(sensorId, regime)} — ${oldStatus} → ${newStatus}`);
      tracker.status = newStatus;
    }

    return { tracker, statusChanged, oldStatus };
  }

  /**
   * Determine lifecycle status based on current stats.
   */
  private checkLifecycleStatus(tracker: SensorLifecycleState): SensorStatus {
    const { alpha, beta } = tracker.posterior;
    const n = tracker.tradeCount;
    const mean = alpha / (alpha + beta);
    
    // Calculate 80% credible interval (conservative)
    const ci = calculateCredibleInterval(tracker.posterior, 0.8);

    // Kill conditions (from #15)
    if (n >= 20 && ci.lower < 0.5) {
      tracker.killedReason = `Lower 80% CI (${(ci.lower * 100).toFixed(1)}%) < 50% after ${n} trades`;
      return SensorStatus.KILLED;
    }

    if (n >= 10 && mean < 0.4) {
      tracker.killedReason = `Mean win rate (${(mean * 100).toFixed(1)}%) < 40% after ${n} trades`;
      return SensorStatus.KILLED;
    }

    // Promotion conditions
    if (n >= 30 && ci.lower > 0.5) {
      return SensorStatus.TRUSTED;
    }

    if (n >= 10 && ci.lower > 0.5) {
      return SensorStatus.ACTIVE;
    }

    return SensorStatus.PROBATION;
  }

  /**
   * Check for stale sensors (no signal in 60 days) and kill them.
   */
  checkStaleSensors(): SensorLifecycleState[] {
    const now = Date.now();
    const staleThresholdMs = 60 * 24 * 60 * 60 * 1000; // 60 days
    const killed: SensorLifecycleState[] = [];

    for (const tracker of this.trackers.values()) {
      if (tracker.status === SensorStatus.KILLED) continue;
      if (!tracker.lastSignalTime) continue;

      const ageMs = now - tracker.lastSignalTime;
      if (ageMs > staleThresholdMs) {
        tracker.status = SensorStatus.KILLED;
        tracker.killedAt = now;
        tracker.killedReason = `No signal in ${Math.floor(ageMs / (24 * 60 * 60 * 1000))} days`;
        killed.push(tracker);
        this.logger.warn(`[Lifecycle] ${this.getKey(tracker.sensorId, tracker.regime)} — KILLED (stale)`);
      }
    }

    return killed;
  }

  /**
   * Check if a sensor should fire in a given regime.
   */
  shouldFire(sensorId: string, regime: MarketRegime): boolean {
    const tracker = this.trackers.get(this.getKey(sensorId, regime));
    return !tracker || tracker.status !== SensorStatus.KILLED;
  }

  /**
   * Get all trackers for a sensor (across all regimes).
   */
  getSensorTrackers(sensorId: string): SensorLifecycleState[] {
    return Array.from(this.trackers.values()).filter(t => t.sensorId === sensorId);
  }

  /**
   * Get all trackers.
   */
  getAllTrackers(): SensorLifecycleState[] {
    return Array.from(this.trackers.values());
  }

  /**
   * Get tracker for a specific sensor + regime.
   */
  getTrackerByKey(sensorId: string, regime: MarketRegime): SensorLifecycleState | null {
    return this.trackers.get(this.getKey(sensorId, regime)) || null;
  }

  /**
   * Reset all trackers (for testing).
   */
  reset(): void {
    this.trackers.clear();
  }
}
