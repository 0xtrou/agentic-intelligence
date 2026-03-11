/**
 * @module rsi
 * @description RSI (Relative Strength Index) calculation and divergence detection.
 *
 * RSI measures momentum on a 0-100 scale:
 * - RSI > 70 = overbought (potentially exhausted uptrend)
 * - RSI < 30 = oversold (potentially exhausted downtrend)
 *
 * Divergence occurs when price makes a new high/low but RSI doesn't confirm.
 */

import type { Candle } from '@agentic-intelligence/core';

/**
 * Calculate RSI (Relative Strength Index) for a series of candles.
 *
 * RSI formula:
 * 1. Calculate price changes (close[i] - close[i-1])
 * 2. Separate into gains (positive changes) and losses (negative changes)
 * 3. Calculate average gain and average loss over the period
 * 4. RS = avgGain / avgLoss
 * 5. RSI = 100 - (100 / (1 + RS))
 *
 * @param candles - Array of candles, ordered oldest to newest
 * @param period - RSI period (default 14)
 * @returns Array of RSI values (same length as candles, NaN for first `period` values)
 */
export function calculateRsi(candles: Candle[], period = 14): number[] {
  if (candles.length < period + 1) {
    return candles.map(() => NaN);
  }

  const rsiValues: number[] = [];
  const changes: number[] = [];

  // Calculate price changes
  for (let i = 1; i < candles.length; i++) {
    changes.push(candles[i].close - candles[i - 1].close);
  }

  // First RSI value uses simple average
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 0; i < period; i++) {
    const change = changes[i];
    if (change > 0) {
      avgGain += change;
    } else {
      avgLoss += Math.abs(change);
    }
  }

  avgGain /= period;
  avgLoss /= period;

  // First `period` values are NaN (not enough data)
  for (let i = 0; i < period; i++) {
    rsiValues.push(NaN);
  }

  // Calculate first RSI
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  rsiValues.push(100 - 100 / (1 + rs));

  // Subsequent RSI values use smoothed average (Wilder's smoothing)
  for (let i = period; i < changes.length; i++) {
    const change = changes[i];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    const currentRs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsiValues.push(100 - 100 / (1 + currentRs));
  }

  return rsiValues;
}

/**
 * Detect bearish divergence (price makes new high, RSI doesn't).
 *
 * Looks at the last 3 candles:
 * - Price makes a higher high
 * - RSI makes a lower high
 *
 * @param candles - Array of candles, ordered oldest to newest
 * @param rsiValues - RSI values (same length as candles)
 * @param lookbackBars - How many bars to look back for highs (default 10)
 * @returns true if bearish divergence detected
 */
export function detectBearishDivergence(
  candles: Candle[],
  rsiValues: number[],
  lookbackBars = 10
): boolean {
  if (candles.length < lookbackBars + 1 || rsiValues.length !== candles.length) {
    return false;
  }

  const recentCandles = candles.slice(-lookbackBars);
  const recentRsi = rsiValues.slice(-lookbackBars);

  // Find the highest price in recent candles
  const priceHighIndex = recentCandles.reduce(
    (maxIdx, candle, idx) =>
      candle.high > recentCandles[maxIdx].high ? idx : maxIdx,
    0
  );

  // Find the highest RSI in recent candles
  const rsiHighIndex = recentRsi.reduce(
    (maxIdx, rsi, idx) => (rsi > recentRsi[maxIdx] ? idx : maxIdx),
    0
  );

  // Bearish divergence: price high is more recent than RSI high
  // (price making new highs while RSI is declining)
  return priceHighIndex > rsiHighIndex && priceHighIndex >= lookbackBars - 3;
}

/**
 * Detect bullish divergence (price makes new low, RSI doesn't).
 *
 * Looks at the last 3 candles:
 * - Price makes a lower low
 * - RSI makes a higher low
 *
 * @param candles - Array of candles, ordered oldest to newest
 * @param rsiValues - RSI values (same length as candles)
 * @param lookbackBars - How many bars to look back for lows (default 10)
 * @returns true if bullish divergence detected
 */
export function detectBullishDivergence(
  candles: Candle[],
  rsiValues: number[],
  lookbackBars = 10
): boolean {
  if (candles.length < lookbackBars + 1 || rsiValues.length !== candles.length) {
    return false;
  }

  const recentCandles = candles.slice(-lookbackBars);
  const recentRsi = rsiValues.slice(-lookbackBars);

  // Find the lowest price in recent candles
  const priceLowIndex = recentCandles.reduce(
    (minIdx, candle, idx) =>
      candle.low < recentCandles[minIdx].low ? idx : minIdx,
    0
  );

  // Find the lowest RSI in recent candles
  const rsiLowIndex = recentRsi.reduce(
    (minIdx, rsi, idx) => (rsi < recentRsi[minIdx] ? idx : minIdx),
    0
  );

  // Bullish divergence: price low is more recent than RSI low
  // (price making new lows while RSI is rising)
  return priceLowIndex > rsiLowIndex && priceLowIndex >= lookbackBars - 3;
}
