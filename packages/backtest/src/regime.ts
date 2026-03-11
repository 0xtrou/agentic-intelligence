/**
 * @module regime
 * @description Regime classification using ATR (Average True Range).
 *
 * Rule: ATR(14) > 1.5% of price = trending, else ranging.
 */

import type { Candle } from '@agentic-intelligence/core';
import type { Regime } from './types';

/** ATR period for regime classification */
const ATR_PERIOD = 14;

/** Threshold: ATR as percentage of price above which = trending */
const REGIME_THRESHOLD = 0.015; // 1.5%

/**
 * Calculate ATR (Average True Range) for a series of candles.
 *
 * True Range = max(high - low, |high - prevClose|, |low - prevClose|)
 * ATR = SMA of True Range over period
 *
 * @param candles - Array of candles, oldest to newest
 * @param period - ATR period (default 14)
 * @returns Array of ATR values (NaN for first `period` values)
 */
export function calculateAtr(candles: Candle[], period: number = ATR_PERIOD): number[] {
  if (candles.length < period + 1) {
    return candles.map(() => NaN);
  }

  const trValues: number[] = [NaN]; // First candle has no previous close

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trValues.push(tr);
  }

  const atrValues: number[] = [];

  // Fill NaN for insufficient data
  for (let i = 0; i < period; i++) {
    atrValues.push(NaN);
  }

  // First ATR = SMA of first `period` true ranges (starting from index 1)
  let sum = 0;
  for (let i = 1; i <= period; i++) {
    sum += trValues[i];
  }
  atrValues.push(sum / period);

  // Subsequent ATR uses Wilder's smoothing
  for (let i = period + 1; i < candles.length; i++) {
    const prevAtr = atrValues[atrValues.length - 1];
    atrValues.push((prevAtr * (period - 1) + trValues[i]) / period);
  }

  return atrValues;
}

/**
 * Classify the regime at a given candle index.
 *
 * @param candles - Full candle array
 * @param atrValues - Pre-calculated ATR values
 * @param index - Index of the candle to classify
 * @param threshold - ATR/price threshold (default 1.5%)
 * @returns 'trending' or 'ranging'
 */
export function classifyRegime(
  candles: Candle[],
  atrValues: number[],
  index: number,
  threshold: number = REGIME_THRESHOLD
): Regime {
  const atr = atrValues[index];
  const price = candles[index].close;

  if (isNaN(atr) || price === 0) {
    return 'ranging'; // Default to ranging when insufficient data
  }

  const atrPercent = atr / price;
  return atrPercent > threshold ? 'trending' : 'ranging';
}

export { ATR_PERIOD, REGIME_THRESHOLD };
