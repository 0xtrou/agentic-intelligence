/**
 * @module EmaCrossSensor.spec
 * @description Tests for EmaCrossSensor implementation.
 */

import { describe, it, expect } from 'vitest';
import { EmaCrossSensor } from './EmaCrossSensor';
import type { Candle } from '@agentic-intelligence/core';

/**
 * Helper to create a test candle with specific close price.
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

/**
 * Create a series of candles with specified close prices.
 */
function createCandles(closes: number[]): Candle[] {
  return closes.map((close, i) => createCandle(close, i));
}

describe('EmaCrossSensor', () => {
  describe('constructor', () => {
    it('should create sensor with valid config', () => {
      const sensor = new EmaCrossSensor('test-sensor', {
        fastPeriod: 9,
        slowPeriod: 21,
      });
      expect(sensor.id).toBe('test-sensor');
    });

    it('should throw error when fast period >= slow period', () => {
      expect(
        () =>
          new EmaCrossSensor('test', {
            fastPeriod: 21,
            slowPeriod: 21,
          })
      ).toThrow('Fast period must be less than slow period');

      expect(
        () =>
          new EmaCrossSensor('test', {
            fastPeriod: 30,
            slowPeriod: 20,
          })
      ).toThrow('Fast period must be less than slow period');
    });

    it('should throw error for invalid periods', () => {
      expect(
        () =>
          new EmaCrossSensor('test', {
            fastPeriod: 0,
            slowPeriod: 10,
          })
      ).toThrow('EMA periods must be >= 1');

      expect(
        () =>
          new EmaCrossSensor('test', {
            fastPeriod: 5,
            slowPeriod: -1,
          })
      ).toThrow('EMA periods must be >= 1');
    });
  });

  describe('evaluate', () => {
    it('should return fire=false for empty candles', () => {
      const sensor = new EmaCrossSensor('test', {
        fastPeriod: 5,
        slowPeriod: 10,
      });

      const vote = sensor.evaluate([]);
      expect(vote.fire).toBe(false);
      expect(vote.sensorId).toBe('test');
    });

    it('should return fire=false when insufficient candles', () => {
      const sensor = new EmaCrossSensor('test', {
        fastPeriod: 5,
        slowPeriod: 10,
      });

      // Need slowPeriod + 1 = 11 candles, only provide 10
      const candles = createCandles([100, 101, 102, 103, 104, 105, 106, 107, 108, 109]);
      const vote = sensor.evaluate(candles);

      expect(vote.fire).toBe(false);
      expect(vote.data?.candle_count).toBe(10);
    });

    it('should detect bullish crossover (fast crosses above slow)', () => {
      const sensor = new EmaCrossSensor('ema-cross', {
        fastPeriod: 3,
        slowPeriod: 5,
      });

      // Create data where fast EMA will cross above slow EMA
      // Keep fast below slow for several periods, then spike
      const candles = createCandles([
        100, 98, 96, 94, 92,  // Downtrend - fast below slow
        90, 88,               // Continue down - fast still below slow
        120,                  // Massive spike - previous: fast < slow, current: fast > slow (crossover!)
      ]);

      const vote = sensor.evaluate(candles);

      expect(vote.fire).toBe(true);
      expect(vote.direction).toBe('LONG');
      expect(vote.sensorId).toBe('ema-cross');
      expect(vote.symbol).toBe('BTCUSDT');
      expect(vote.timeframe).toBe('1h');
      expect(vote.data?.cross_direction).toBe('LONG');
      expect(vote.data?.ema_fast).toBeDefined();
      expect(vote.data?.ema_slow).toBeDefined();
    });

    it('should detect bearish crossover (fast crosses below slow)', () => {
      const sensor = new EmaCrossSensor('ema-cross', {
        fastPeriod: 3,
        slowPeriod: 5,
      });

      // Create data where fast EMA will cross below slow EMA
      // Keep fast above slow for several periods, then crash
      const candles = createCandles([
        100, 102, 104, 106, 108, // Uptrend - fast above slow
        110, 112,                 // Continue up - fast still above slow
        60,                       // Massive drop - previous: fast > slow, current: fast < slow (crossover!)
      ]);

      const vote = sensor.evaluate(candles);

      expect(vote.fire).toBe(true);
      expect(vote.direction).toBe('SHORT');
      expect(vote.data?.cross_direction).toBe('SHORT');
    });

    it('should return fire=false when no crossover detected', () => {
      const sensor = new EmaCrossSensor('ema-cross', {
        fastPeriod: 3,
        slowPeriod: 5,
      });

      // Steady uptrend - fast stays above slow, no crossover
      const candles = createCandles([
        100, 101, 102, 103, 104, 105, 106, 107,
      ]);

      const vote = sensor.evaluate(candles);

      expect(vote.fire).toBe(false);
      expect(vote.direction).toBeUndefined();
      expect(vote.data?.ema_fast).toBeDefined();
      expect(vote.data?.ema_slow).toBeDefined();
    });

    it('should include EMA values in vote data', () => {
      const sensor = new EmaCrossSensor('ema-cross', {
        fastPeriod: 3,
        slowPeriod: 5,
      });

      const candles = createCandles([
        100, 101, 102, 103, 104, 105, 106,
      ]);

      const vote = sensor.evaluate(candles);

      expect(vote.data?.ema_fast).toBeTypeOf('number');
      expect(vote.data?.ema_slow).toBeTypeOf('number');
      expect(vote.data?.fast_period).toBe(3);
      expect(vote.data?.slow_period).toBe(5);
      expect(isNaN(vote.data?.ema_fast as number)).toBe(false);
      expect(isNaN(vote.data?.ema_slow as number)).toBe(false);
    });

    it('should use metadata from latest candle', () => {
      const sensor = new EmaCrossSensor('ema-cross', {
        fastPeriod: 3,
        slowPeriod: 5,
      });

      const candles = createCandles([
        100, 101, 102, 103, 104, 105, 106,
      ]);

      // Override last candle metadata
      candles[candles.length - 1] = {
        ...candles[candles.length - 1],
        symbol: 'ETHUSDT',
        timeframe: '15m',
        closeTime: 999999999,
      };

      const vote = sensor.evaluate(candles);

      expect(vote.symbol).toBe('ETHUSDT');
      expect(vote.timeframe).toBe('15m');
      expect(vote.timestamp).toBe(999999999);
    });

    it('should handle exact minimum candle count (slowPeriod + 1)', () => {
      const sensor = new EmaCrossSensor('ema-cross', {
        fastPeriod: 2,
        slowPeriod: 3,
      });

      // Exactly 4 candles (3 + 1)
      const candles = createCandles([100, 105, 110, 115]);

      const vote = sensor.evaluate(candles);

      // Should evaluate successfully (might or might not fire depending on data)
      expect(vote.sensorId).toBe('ema-cross');
      expect(vote.data?.ema_fast).toBeDefined();
    });

    it('should detect crossover at exact equality boundary', () => {
      const sensor = new EmaCrossSensor('ema-cross', {
        fastPeriod: 2,
        slowPeriod: 3,
      });

      // Craft data where EMAs are exactly equal, then fast moves above
      // This is tricky to set up precisely, so we'll test the behavior
      // by creating a scenario where they converge then diverge
      const candles = createCandles([
        100, 100, 100, 100, 110, // Last value pushes fast above slow
      ]);

      const vote = sensor.evaluate(candles);

      // Should detect the bullish cross
      expect(vote.fire).toBe(true);
      expect(vote.direction).toBe('LONG');
    });
  });

  describe('edge cases', () => {
    it('should handle single candle', () => {
      const sensor = new EmaCrossSensor('test', {
        fastPeriod: 5,
        slowPeriod: 10,
      });

      const vote = sensor.evaluate([createCandle(100, 0)]);
      expect(vote.fire).toBe(false);
    });

    it('should handle very small periods', () => {
      const sensor = new EmaCrossSensor('test', {
        fastPeriod: 1,
        slowPeriod: 2,
      });

      // Need 3 candles (2 + 1)
      const candles = createCandles([100, 95, 110]);
      const vote = sensor.evaluate(candles);

      expect(vote.sensorId).toBe('test');
      // Result depends on data, just verify it runs without error
    });

    it('should handle large periods', () => {
      const sensor = new EmaCrossSensor('test', {
        fastPeriod: 50,
        slowPeriod: 200,
      });

      // Not enough candles
      const candles = createCandles(Array(100).fill(100));
      const vote = sensor.evaluate(candles);

      expect(vote.fire).toBe(false);
    });

    it('should handle realistic market data scenario', () => {
      const sensor = new EmaCrossSensor('ema-9-21', {
        fastPeriod: 9,
        slowPeriod: 21,
      });

      // Simulate a trending market with a reversal
      const closes = [
        // Strong uptrend - fast well above slow
        100, 102, 104, 106, 108, 110, 112, 114, 116, 118,
        120, 122, 124, 126, 128, 130, 132, 134, 136, 138,
        140, 142,
        // Sharp reversal - catch the exact crossover point
        80, 70, // Crash - crossover happens at index 23 (70)
      ];

      const candles = createCandles(closes);
      const vote = sensor.evaluate(candles);

      // The sharp reversal should trigger a bearish crossover
      expect(vote.fire).toBe(true);
      expect(vote.direction).toBe('SHORT');
    });
  });
});
