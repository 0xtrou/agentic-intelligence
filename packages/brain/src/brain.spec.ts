/**
 * @module brain.spec
 * @description Tests for signal aggregation and generation.
 */

import { describe, it, expect } from 'vitest';
import {
  generateSignal,
  aggregateSensorVotes,
  applyRegimeGating,
  calculateTP,
  calculateSL,
  calculateConfidence,
  calculateATR,
  calculateTrueRange,
  detectRegime,
  DEFAULT_BRAIN_CONFIG,
  type SensorVoteWithStatus,
} from './brain.js';
import {
  SignalDirection,
  SensorStatus,
  MarketRegime,
} from '@agentic-intelligence/core';

describe('Brain — Signal Aggregation', () => {
  describe('aggregateSensorVotes', () => {
    it('should generate LONG signal when one ACTIVE sensor votes LONG', () => {
      const votes: SensorVoteWithStatus[] = [
        {
          sensorId: 'ema-cross',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.LONG,
          status: SensorStatus.ACTIVE,
          timestamp: Date.now(),
        },
      ];

      const result = aggregateSensorVotes(votes);

      expect(result.direction).toBe(SignalDirection.LONG);
      expect(result.activeLongVotes).toHaveLength(1);
      expect(result.activeShortVotes).toHaveLength(0);
      expect(result.conflicting).toBe(false);
    });

    it('should generate SHORT signal when one ACTIVE sensor votes SHORT', () => {
      const votes: SensorVoteWithStatus[] = [
        {
          sensorId: 'rsi-oversold',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.SHORT,
          status: SensorStatus.ACTIVE,
          timestamp: Date.now(),
        },
      ];

      const result = aggregateSensorVotes(votes);

      expect(result.direction).toBe(SignalDirection.SHORT);
      expect(result.activeLongVotes).toHaveLength(0);
      expect(result.activeShortVotes).toHaveLength(1);
      expect(result.conflicting).toBe(false);
    });

    it('should detect conflicting signals when both LONG and SHORT votes exist', () => {
      const votes: SensorVoteWithStatus[] = [
        {
          sensorId: 'ema-cross',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.LONG,
          status: SensorStatus.ACTIVE,
          timestamp: Date.now(),
        },
        {
          sensorId: 'rsi-overbought',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.SHORT,
          status: SensorStatus.ACTIVE,
          timestamp: Date.now(),
        },
      ];

      const result = aggregateSensorVotes(votes);

      expect(result.direction).toBeNull();
      expect(result.activeLongVotes).toHaveLength(1);
      expect(result.activeShortVotes).toHaveLength(1);
      expect(result.conflicting).toBe(true);
    });

    it('should ignore sensors that did not fire', () => {
      const votes: SensorVoteWithStatus[] = [
        {
          sensorId: 'ema-cross',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: false, // Not fired
          direction: SignalDirection.LONG,
          status: SensorStatus.ACTIVE,
          timestamp: Date.now(),
        },
        {
          sensorId: 'volume-spike',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.LONG,
          status: SensorStatus.ACTIVE,
          timestamp: Date.now(),
        },
      ];

      const result = aggregateSensorVotes(votes);

      expect(result.direction).toBe(SignalDirection.LONG);
      expect(result.activeLongVotes).toHaveLength(1);
      expect(result.activeLongVotes[0].sensorId).toBe('volume-spike');
    });

    it('should exclude PROBATION sensors by default', () => {
      const votes: SensorVoteWithStatus[] = [
        {
          sensorId: 'new-sensor',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.LONG,
          status: SensorStatus.PROBATION,
          timestamp: Date.now(),
        },
      ];

      const result = aggregateSensorVotes(votes);

      expect(result.direction).toBeNull();
      expect(result.activeLongVotes).toHaveLength(0);
    });

    it('should include PROBATION sensors when minStatus is PROBATION', () => {
      const votes: SensorVoteWithStatus[] = [
        {
          sensorId: 'new-sensor',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.LONG,
          status: SensorStatus.PROBATION,
          timestamp: Date.now(),
        },
      ];

      const result = aggregateSensorVotes(votes, SensorStatus.PROBATION);

      expect(result.direction).toBe(SignalDirection.LONG);
      expect(result.activeLongVotes).toHaveLength(1);
    });

    it('should always exclude KILLED sensors', () => {
      const votes: SensorVoteWithStatus[] = [
        {
          sensorId: 'dead-sensor',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.LONG,
          status: SensorStatus.KILLED,
          timestamp: Date.now(),
        },
      ];

      const result = aggregateSensorVotes(votes, SensorStatus.PROBATION);

      expect(result.direction).toBeNull();
      expect(result.activeLongVotes).toHaveLength(0);
    });

    it('should include TRUSTED sensors', () => {
      const votes: SensorVoteWithStatus[] = [
        {
          sensorId: 'veteran-sensor',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.LONG,
          status: SensorStatus.TRUSTED,
          timestamp: Date.now(),
        },
      ];

      const result = aggregateSensorVotes(votes);

      expect(result.direction).toBe(SignalDirection.LONG);
      expect(result.activeLongVotes).toHaveLength(1);
    });

    it('should return null direction when no votes are provided', () => {
      const result = aggregateSensorVotes([]);

      expect(result.direction).toBeNull();
      expect(result.activeLongVotes).toHaveLength(0);
      expect(result.activeShortVotes).toHaveLength(0);
      expect(result.conflicting).toBe(false);
    });
  });

  describe('calculateTP', () => {
    it('should calculate TP above entry for LONG', () => {
      const entry = 50000;
      const tp = calculateTP(entry, SignalDirection.LONG, 0.015);

      expect(tp).toBeCloseTo(50750, 5); // 50000 * 1.015
    });

    it('should calculate TP below entry for SHORT', () => {
      const entry = 50000;
      const tp = calculateTP(entry, SignalDirection.SHORT, 0.015);

      expect(tp).toBeCloseTo(49250, 5); // 50000 * 0.985
    });
  });

  describe('calculateSL', () => {
    it('should calculate SL below entry for LONG', () => {
      const entry = 50000;
      const sl = calculateSL(entry, SignalDirection.LONG, 0.01);

      expect(sl).toBeCloseTo(49500, 5); // 50000 * 0.99
    });

    it('should calculate SL above entry for SHORT', () => {
      const entry = 50000;
      const sl = calculateSL(entry, SignalDirection.SHORT, 0.01);

      expect(sl).toBeCloseTo(50500, 5); // 50000 * 1.01
    });
  });

  describe('calculateConfidence', () => {
    it('should return 0 for empty votes', () => {
      const confidence = calculateConfidence([]);

      expect(confidence).toBe(0);
    });

    it('should use 0.5 as default when sensors do not provide confidence', () => {
      const votes: SensorVoteWithStatus[] = [
        {
          sensorId: 'sensor-1',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.LONG,
          status: SensorStatus.ACTIVE,
          timestamp: Date.now(),
        },
      ];

      const confidence = calculateConfidence(votes);

      expect(confidence).toBe(0.5);
    });

    it('should average sensor-provided confidence values', () => {
      const votes: SensorVoteWithStatus[] = [
        {
          sensorId: 'sensor-1',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.LONG,
          confidence: 0.8,
          status: SensorStatus.ACTIVE,
          timestamp: Date.now(),
        },
        {
          sensorId: 'sensor-2',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.LONG,
          confidence: 0.6,
          status: SensorStatus.ACTIVE,
          timestamp: Date.now(),
        },
      ];

      const confidence = calculateConfidence(votes);

      expect(confidence).toBe(0.7); // (0.8 + 0.6) / 2
    });

    it('should handle mix of provided and missing confidence values', () => {
      const votes: SensorVoteWithStatus[] = [
        {
          sensorId: 'sensor-1',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.LONG,
          confidence: 0.9,
          status: SensorStatus.ACTIVE,
          timestamp: Date.now(),
        },
        {
          sensorId: 'sensor-2',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.LONG,
          // No confidence provided → defaults to 0.5
          status: SensorStatus.ACTIVE,
          timestamp: Date.now(),
        },
      ];

      const confidence = calculateConfidence(votes);

      expect(confidence).toBe(0.7); // (0.9 + 0.5) / 2
    });
  });

  describe('calculateTrueRange', () => {
    it('should calculate TR as high-low when no previous close provided', () => {
      const candle = { high: 100, low: 95, close: 98 };
      const tr = calculateTrueRange(candle);
      expect(tr).toBe(5); // 100 - 95
    });

    it('should calculate TR with previous close', () => {
      const candle = { high: 100, low: 95, close: 98 };
      const prevClose = 92;

      // max(100-95, |100-92|, |95-92|) = max(5, 8, 3) = 8
      const tr = calculateTrueRange(candle, prevClose);
      expect(tr).toBe(8);
    });

    it('should handle gap up correctly', () => {
      const candle = { high: 110, low: 105, close: 108 };
      const prevClose = 100;

      // max(110-105, |110-100|, |105-100|) = max(5, 10, 5) = 10
      const tr = calculateTrueRange(candle, prevClose);
      expect(tr).toBe(10);
    });

    it('should handle gap down correctly', () => {
      const candle = { high: 95, low: 90, close: 92 };
      const prevClose = 100;

      // max(95-90, |95-100|, |90-100|) = max(5, 5, 10) = 10
      const tr = calculateTrueRange(candle, prevClose);
      expect(tr).toBe(10);
    });
  });

  describe('calculateATR', () => {
    it('should return null when insufficient candles', () => {
      const candles = [
        { high: 100, low: 95, close: 98 },
        { high: 102, low: 97, close: 100 },
      ];

      const atr = calculateATR(candles, 14);
      expect(atr).toBeNull();
    });

    it('should calculate ATR with exact period candles', () => {
      const candles = Array.from({ length: 14 }, (_, i) => ({
        high: 100 + i,
        low: 95 + i,
        close: 98 + i,
      }));

      const atr = calculateATR(candles, 14);
      expect(atr).not.toBeNull();
      expect(atr).toBeGreaterThan(0);
    });

    it('should smooth ATR over multiple periods', () => {
      // Create candles with increasing volatility
      const candles = [
        ...Array.from({ length: 14 }, (_, i) => ({
          high: 100 + i,
          low: 95 + i,
          close: 98 + i,
        })),
        // Add more volatile candles
        { high: 120, low: 110, close: 115 },
        { high: 125, low: 112, close: 118 },
      ];

      const atr = calculateATR(candles, 14);
      expect(atr).not.toBeNull();
      expect(atr).toBeGreaterThan(5); // Should reflect increased volatility
    });

    it('should handle custom period', () => {
      const candles = Array.from({ length: 20 }, (_, i) => ({
        high: 100 + i * 2,
        low: 95 + i * 2,
        close: 98 + i * 2,
      }));

      const atr7 = calculateATR(candles, 7);
      const atr14 = calculateATR(candles, 14);

      expect(atr7).not.toBeNull();
      expect(atr14).not.toBeNull();
      // Shorter period ATR should be more responsive (potentially different values)
      expect(atr7).toBeGreaterThan(0);
      expect(atr14).toBeGreaterThan(0);
    });
  });

  describe('detectRegime', () => {
    it('should return UNKNOWN when insufficient candles', () => {
      const candles = [
        { high: 100, low: 95, close: 98 },
        { high: 102, low: 97, close: 100 },
      ];

      const regime = detectRegime(candles);
      expect(regime).toBe(MarketRegime.UNKNOWN);
    });

    it('should detect TRENDING regime when ATR > threshold', () => {
      // High volatility candles (large price swings)
      const candles = Array.from({ length: 20 }, (_, i) => {
        const basePrice = 50000;
        const volatility = 2000; // 4% volatility
        return {
          high: basePrice + i * 100 + volatility,
          low: basePrice + i * 100 - volatility,
          close: basePrice + i * 100,
        };
      });

      const regime = detectRegime(candles);
      expect(regime).toBe(MarketRegime.TRENDING);
    });

    it('should detect RANGING regime when ATR <= threshold', () => {
      // Low volatility candles (small price swings)
      const candles = Array.from({ length: 20 }, (_, i) => {
        const basePrice = 50000;
        const volatility = 200; // 0.4% volatility
        return {
          high: basePrice + volatility,
          low: basePrice - volatility,
          close: basePrice,
        };
      });

      const regime = detectRegime(candles);
      expect(regime).toBe(MarketRegime.RANGING);
    });

    it('should use custom regime config', () => {
      const candles = Array.from({ length: 20 }, (_, i) => {
        const basePrice = 50000;
        const volatility = 500; // 1% volatility
        return {
          high: basePrice + volatility,
          low: basePrice - volatility,
          close: basePrice,
        };
      });

      // With default threshold (2%), this should be RANGING (ATR ~1000, threshold 1000)
      const regimeDefault = detectRegime(candles);
      expect(regimeDefault).toBe(MarketRegime.RANGING);

      // With lower threshold (0.5%), this should be TRENDING
      const regimeCustom = detectRegime(candles, {
        atrPeriod: 14,
        atrThreshold: 0.005, // 0.5%
      });
      expect(regimeCustom).toBe(MarketRegime.TRENDING);
    });

    it('should use custom ATR period', () => {
      const candles = Array.from({ length: 30 }, (_, i) => ({
        high: 50000 + i * 100,
        low: 49000 + i * 100,
        close: 49500 + i * 100,
      }));

      const regime7 = detectRegime(candles, { atrPeriod: 7, atrThreshold: 0.02 });
      const regime21 = detectRegime(candles, { atrPeriod: 21, atrThreshold: 0.02 });

      expect(regime7).toBeDefined();
      expect(regime21).toBeDefined();
    });
  });

  describe('applyRegimeGating', () => {
    it('should return all votes when regime is UNKNOWN', () => {
      const votes: SensorVoteWithStatus[] = [
        {
          sensorId: 'ema-cross',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.LONG,
          status: SensorStatus.ACTIVE,
          timestamp: Date.now(),
        },
        {
          sensorId: 'rsi-oversold',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.SHORT,
          status: SensorStatus.ACTIVE,
          timestamp: Date.now(),
        },
      ];

      const regimeGating = [
        { sensorId: 'ema-cross', requiredRegimes: [MarketRegime.TRENDING] },
      ];

      const filtered = applyRegimeGating(votes, MarketRegime.UNKNOWN, regimeGating);
      expect(filtered).toHaveLength(2);
    });

    it('should filter out votes that do not match regime requirements', () => {
      const votes: SensorVoteWithStatus[] = [
        {
          sensorId: 'ema-cross',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.LONG,
          status: SensorStatus.ACTIVE,
          timestamp: Date.now(),
        },
        {
          sensorId: 'rsi-oversold',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.SHORT,
          status: SensorStatus.ACTIVE,
          timestamp: Date.now(),
        },
      ];

      const regimeGating = [
        { sensorId: 'ema-cross', requiredRegimes: [MarketRegime.TRENDING] },
      ];

      const filtered = applyRegimeGating(votes, MarketRegime.RANGING, regimeGating);

      // EMA cross should be filtered out, RSI oversold has no requirements so passes
      expect(filtered).toHaveLength(1);
      expect(filtered[0].sensorId).toBe('rsi-oversold');
    });

    it('should allow votes when regime matches requirements', () => {
      const votes: SensorVoteWithStatus[] = [
        {
          sensorId: 'ema-cross',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.LONG,
          status: SensorStatus.ACTIVE,
          timestamp: Date.now(),
        },
      ];

      const regimeGating = [
        { sensorId: 'ema-cross', requiredRegimes: [MarketRegime.TRENDING] },
      ];

      const filtered = applyRegimeGating(votes, MarketRegime.TRENDING, regimeGating);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].sensorId).toBe('ema-cross');
    });

    it('should allow votes when sensor has multiple regime requirements', () => {
      const votes: SensorVoteWithStatus[] = [
        {
          sensorId: 'multi-regime-sensor',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.LONG,
          status: SensorStatus.ACTIVE,
          timestamp: Date.now(),
        },
      ];

      const regimeGating = [
        {
          sensorId: 'multi-regime-sensor',
          requiredRegimes: [MarketRegime.TRENDING, MarketRegime.RANGING],
        },
      ];

      const filteredTrending = applyRegimeGating(votes, MarketRegime.TRENDING, regimeGating);
      const filteredRanging = applyRegimeGating(votes, MarketRegime.RANGING, regimeGating);

      expect(filteredTrending).toHaveLength(1);
      expect(filteredRanging).toHaveLength(1);
    });

    it('should allow votes when sensor has no regime requirements', () => {
      const votes: SensorVoteWithStatus[] = [
        {
          sensorId: 'no-gating-sensor',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.LONG,
          status: SensorStatus.ACTIVE,
          timestamp: Date.now(),
        },
      ];

      const regimeGating = [
        { sensorId: 'no-gating-sensor', requiredRegimes: [] },
      ];

      const filtered = applyRegimeGating(votes, MarketRegime.RANGING, regimeGating);
      expect(filtered).toHaveLength(1);
    });

    it('should allow votes when sensor is not in regime gating config', () => {
      const votes: SensorVoteWithStatus[] = [
        {
          sensorId: 'unconfigured-sensor',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.LONG,
          status: SensorStatus.ACTIVE,
          timestamp: Date.now(),
        },
      ];

      const regimeGating = [
        { sensorId: 'other-sensor', requiredRegimes: [MarketRegime.TRENDING] },
      ];

      const filtered = applyRegimeGating(votes, MarketRegime.RANGING, regimeGating);
      expect(filtered).toHaveLength(1);
    });

    it('should handle empty regime gating config', () => {
      const votes: SensorVoteWithStatus[] = [
        {
          sensorId: 'sensor-1',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.LONG,
          status: SensorStatus.ACTIVE,
          timestamp: Date.now(),
        },
      ];

      const filtered = applyRegimeGating(votes, MarketRegime.RANGING, []);
      expect(filtered).toHaveLength(1);
    });
  });

  describe('generateSignal', () => {
    it('should generate a complete LONG signal from sensor votes', () => {
      const votes: SensorVoteWithStatus[] = [
        {
          sensorId: 'ema-cross',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.LONG,
          confidence: 0.75,
          status: SensorStatus.ACTIVE,
          timestamp: Date.now(),
        },
      ];

      const signal = generateSignal('BTCUSDT', '1h', 50000, votes);

      expect(signal).not.toBeNull();
      expect(signal!.symbol).toBe('BTCUSDT');
      expect(signal!.direction).toBe(SignalDirection.LONG);
      expect(signal!.entry).toBe(50000);
      expect(signal!.tp).toBeCloseTo(50750, 5); // 50000 * 1.015
      expect(signal!.sl).toBeCloseTo(49500, 5); // 50000 * 0.99
      expect(signal!.timeframe).toBe('1h');
      expect(signal!.confidence).toBe(0.75);
      expect(signal!.sensorVotes).toHaveLength(1);
      expect(signal!.regime).toBe(MarketRegime.UNKNOWN);
      expect(signal!.id).toBeDefined();
      expect(signal!.timestamp).toBeDefined();
    });

    it('should generate a complete SHORT signal from sensor votes', () => {
      const votes: SensorVoteWithStatus[] = [
        {
          sensorId: 'rsi-overbought',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.SHORT,
          confidence: 0.65,
          status: SensorStatus.ACTIVE,
          timestamp: Date.now(),
        },
      ];

      const signal = generateSignal('BTCUSDT', '1h', 50000, votes);

      expect(signal).not.toBeNull();
      expect(signal!.direction).toBe(SignalDirection.SHORT);
      expect(signal!.entry).toBe(50000);
      expect(signal!.tp).toBeCloseTo(49250, 5); // 50000 * 0.985
      expect(signal!.sl).toBeCloseTo(50500, 5); // 50000 * 1.01
      expect(signal!.confidence).toBe(0.65);
    });

    it('should return null when votes conflict', () => {
      const votes: SensorVoteWithStatus[] = [
        {
          sensorId: 'ema-cross',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.LONG,
          status: SensorStatus.ACTIVE,
          timestamp: Date.now(),
        },
        {
          sensorId: 'rsi-overbought',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.SHORT,
          status: SensorStatus.ACTIVE,
          timestamp: Date.now(),
        },
      ];

      const signal = generateSignal('BTCUSDT', '1h', 50000, votes);

      expect(signal).toBeNull();
    });

    it('should return null when no ACTIVE sensors fire', () => {
      const votes: SensorVoteWithStatus[] = [
        {
          sensorId: 'new-sensor',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.LONG,
          status: SensorStatus.PROBATION, // Not ACTIVE
          timestamp: Date.now(),
        },
      ];

      const signal = generateSignal('BTCUSDT', '1h', 50000, votes);

      expect(signal).toBeNull();
    });

    it('should use custom BrainConfig for TP/SL', () => {
      const votes: SensorVoteWithStatus[] = [
        {
          sensorId: 'ema-cross',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.LONG,
          status: SensorStatus.ACTIVE,
          timestamp: Date.now(),
        },
      ];

      const customConfig = {
        tpPercent: 0.02,  // 2%
        slPercent: 0.015, // 1.5%
      };

      const signal = generateSignal('BTCUSDT', '1h', 50000, votes, undefined, customConfig);

      expect(signal).not.toBeNull();
      expect(signal!.tp).toBe(51000); // 50000 * 1.02
      expect(signal!.sl).toBe(49250); // 50000 * 0.985
    });

    it('should aggregate multiple ACTIVE LONG votes', () => {
      const votes: SensorVoteWithStatus[] = [
        {
          sensorId: 'ema-cross',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.LONG,
          confidence: 0.8,
          status: SensorStatus.ACTIVE,
          timestamp: Date.now(),
        },
        {
          sensorId: 'volume-spike',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.LONG,
          confidence: 0.6,
          status: SensorStatus.ACTIVE,
          timestamp: Date.now(),
        },
      ];

      const signal = generateSignal('BTCUSDT', '1h', 50000, votes);

      expect(signal).not.toBeNull();
      expect(signal!.direction).toBe(SignalDirection.LONG);
      expect(signal!.sensorVotes).toHaveLength(2);
      expect(signal!.confidence).toBe(0.7); // (0.8 + 0.6) / 2
    });

    it('should respect DEFAULT_BRAIN_CONFIG when no config provided', () => {
      const votes: SensorVoteWithStatus[] = [
        {
          sensorId: 'ema-cross',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.LONG,
          status: SensorStatus.ACTIVE,
          timestamp: Date.now(),
        },
      ];

      const signal = generateSignal('BTCUSDT', '1h', 50000, votes);

      expect(signal).not.toBeNull();
      expect(signal!.tp).toBe(50000 * (1 + DEFAULT_BRAIN_CONFIG.tpPercent));
      expect(signal!.sl).toBe(50000 * (1 - DEFAULT_BRAIN_CONFIG.slPercent));
    });

    it('should detect TRENDING regime and include it in signal', () => {
      const votes: SensorVoteWithStatus[] = [
        {
          sensorId: 'ema-cross',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.LONG,
          status: SensorStatus.ACTIVE,
          timestamp: Date.now(),
        },
      ];

      // High volatility candles
      const candles = Array.from({ length: 20 }, (_, i) => {
        const basePrice = 50000;
        const volatility = 2000; // 4% volatility
        return {
          high: basePrice + i * 100 + volatility,
          low: basePrice + i * 100 - volatility,
          close: basePrice + i * 100,
        };
      });

      const signal = generateSignal('BTCUSDT', '1h', 50000, votes, candles);

      expect(signal).not.toBeNull();
      expect(signal!.regime).toBe(MarketRegime.TRENDING);
    });

    it('should detect RANGING regime and include it in signal', () => {
      const votes: SensorVoteWithStatus[] = [
        {
          sensorId: 'rsi-oversold',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.LONG,
          status: SensorStatus.ACTIVE,
          timestamp: Date.now(),
        },
      ];

      // Low volatility candles
      const candles = Array.from({ length: 20 }, (_, i) => {
        const basePrice = 50000;
        const volatility = 200; // 0.4% volatility
        return {
          high: basePrice + volatility,
          low: basePrice - volatility,
          close: basePrice,
        };
      });

      const signal = generateSignal('BTCUSDT', '1h', 50000, votes, candles);

      expect(signal).not.toBeNull();
      expect(signal!.regime).toBe(MarketRegime.RANGING);
    });

    it('should apply regime gating to filter out EMA cross in RANGING regime', () => {
      const votes: SensorVoteWithStatus[] = [
        {
          sensorId: 'ema-cross',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.LONG,
          status: SensorStatus.ACTIVE,
          timestamp: Date.now(),
        },
      ];

      // Low volatility candles (RANGING regime)
      const candles = Array.from({ length: 20 }, (_, i) => {
        const basePrice = 50000;
        const volatility = 200; // 0.4% volatility
        return {
          high: basePrice + volatility,
          low: basePrice - volatility,
          close: basePrice,
        };
      });

      const regimeGating = [
        { sensorId: 'ema-cross', requiredRegimes: [MarketRegime.TRENDING] },
      ];

      const signal = generateSignal(
        'BTCUSDT',
        '1h',
        50000,
        votes,
        candles,
        DEFAULT_BRAIN_CONFIG,
        undefined,
        regimeGating
      );

      // Should be null because EMA cross is gated out in RANGING regime
      expect(signal).toBeNull();
    });

    it('should allow EMA cross in TRENDING regime with regime gating', () => {
      const votes: SensorVoteWithStatus[] = [
        {
          sensorId: 'ema-cross',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.LONG,
          status: SensorStatus.ACTIVE,
          timestamp: Date.now(),
        },
      ];

      // High volatility candles (TRENDING regime)
      const candles = Array.from({ length: 20 }, (_, i) => {
        const basePrice = 50000;
        const volatility = 2000; // 4% volatility
        return {
          high: basePrice + i * 100 + volatility,
          low: basePrice + i * 100 - volatility,
          close: basePrice + i * 100,
        };
      });

      const regimeGating = [
        { sensorId: 'ema-cross', requiredRegimes: [MarketRegime.TRENDING] },
      ];

      const signal = generateSignal(
        'BTCUSDT',
        '1h',
        52000, // Current price at end of trending move
        votes,
        candles,
        DEFAULT_BRAIN_CONFIG,
        undefined,
        regimeGating
      );

      expect(signal).not.toBeNull();
      expect(signal!.regime).toBe(MarketRegime.TRENDING);
      expect(signal!.direction).toBe(SignalDirection.LONG);
    });

    it('should handle mixed sensors with different regime requirements', () => {
      const votes: SensorVoteWithStatus[] = [
        {
          sensorId: 'ema-cross',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.LONG,
          status: SensorStatus.ACTIVE,
          timestamp: Date.now(),
        },
        {
          sensorId: 'rsi-oversold',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.LONG,
          status: SensorStatus.ACTIVE,
          timestamp: Date.now(),
        },
      ];

      // Low volatility (RANGING regime)
      const candles = Array.from({ length: 20 }, (_, i) => {
        const basePrice = 50000;
        const volatility = 200;
        return {
          high: basePrice + volatility,
          low: basePrice - volatility,
          close: basePrice,
        };
      });

      const regimeGating = [
        { sensorId: 'ema-cross', requiredRegimes: [MarketRegime.TRENDING] },
        { sensorId: 'rsi-oversold', requiredRegimes: [MarketRegime.RANGING] },
      ];

      const signal = generateSignal(
        'BTCUSDT',
        '1h',
        50000,
        votes,
        candles,
        DEFAULT_BRAIN_CONFIG,
        undefined,
        regimeGating
      );

      // Should generate signal with only RSI oversold vote (EMA cross filtered out)
      expect(signal).not.toBeNull();
      expect(signal!.sensorVotes).toHaveLength(1);
      expect(signal!.sensorVotes[0].sensorId).toBe('rsi-oversold');
      expect(signal!.regime).toBe(MarketRegime.RANGING);
    });

    it('should default to UNKNOWN regime when no candles provided', () => {
      const votes: SensorVoteWithStatus[] = [
        {
          sensorId: 'ema-cross',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          fire: true,
          direction: SignalDirection.LONG,
          status: SensorStatus.ACTIVE,
          timestamp: Date.now(),
        },
      ];

      const signal = generateSignal('BTCUSDT', '1h', 50000, votes);

      expect(signal).not.toBeNull();
      expect(signal!.regime).toBe(MarketRegime.UNKNOWN);
    });
  });
});
