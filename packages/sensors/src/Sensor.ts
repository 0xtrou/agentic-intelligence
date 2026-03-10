/**
 * @module Sensor
 * @description Base interface for all market sensors.
 *
 * A sensor observes market data and produces a vote indicating whether
 * its hypothesis has triggered. Sensors are stateless — they receive
 * candles and return a vote. No persistence, no side effects.
 */

import type { Candle, SensorVote } from '@agentic-intelligence/core';

/**
 * Base interface for all sensors.
 *
 * A sensor encapsulates a single market hypothesis (e.g., "EMA crossover
 * signals trend change"). It evaluates market data and produces a vote.
 */
export interface Sensor {
  /**
   * Unique identifier for this sensor instance.
   */
  readonly id: string;

  /**
   * Evaluate market data and produce a vote.
   *
   * @param candles - Array of OHLCV candles, ordered oldest to newest.
   *                  Must contain sufficient data for the sensor's lookback period.
   * @returns SensorVote indicating whether the condition fired and the direction.
   */
  evaluate(candles: Candle[]): SensorVote;
}
