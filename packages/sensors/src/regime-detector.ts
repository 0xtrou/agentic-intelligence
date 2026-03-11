/**
 * @module regime-detector
 * @description Per-timeframe regime detection using ATR (Average True Range).
 *
 * Backtests showed fixed 1.5% threshold misclassifies daily+ timeframes as
 * trending because crypto ATR naturally scales with candle duration.
 *
 * Traces to: #14 (regime determines meaning — threshold must match timeframe)
 */

import type { Candle, Timeframe } from '@agentic-intelligence/core';
import { MarketRegime } from '@agentic-intelligence/core';

/** ATR period for regime classification */
export const ATR_PERIOD = 14;

/**
 * Per-timeframe ATR threshold map.
 * ATR as fraction of price above which regime = TRENDING.
 *
 * Rationale (from backtest data):
 * - 4h: 1.5% — baseline, validated in original backtest
 * - 1d: 3.0% — daily crypto ATR naturally ~2-3%; only extreme = trending
 * - 1w: 5.0% — weekly swings need higher bar
 * - 1M: 8.0% — monthly requires significant macro move
 */
export const REGIME_THRESHOLDS: ReadonlyMap<string, number> = new Map<string, number>([
  ['4h', 0.015],   // 1.5%
  ['1d', 0.030],   // 3.0%
  ['1w', 0.050],   // 5.0%
  ['1M', 0.080],   // 8.0%
]);

/** Default threshold when timeframe not in map */
export const DEFAULT_THRESHOLD = 0.015; // 1.5%

/**
 * Get the regime threshold for a given timeframe.
 *
 * @param timeframe - Candle timeframe
 * @returns ATR/price threshold (fraction, not percentage)
 */
export function getRegimeThreshold(timeframe: Timeframe | string): number {
  return REGIME_THRESHOLDS.get(timeframe) ?? DEFAULT_THRESHOLD;
}

/**
 * Calculate ATR (Average True Range) for a series of candles.
 *
 * True Range = max(high - low, |high - prevClose|, |low - prevClose|)
 * ATR = Wilder's smoothed average over period.
 *
 * @param candles - Array of candles, oldest to newest
 * @param period - ATR period (default 14)
 * @returns ATR value for the most recent candle, or NaN if insufficient data
 */
export function calculateAtr(candles: Candle[], period: number = ATR_PERIOD): number {
  if (candles.length < period + 1) {
    return NaN;
  }

  // Calculate true range values (skip first candle — no previous close)
  const trValues: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose),
    );
    trValues.push(tr);
  }

  // First ATR = SMA of first `period` true ranges
  let atr = 0;
  for (let i = 0; i < period; i++) {
    atr += trValues[i];
  }
  atr /= period;

  // Wilder's smoothing for remaining values
  for (let i = period; i < trValues.length; i++) {
    atr = (atr * (period - 1) + trValues[i]) / period;
  }

  return atr;
}

/**
 * Detect the market regime from candle data with timeframe-appropriate thresholds.
 *
 * @param candles - Array of candles, oldest to newest (need at least ATR_PERIOD + 1)
 * @param timeframe - Candle timeframe (determines ATR threshold)
 * @returns MarketRegime.TRENDING or MarketRegime.RANGING (or UNKNOWN if insufficient data)
 */
export function detectRegime(candles: Candle[], timeframe: Timeframe | string = '4h'): MarketRegime {
  if (candles.length < ATR_PERIOD + 1) {
    return MarketRegime.UNKNOWN;
  }

  const atr = calculateAtr(candles, ATR_PERIOD);
  const currentPrice = candles[candles.length - 1].close;

  if (isNaN(atr) || currentPrice === 0) {
    return MarketRegime.UNKNOWN;
  }

  const atrFraction = atr / currentPrice;
  const threshold = getRegimeThreshold(timeframe);

  return atrFraction > threshold ? MarketRegime.TRENDING : MarketRegime.RANGING;
}
