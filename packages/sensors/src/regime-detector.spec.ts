/**
 * @module regime-detector.spec
 * @description Tests for per-timeframe regime detection.
 *
 * Validates that each timeframe uses its own ATR threshold and that
 * the same candle data can classify differently across timeframes.
 */

import { describe, it, expect } from 'vitest';
import { MarketRegime } from '@agentic-intelligence/core';
import type { Candle } from '@agentic-intelligence/core';
import {
  detectRegime,
  calculateAtr,
  getRegimeThreshold,
  REGIME_THRESHOLDS,
  DEFAULT_THRESHOLD,
  ATR_PERIOD,
} from './regime-detector';

/**
 * Helper: generate candles with controlled volatility.
 * Price oscillates around `basePrice` with `atrPercent` of price as range.
 */
function makeCandles(
  count: number,
  basePrice: number,
  atrPercent: number,
): Candle[] {
  const halfRange = (basePrice * atrPercent) / 2;
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const open = basePrice;
    const high = basePrice + halfRange;
    const low = basePrice - halfRange;
    const close = basePrice + (i % 2 === 0 ? halfRange * 0.1 : -halfRange * 0.1);
    candles.push({
      symbol: 'BTCUSDT',
      timeframe: '4h',
      openTime: 1700000000000 + i * 14400000,
      closeTime: 1700000000000 + (i + 1) * 14400000,
      open,
      high,
      low,
      close,
      volume: 1000,
    });
  }
  return candles;
}

describe('getRegimeThreshold', () => {
  it('returns 1.5% for 4h', () => {
    expect(getRegimeThreshold('4h')).toBe(0.015);
  });

  it('returns 3.0% for 1d', () => {
    expect(getRegimeThreshold('1d')).toBe(0.030);
  });

  it('returns 5.0% for 1w', () => {
    expect(getRegimeThreshold('1w')).toBe(0.050);
  });

  it('returns 8.0% for 1M', () => {
    expect(getRegimeThreshold('1M')).toBe(0.080);
  });

  it('returns default 1.5% for unknown timeframes', () => {
    expect(getRegimeThreshold('15m')).toBe(DEFAULT_THRESHOLD);
    expect(getRegimeThreshold('1h')).toBe(DEFAULT_THRESHOLD);
  });

  it('REGIME_THRESHOLDS map has exactly 4 entries', () => {
    expect(REGIME_THRESHOLDS.size).toBe(4);
  });
});

describe('calculateAtr', () => {
  it('returns NaN for insufficient data', () => {
    const candles = makeCandles(5, 50000, 0.02);
    expect(calculateAtr(candles)).toBeNaN();
  });

  it('returns a positive number for sufficient data', () => {
    const candles = makeCandles(30, 50000, 0.02);
    const atr = calculateAtr(candles);
    expect(atr).toBeGreaterThan(0);
    expect(atr).not.toBeNaN();
  });

  it('higher volatility produces higher ATR', () => {
    const lowVol = makeCandles(30, 50000, 0.01);
    const highVol = makeCandles(30, 50000, 0.05);
    expect(calculateAtr(highVol)).toBeGreaterThan(calculateAtr(lowVol));
  });
});

describe('detectRegime', () => {
  it('returns UNKNOWN for insufficient candles', () => {
    const candles = makeCandles(5, 50000, 0.02);
    expect(detectRegime(candles, '4h')).toBe(MarketRegime.UNKNOWN);
  });

  it('classifies low volatility as RANGING on 4h', () => {
    // 1% ATR — below 1.5% threshold for 4h
    const candles = makeCandles(30, 50000, 0.01);
    expect(detectRegime(candles, '4h')).toBe(MarketRegime.RANGING);
  });

  it('classifies high volatility as TRENDING on 4h', () => {
    // 3% ATR — above 1.5% threshold for 4h
    const candles = makeCandles(30, 50000, 0.03);
    expect(detectRegime(candles, '4h')).toBe(MarketRegime.TRENDING);
  });

  it('classifies 2% ATR as RANGING on 1d (threshold is 3%)', () => {
    // 2% ATR — above 4h threshold but below 1d threshold
    const candles = makeCandles(30, 50000, 0.02);
    expect(detectRegime(candles, '4h')).toBe(MarketRegime.TRENDING);
    expect(detectRegime(candles, '1d')).toBe(MarketRegime.RANGING);
  });

  it('classifies 4% ATR as TRENDING on 1d but RANGING on 1w', () => {
    // 4% ATR — above 1d threshold (3%) but below 1w threshold (5%)
    const candles = makeCandles(30, 50000, 0.04);
    expect(detectRegime(candles, '1d')).toBe(MarketRegime.TRENDING);
    expect(detectRegime(candles, '1w')).toBe(MarketRegime.RANGING);
  });

  it('classifies 6% ATR as TRENDING on 1w but RANGING on 1M', () => {
    // 6% ATR — above 1w threshold (5%) but below 1M threshold (8%)
    const candles = makeCandles(30, 50000, 0.06);
    expect(detectRegime(candles, '1w')).toBe(MarketRegime.TRENDING);
    expect(detectRegime(candles, '1M')).toBe(MarketRegime.RANGING);
  });

  it('classifies 10% ATR as TRENDING on 1M', () => {
    // 10% ATR — above 1M threshold (8%)
    const candles = makeCandles(30, 50000, 0.10);
    expect(detectRegime(candles, '1M')).toBe(MarketRegime.TRENDING);
  });

  it('defaults to 1.5% threshold for unmapped timeframes', () => {
    // 2% ATR — above default 1.5%
    const candles = makeCandles(30, 50000, 0.02);
    expect(detectRegime(candles, '15m')).toBe(MarketRegime.TRENDING);
  });

  it('same data classifies differently across all timeframes', () => {
    // 2.5% ATR: trending on 4h, ranging on 1d/1w/1M
    const candles = makeCandles(30, 50000, 0.025);
    expect(detectRegime(candles, '4h')).toBe(MarketRegime.TRENDING);
    expect(detectRegime(candles, '1d')).toBe(MarketRegime.RANGING);
    expect(detectRegime(candles, '1w')).toBe(MarketRegime.RANGING);
    expect(detectRegime(candles, '1M')).toBe(MarketRegime.RANGING);
  });
});
