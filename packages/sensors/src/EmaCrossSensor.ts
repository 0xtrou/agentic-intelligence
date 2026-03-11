/**
 * @module EmaCrossSensor
 * @description Detects EMA crossover events as directional signals.
 *
 * Thesis: When the fast EMA crosses the slow EMA, it indicates
 * a shift in short-term momentum relative to the longer trend.
 *
 * This sensor fires:
 *   - fire=true, direction=LONG when fast crosses above slow (bullish)
 *   - fire=true, direction=SHORT when fast crosses below slow (bearish)
 *   - fire=false when no crossover detected
 */

import type { Candle, SensorVote, SignalDirection, Timeframe } from '@agentic-intelligence/core';
import type { CandleSensor } from './Sensor';
import { calculateEma, detectCrossover } from './ema';

/**
 * Configuration for EmaCrossSensor.
 */
export interface EmaCrossConfig {
  /** Fast EMA period (e.g., 9) */
  fastPeriod: number;
  /** Slow EMA period (e.g., 21) */
  slowPeriod: number;
}

/**
 * EMA crossover sensor implementation.
 *
 * Detects when a fast EMA crosses a slow EMA, signaling a potential
 * trend change or momentum shift.
 */
export class EmaCrossSensor implements CandleSensor {
  public readonly id: string;
  private readonly fastPeriod: number;
  private readonly slowPeriod: number;

  /**
   * Create a new EmaCrossSensor.
   *
   * @param id - Unique identifier for this sensor instance
   * @param config - EMA periods configuration
   * @throws Error if periods are invalid (< 1 or fast >= slow)
   */
  constructor(id: string, config: EmaCrossConfig) {
    if (config.fastPeriod < 1 || config.slowPeriod < 1) {
      throw new Error('EMA periods must be >= 1');
    }
    if (config.fastPeriod >= config.slowPeriod) {
      throw new Error('Fast period must be less than slow period');
    }

    this.id = id;
    this.fastPeriod = config.fastPeriod;
    this.slowPeriod = config.slowPeriod;
  }

  /**
   * Evaluate candles and detect EMA crossover.
   *
   * Requires at least slowPeriod + 1 candles to detect a crossover
   * (need slowPeriod for initial EMA calculation + 1 more to check for cross).
   *
   * @param candles - Array of OHLCV candles, ordered oldest to newest
   * @returns SensorVote with crossover detection result
   */
  evaluate(candles: Candle[]): SensorVote {
    // Validate input
    if (candles.length === 0) {
      return this.createVote(candles, false);
    }

    // Extract metadata from the most recent candle
    const latestCandle = candles[candles.length - 1];
    const symbol = latestCandle.symbol;
    const timeframe = latestCandle.timeframe;
    const timestamp = latestCandle.closeTime;

    // Need enough data to calculate both EMAs and detect a cross
    const minCandles = this.slowPeriod + 1;
    if (candles.length < minCandles) {
      return this.createVote(candles, false, symbol, timeframe, timestamp);
    }

    // Calculate both EMAs
    const fastEma = calculateEma(candles, this.fastPeriod);
    const slowEma = calculateEma(candles, this.slowPeriod);

    // Get the most recent EMA values for reporting
    const currentFastEma = fastEma[fastEma.length - 1];
    const currentSlowEma = slowEma[slowEma.length - 1];

    // Detect crossover
    const crossDirection = detectCrossover(fastEma, slowEma);

    if (crossDirection === null) {
      // No crossover detected
      return {
        sensorId: this.id,
        symbol,
        timeframe,
        fire: false,
        timestamp,
        data: {
          ema_fast: currentFastEma,
          ema_slow: currentSlowEma,
          fast_period: this.fastPeriod,
          slow_period: this.slowPeriod,
        },
      };
    }

    // Crossover detected
    return {
      sensorId: this.id,
      symbol,
      timeframe,
      fire: true,
      direction: crossDirection as SignalDirection,
      timestamp,
      data: {
        ema_fast: currentFastEma,
        ema_slow: currentSlowEma,
        fast_period: this.fastPeriod,
        slow_period: this.slowPeriod,
        cross_direction: crossDirection,
      },
    };
  }

  /**
   * Create a default vote (helper for early returns).
   */
  private createVote(
    candles: Candle[],
    fire: boolean,
    symbol = 'UNKNOWN',
    timeframe = '1h' as Timeframe,
    timestamp = Date.now()
  ): SensorVote {
    return {
      sensorId: this.id,
      symbol,
      timeframe,
      fire,
      timestamp,
      data: {
        fast_period: this.fastPeriod,
        slow_period: this.slowPeriod,
        candle_count: candles.length,
      },
    };
  }
}
