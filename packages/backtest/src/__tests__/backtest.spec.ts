/**
 * @module backtest.spec
 * @description Tests for the backtesting engine — TP/SL logic and regime classification.
 */

import { describe, it, expect } from 'vitest';
import type { Candle } from '@agentic-intelligence/core';
import { SignalDirection } from '@agentic-intelligence/core';
import { evaluateTradeOutcome } from '../engine';
import { calculateAtr, classifyRegime } from '../regime';

// Helper to create a candle
function makeCandle(overrides: Partial<Candle> = {}): Candle {
  return {
    symbol: 'BTCUSDT',
    timeframe: '4h',
    openTime: Date.now(),
    closeTime: Date.now() + 4 * 60 * 60 * 1000,
    open: 100000,
    high: 101000,
    low: 99000,
    close: 100500,
    volume: 1000,
    ...overrides,
  };
}

const DEFAULT_CONFIG = {
  tpPercent: 0.01,
  slPercent: 0.005,
  maxHoldCandles: 12,
  regimeThreshold: 0.015,
};

describe('evaluateTradeOutcome', () => {
  describe('LONG trades', () => {
    it('should detect a TP hit (price goes up)', () => {
      const entryPrice = 100000;
      // TP = 101000, SL = 99500
      const candles = [
        makeCandle({ high: 100500, low: 99800, close: 100300 }),
        makeCandle({ high: 101100, low: 100200, close: 100900 }), // hits TP
      ];

      const result = evaluateTradeOutcome(entryPrice, SignalDirection.LONG, candles, DEFAULT_CONFIG);
      expect(result.outcome).toBe('win');
      expect(result.pnlPercent).toBe(1); // +1%
      expect(result.exitIndex).toBe(1);
    });

    it('should detect a SL hit (price goes down)', () => {
      const entryPrice = 100000;
      // TP = 101000, SL = 99500
      const candles = [
        makeCandle({ high: 100200, low: 99400, close: 99600 }), // hits SL
      ];

      const result = evaluateTradeOutcome(entryPrice, SignalDirection.LONG, candles, DEFAULT_CONFIG);
      expect(result.outcome).toBe('loss');
      expect(result.pnlPercent).toBe(-0.5); // -0.5%
      expect(result.exitIndex).toBe(0);
    });

    it('should check SL before TP within same candle (conservative)', () => {
      const entryPrice = 100000;
      // TP = 101000, SL = 99500
      // This candle hits both SL and TP — SL should be checked first
      const candles = [
        makeCandle({ high: 101500, low: 99000, close: 100500 }),
      ];

      const result = evaluateTradeOutcome(entryPrice, SignalDirection.LONG, candles, DEFAULT_CONFIG);
      expect(result.outcome).toBe('loss'); // SL checked first
    });

    it('should exit at close when neither TP nor SL hit', () => {
      const entryPrice = 100000;
      const candles = [
        makeCandle({ high: 100400, low: 99600, close: 100200 }),
        makeCandle({ high: 100300, low: 99700, close: 100100 }),
      ];

      const config = { ...DEFAULT_CONFIG, maxHoldCandles: 2 };
      const result = evaluateTradeOutcome(entryPrice, SignalDirection.LONG, candles, config);
      expect(result.pnlPercent).toBeCloseTo(0.1, 1); // (100100-100000)/100000 * 100
      expect(result.outcome).toBe('win');
    });
  });

  describe('SHORT trades', () => {
    it('should detect a TP hit (price goes down)', () => {
      const entryPrice = 100000;
      // TP = 99000, SL = 100500
      const candles = [
        makeCandle({ high: 100200, low: 98900, close: 99100 }), // hits TP
      ];

      const result = evaluateTradeOutcome(entryPrice, SignalDirection.SHORT, candles, DEFAULT_CONFIG);
      expect(result.outcome).toBe('win');
      expect(result.pnlPercent).toBe(1); // +1%
    });

    it('should detect a SL hit (price goes up)', () => {
      const entryPrice = 100000;
      // SL = 100500
      const candles = [
        makeCandle({ high: 100600, low: 99800, close: 100300 }), // hits SL
      ];

      const result = evaluateTradeOutcome(entryPrice, SignalDirection.SHORT, candles, DEFAULT_CONFIG);
      expect(result.outcome).toBe('loss');
      expect(result.pnlPercent).toBe(-0.5);
    });

    it('should check SL before TP within same candle (conservative)', () => {
      const entryPrice = 100000;
      // This candle hits both — SL first
      const candles = [
        makeCandle({ high: 101000, low: 98500, close: 99500 }),
      ];

      const result = evaluateTradeOutcome(entryPrice, SignalDirection.SHORT, candles, DEFAULT_CONFIG);
      expect(result.outcome).toBe('loss'); // SL checked first
    });
  });
});

describe('Regime Classification', () => {
  it('should classify high ATR as trending', () => {
    // Create candles with high volatility (big ranges)
    const candles: Candle[] = [];
    let price = 100000;
    for (let i = 0; i < 20; i++) {
      const swing = 2000; // 2% swings → high ATR
      candles.push(makeCandle({
        openTime: Date.now() + i * 4 * 60 * 60 * 1000,
        closeTime: Date.now() + (i + 1) * 4 * 60 * 60 * 1000,
        open: price,
        high: price + swing,
        low: price - swing,
        close: price + (i % 2 === 0 ? swing / 2 : -swing / 2),
      }));
      price = candles[candles.length - 1].close;
    }

    const atr = calculateAtr(candles);
    const regime = classifyRegime(candles, atr, candles.length - 1);
    expect(regime).toBe('trending');
  });

  it('should classify low ATR as ranging', () => {
    // Create candles with low volatility
    const candles: Candle[] = [];
    const basePrice = 100000;
    for (let i = 0; i < 20; i++) {
      const swing = 100; // 0.1% swings → very low ATR
      candles.push(makeCandle({
        openTime: Date.now() + i * 4 * 60 * 60 * 1000,
        closeTime: Date.now() + (i + 1) * 4 * 60 * 60 * 1000,
        open: basePrice,
        high: basePrice + swing,
        low: basePrice - swing,
        close: basePrice + (i % 2 === 0 ? 50 : -50),
      }));
    }

    const atr = calculateAtr(candles);
    const regime = classifyRegime(candles, atr, candles.length - 1);
    expect(regime).toBe('ranging');
  });

  it('should return NaN ATR for insufficient data', () => {
    const candles = [makeCandle(), makeCandle()];
    const atr = calculateAtr(candles);
    expect(atr.every((v) => isNaN(v))).toBe(true);
  });

  it('should default to ranging when ATR is NaN', () => {
    const candles = [makeCandle()];
    const regime = classifyRegime(candles, [NaN], 0);
    expect(regime).toBe('ranging');
  });
});
