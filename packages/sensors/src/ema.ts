/**
 * @module ema
 * @description Exponential Moving Average calculation utilities.
 *
 * EMA gives more weight to recent prices, making it more responsive
 * to current market conditions than a simple moving average.
 */

import type { Candle } from '@agentic-intelligence/core';

/**
 * Calculate the Exponential Moving Average for a series of candle closes.
 *
 * Uses the standard EMA formula:
 *   EMA_today = close * multiplier + EMA_yesterday * (1 - multiplier)
 *   where multiplier = 2 / (period + 1)
 *
 * The first EMA value uses SMA (simple moving average) as the seed.
 *
 * @param candles - Array of Candle objects, ordered oldest to newest
 * @param period - Number of periods for the EMA (e.g., 9, 21, 50)
 * @returns Array of EMA values, same length as input (NaN for insufficient data)
 */
export function calculateEma(candles: Candle[], period: number): number[] {
  if (period < 1) {
    throw new Error(`EMA period must be >= 1, got ${period}`);
  }

  if (candles.length === 0) {
    return [];
  }

  const emaValues: number[] = new Array(candles.length);
  const multiplier = 2 / (period + 1);

  // Need at least 'period' candles to start calculating EMA
  if (candles.length < period) {
    return emaValues.fill(NaN);
  }

  // First EMA value is the SMA of the first 'period' candles
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += candles[i].close;
    emaValues[i] = NaN; // Not enough data for these early candles
  }
  emaValues[period - 1] = sum / period;

  // Calculate subsequent EMA values
  for (let i = period; i < candles.length; i++) {
    emaValues[i] = candles[i].close * multiplier + emaValues[i - 1] * (1 - multiplier);
  }

  return emaValues;
}

/**
 * Detect crossover between two EMA series at the most recent data point.
 *
 * A crossover occurs when:
 * - Bullish cross: fast was below slow, now fast is above slow
 * - Bearish cross: fast was above slow, now fast is below slow
 *
 * @param fastEma - Fast EMA series (e.g., 9-period)
 * @param slowEma - Slow EMA series (e.g., 21-period)
 * @returns 'LONG' for bullish cross, 'SHORT' for bearish cross, null for no cross
 */
export function detectCrossover(
  fastEma: number[],
  slowEma: number[]
): 'LONG' | 'SHORT' | null {
  if (fastEma.length < 2 || slowEma.length < 2) {
    return null;
  }

  if (fastEma.length !== slowEma.length) {
    throw new Error('EMA arrays must have the same length');
  }

  const currentIdx = fastEma.length - 1;
  const previousIdx = currentIdx - 1;

  // Check for valid (non-NaN) values
  const currentFast = fastEma[currentIdx];
  const previousFast = fastEma[previousIdx];
  const currentSlow = slowEma[currentIdx];
  const previousSlow = slowEma[previousIdx];

  if (
    isNaN(currentFast) ||
    isNaN(previousFast) ||
    isNaN(currentSlow) ||
    isNaN(previousSlow)
  ) {
    return null;
  }

  // Bullish crossover: fast was below, now above
  if (previousFast <= previousSlow && currentFast > currentSlow) {
    return 'LONG';
  }

  // Bearish crossover: fast was above, now below
  if (previousFast >= previousSlow && currentFast < currentSlow) {
    return 'SHORT';
  }

  return null;
}
