/**
 * @module FundingRateSensor
 * @description Detects extreme funding rate conditions as mean-reversion signals.
 *
 * Thesis: When perpetual futures funding rate is extreme (beyond ±threshold),
 * one side of the market is crowded. Crowded positions mechanically unwind
 * as the cost of holding becomes unsustainable, producing a mean-reversion
 * opportunity in the opposite direction.
 *
 * This sensor fires:
 *   - fire=true, direction=SHORT when funding > +threshold (longs crowded, expect unwind)
 *   - fire=true, direction=LONG  when funding < -threshold (shorts crowded, expect squeeze)
 *   - fire=false when funding is within the neutral band
 *
 * Rate-of-change refinement:
 *   - If funding is extreme AND accelerating (getting more extreme), confidence is HIGH (1.0)
 *   - If funding is extreme but decelerating (already reverting), the sensor does NOT fire —
 *     the unwind is already underway and the edge is diminished.
 *
 * Regime gating: This sensor fires in ALL regimes (TRENDING and RANGING).
 * Funding rate extremes are structural (leverage imbalance), not pattern-based.
 */

import type { FundingRate, SensorVote, SignalDirection, Timeframe } from '@agentic-intelligence/core';
import { SignalDirection as Direction } from '@agentic-intelligence/core';
import type { Sensor } from './Sensor';

/**
 * Configuration for FundingRateSensor.
 */
export interface FundingRateConfig {
  /** Absolute funding rate threshold to consider "extreme" (default: 0.0005 = 0.05% per 8h) */
  threshold?: number;
  /** Number of recent funding periods to evaluate for rate-of-change (default: 3) */
  lookback?: number;
}

/** Default threshold: 0.05% per 8-hour funding interval */
const DEFAULT_THRESHOLD = 0.0005;

/** Default lookback: 3 recent funding periods */
const DEFAULT_LOOKBACK = 3;

/**
 * Funding rate extreme sensor implementation.
 *
 * Monitors perpetual futures funding rates and signals when one side
 * of the market is over-leveraged. Uses rate-of-change analysis to
 * distinguish between accelerating extremes (high conviction) and
 * already-reverting extremes (no signal).
 *
 * Implements a parallel interface to {@link Sensor} but accepts
 * {@link FundingRate}[] instead of Candle[], since funding rate
 * data is structurally different from OHLCV candle data.
 */
export class FundingRateSensor {
  public readonly id: string;
  private readonly threshold: number;
  private readonly lookback: number;

  /**
   * Create a new FundingRateSensor.
   *
   * @param id - Unique identifier for this sensor instance
   * @param config - Optional configuration overrides
   * @throws Error if threshold is not positive or lookback is less than 1
   */
  constructor(id: string, config: FundingRateConfig = {}) {
    const threshold = config.threshold ?? DEFAULT_THRESHOLD;
    const lookback = config.lookback ?? DEFAULT_LOOKBACK;

    if (threshold <= 0) {
      throw new Error('Threshold must be positive');
    }
    if (lookback < 1) {
      throw new Error('Lookback must be >= 1');
    }

    this.id = id;
    this.threshold = threshold;
    this.lookback = lookback;
  }

  /**
   * Evaluate funding rate data and produce a vote.
   *
   * Takes an array of {@link FundingRate} snapshots ordered oldest → newest.
   * Uses the most recent `lookback` entries to compute the average rate
   * and rate-of-change, then decides whether to fire.
   *
   * @param rates - Array of FundingRate snapshots, ordered oldest to newest.
   * @returns SensorVote indicating whether extreme funding was detected.
   */
  evaluate(rates: FundingRate[]): SensorVote {
    // Handle missing / empty input gracefully
    if (!rates || rates.length === 0) {
      return this.createNeutralVote('UNKNOWN', Date.now());
    }

    const latest = rates[rates.length - 1];
    const symbol = latest.symbol;
    const timestamp = latest.timestamp;

    // Slice the most recent `lookback` entries
    const window = rates.slice(-this.lookback);
    const currentRate = latest.rate;

    // Compute the average funding rate over the lookback window
    const avgRate = window.reduce((sum, r) => sum + r.rate, 0) / window.length;

    // Check if average funding is extreme
    const isExtremeLong = avgRate > this.threshold;   // longs crowded
    const isExtremeShort = avgRate < -this.threshold;  // shorts crowded

    if (!isExtremeLong && !isExtremeShort) {
      // Funding within neutral band — no signal
      return {
        sensorId: this.id,
        symbol,
        timeframe: '1h' as Timeframe,
        fire: false,
        timestamp,
        data: {
          funding_rate: currentRate,
          avg_funding_rate: avgRate,
          threshold: this.threshold,
          lookback: this.lookback,
          window_size: window.length,
        },
      };
    }

    // Rate-of-change analysis: is the extreme accelerating or reverting?
    const rateOfChange = this.computeRateOfChange(window);

    // Determine if funding is accelerating in the extreme direction
    // For positive extreme (longs crowded): accelerating = rateOfChange > 0
    // For negative extreme (shorts crowded): accelerating = rateOfChange < 0
    const isAccelerating = isExtremeLong
      ? rateOfChange > 0
      : rateOfChange < 0;

    // If extreme but already reverting (decelerating), don't fire —
    // the unwind is underway and our edge is gone
    if (!isAccelerating && window.length > 1) {
      return {
        sensorId: this.id,
        symbol,
        timeframe: '1h' as Timeframe,
        fire: false,
        timestamp,
        data: {
          funding_rate: currentRate,
          avg_funding_rate: avgRate,
          threshold: this.threshold,
          lookback: this.lookback,
          window_size: window.length,
          rate_of_change: rateOfChange,
          reason: 'extreme_but_reverting',
        },
      };
    }

    // Extreme AND accelerating (or single data point) → fire
    const direction: SignalDirection = isExtremeLong
      ? Direction.SHORT   // Longs crowded → mean-revert short
      : Direction.LONG;   // Shorts crowded → mean-revert long (squeeze)

    // Confidence: 1.0 when accelerating, 0.7 for single-point (no RoC data)
    const confidence = window.length > 1 ? 1.0 : 0.7;

    return {
      sensorId: this.id,
      symbol,
      timeframe: '1h' as Timeframe,
      fire: true,
      direction,
      confidence,
      timestamp,
      data: {
        funding_rate: currentRate,
        avg_funding_rate: avgRate,
        threshold: this.threshold,
        lookback: this.lookback,
        window_size: window.length,
        rate_of_change: rateOfChange,
        direction,
      },
    };
  }

  /**
   * Compute the rate of change of funding rates across the window.
   *
   * Uses simple linear slope: (last - first) / (n - 1).
   * Positive = rates increasing, negative = rates decreasing.
   *
   * @param window - Array of FundingRate snapshots (at least 1 element)
   * @returns Rate of change per period, or 0 if only one data point
   */
  private computeRateOfChange(window: FundingRate[]): number {
    if (window.length < 2) {
      return 0;
    }
    // Simple slope from first to last in the window
    return (window[window.length - 1].rate - window[0].rate) / (window.length - 1);
  }

  /**
   * Create a neutral (no-fire) vote for early-return cases.
   *
   * @param symbol - Trading pair symbol
   * @param timestamp - Vote timestamp
   * @returns SensorVote with fire=false
   */
  private createNeutralVote(symbol: string, timestamp: number): SensorVote {
    return {
      sensorId: this.id,
      symbol,
      timeframe: '1h' as Timeframe,
      fire: false,
      timestamp,
      data: {
        threshold: this.threshold,
        lookback: this.lookback,
        reason: 'no_data',
      },
    };
  }
}
