/**
 * @module brain.spec
 * @description Tests for signal aggregation and generation.
 */

import { describe, it, expect } from 'vitest';
import {
  generateSignal,
  aggregateSensorVotes,
  calculateTP,
  calculateSL,
  calculateConfidence,
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

      expect(tp).toBe(50750); // 50000 * 1.015
    });

    it('should calculate TP below entry for SHORT', () => {
      const entry = 50000;
      const tp = calculateTP(entry, SignalDirection.SHORT, 0.015);

      expect(tp).toBe(49250); // 50000 * 0.985
    });
  });

  describe('calculateSL', () => {
    it('should calculate SL below entry for LONG', () => {
      const entry = 50000;
      const sl = calculateSL(entry, SignalDirection.LONG, 0.01);

      expect(sl).toBe(49500); // 50000 * 0.99
    });

    it('should calculate SL above entry for SHORT', () => {
      const entry = 50000;
      const sl = calculateSL(entry, SignalDirection.SHORT, 0.01);

      expect(sl).toBe(50500); // 50000 * 1.01
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

  describe('detectRegime', () => {
    it('should always return UNKNOWN in MVP', () => {
      expect(detectRegime('BTCUSDT')).toBe(MarketRegime.UNKNOWN);
      expect(detectRegime('ETHUSDT')).toBe(MarketRegime.UNKNOWN);
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
      expect(signal!.tp).toBe(50750); // 50000 * 1.015
      expect(signal!.sl).toBe(49500); // 50000 * 0.99
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
      expect(signal!.tp).toBe(49250); // 50000 * 0.985
      expect(signal!.sl).toBe(50500); // 50000 * 1.01
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

      const signal = generateSignal('BTCUSDT', '1h', 50000, votes, customConfig);

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
  });
});
