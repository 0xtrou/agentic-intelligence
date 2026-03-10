/**
 * @module ema.spec
 * @description Tests for EMA calculation and crossover detection utilities.
 */

import { describe, it, expect } from 'vitest';
import { calculateEma, detectCrossover } from './ema';
import type { Candle } from '@agentic-intelligence/core';

/**
 * Helper to create a test candle.
 */
function createCandle(close: number, index: number): Candle {
  return {
    symbol: 'BTCUSDT',
    timeframe: '1h',
    openTime: index * 3600000,
    closeTime: (index + 1) * 3600000,
    open: close,
    high: close,
    low: close,
    close,
    volume: 100,
  };
}

describe('calculateEma', () => {
  it('should throw error for period < 1', () => {
    const candles = [createCandle(100, 0)];
    expect(() => calculateEma(candles, 0)).toThrow('EMA period must be >= 1');
    expect(() => calculateEma(candles, -5)).toThrow('EMA period must be >= 1');
  });

  it('should return empty array for empty input', () => {
    const result = calculateEma([], 10);
    expect(result).toEqual([]);
  });

  it('should return all NaN when insufficient candles', () => {
    const candles = [
      createCandle(100, 0),
      createCandle(101, 1),
      createCandle(102, 2),
    ];
    const result = calculateEma(candles, 10); // Need 10, only have 3
    expect(result).toHaveLength(3);
    expect(result.every((v) => isNaN(v))).toBe(true);
  });

  it('should calculate EMA correctly with exact period length', () => {
    // Simple test case: 5 candles, period = 5
    const closes = [100, 102, 104, 103, 105];
    const candles = closes.map((close, i) => createCandle(close, i));

    const result = calculateEma(candles, 5);

    // First 4 values should be NaN
    expect(isNaN(result[0])).toBe(true);
    expect(isNaN(result[1])).toBe(true);
    expect(isNaN(result[2])).toBe(true);
    expect(isNaN(result[3])).toBe(true);

    // 5th value should be SMA of first 5: (100+102+104+103+105)/5 = 102.8
    expect(result[4]).toBeCloseTo(102.8, 10);
  });

  it('should calculate EMA correctly with multiple periods', () => {
    const closes = [100, 102, 104, 103, 105, 107, 106];
    const candles = closes.map((close, i) => createCandle(close, i));

    const result = calculateEma(candles, 5);
    const multiplier = 2 / (5 + 1); // 0.333...

    // First EMA (index 4) is SMA
    const sma = (100 + 102 + 104 + 103 + 105) / 5;
    expect(result[4]).toBeCloseTo(sma, 10);

    // Second EMA (index 5): close * multiplier + prevEMA * (1 - multiplier)
    const ema5 = 107 * multiplier + sma * (1 - multiplier);
    expect(result[5]).toBeCloseTo(ema5, 10);

    // Third EMA (index 6)
    const ema6 = 106 * multiplier + ema5 * (1 - multiplier);
    expect(result[6]).toBeCloseTo(ema6, 10);
  });

  it('should handle period = 1 (EMA = close price)', () => {
    const closes = [100, 105, 110];
    const candles = closes.map((close, i) => createCandle(close, i));

    const result = calculateEma(candles, 1);

    // When period = 1, EMA should equal the close price for all candles
    expect(result[0]).toBe(100);
    expect(result[1]).toBe(105);
    expect(result[2]).toBe(110);
  });
});

describe('detectCrossover', () => {
  it('should return null for insufficient data (< 2 points)', () => {
    expect(detectCrossover([], [])).toBe(null);
    expect(detectCrossover([100], [100])).toBe(null);
  });

  it('should throw error for mismatched array lengths', () => {
    const fastEma = [100, 101, 102];
    const slowEma = [100, 101];
    expect(() => detectCrossover(fastEma, slowEma)).toThrow(
      'EMA arrays must have the same length'
    );
  });

  it('should return null when any recent value is NaN', () => {
    const fastEma = [NaN, 100, 101];
    const slowEma = [NaN, 99, 100];
    expect(detectCrossover(fastEma, slowEma)).toBe(null);

    const fastEma2 = [100, NaN, 101];
    const slowEma2 = [100, 99, 100];
    expect(detectCrossover(fastEma2, slowEma2)).toBe(null);
  });

  it('should detect bullish crossover (fast crosses above slow)', () => {
    // Previous: fast <= slow, Current: fast > slow
    const fastEma = [98, 99, 101];
    const slowEma = [100, 100, 100];
    expect(detectCrossover(fastEma, slowEma)).toBe('LONG');
  });

  it('should detect bearish crossover (fast crosses below slow)', () => {
    // Previous: fast >= slow, Current: fast < slow
    const fastEma = [102, 101, 99];
    const slowEma = [100, 100, 100];
    expect(detectCrossover(fastEma, slowEma)).toBe('SHORT');
  });

  it('should return null when no crossover (fast stays above slow)', () => {
    const fastEma = [105, 106, 107];
    const slowEma = [100, 100, 100];
    expect(detectCrossover(fastEma, slowEma)).toBe(null);
  });

  it('should return null when no crossover (fast stays below slow)', () => {
    const fastEma = [95, 96, 97];
    const slowEma = [100, 100, 100];
    expect(detectCrossover(fastEma, slowEma)).toBe(null);
  });

  it('should handle exact equality as valid state', () => {
    // Fast was equal, now above → bullish cross
    const fastEma = [100, 100, 101];
    const slowEma = [100, 100, 100];
    expect(detectCrossover(fastEma, slowEma)).toBe('LONG');

    // Fast was equal, now below → bearish cross
    const fastEma2 = [100, 100, 99];
    const slowEma2 = [100, 100, 100];
    expect(detectCrossover(fastEma2, slowEma2)).toBe('SHORT');
  });

  it('should only check the most recent two points', () => {
    // Earlier crossover should be ignored
    const fastEma = [95, 105, 104, 103];
    const slowEma = [100, 100, 100, 100];
    // Most recent: fast=103, slow=100 (no cross at last point)
    expect(detectCrossover(fastEma, slowEma)).toBe(null);
  });
});
