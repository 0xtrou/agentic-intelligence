/**
 * @module FundingRateSensor.spec
 * @description Tests for FundingRateSensor implementation.
 *
 * Covers: threshold logic, direction mapping, rate-of-change refinement,
 * edge cases, configurability, determinism, and metadata completeness.
 */

import { describe, it, expect } from 'vitest';
import { FundingRateSensor } from './FundingRateSensor';
import type { FundingRate } from '@agentic-intelligence/core';

/**
 * Helper to create a FundingRate snapshot.
 *
 * @param rate - Funding rate value (e.g., 0.001 = 0.1%)
 * @param index - Index used to generate unique timestamps
 * @param symbol - Trading pair symbol (default: BTCUSDT)
 * @returns FundingRate object
 */
function createFundingRate(rate: number, index: number, symbol = 'BTCUSDT'): FundingRate {
  return {
    symbol,
    rate,
    nextFundingTime: (index + 1) * 28800000, // 8h intervals
    timestamp: index * 28800000,
  };
}

/**
 * Create a series of FundingRate snapshots from an array of rate values.
 *
 * @param rates - Array of funding rate values
 * @param symbol - Trading pair symbol (default: BTCUSDT)
 * @returns Array of FundingRate objects
 */
function createRates(rates: number[], symbol = 'BTCUSDT'): FundingRate[] {
  return rates.map((r, i) => createFundingRate(r, i, symbol));
}

describe('FundingRateSensor', () => {
  describe('constructor', () => {
    it('should create sensor with default config', () => {
      const sensor = new FundingRateSensor('fr-test');
      expect(sensor.id).toBe('fr-test');
    });

    it('should create sensor with custom config', () => {
      const sensor = new FundingRateSensor('fr-custom', {
        threshold: 0.001,
        lookback: 5,
      });
      expect(sensor.id).toBe('fr-custom');
    });

    it('should throw error for non-positive threshold', () => {
      expect(() => new FundingRateSensor('bad', { threshold: 0 }))
        .toThrow('Threshold must be positive');
      expect(() => new FundingRateSensor('bad', { threshold: -0.001 }))
        .toThrow('Threshold must be positive');
    });

    it('should throw error for lookback < 1', () => {
      expect(() => new FundingRateSensor('bad', { lookback: 0 }))
        .toThrow('Lookback must be >= 1');
    });
  });

  describe('direction logic', () => {
    it('should fire SHORT when funding > threshold (longs crowded)', () => {
      const sensor = new FundingRateSensor('fr-test', { threshold: 0.0005 });

      // Accelerating positive funding: 0.0006 → 0.0008 → 0.001
      const rates = createRates([0.0006, 0.0008, 0.001]);
      const vote = sensor.evaluate(rates);

      expect(vote.fire).toBe(true);
      expect(vote.direction).toBe('SHORT');
      expect(vote.sensorId).toBe('fr-test');
      expect(vote.symbol).toBe('BTCUSDT');
    });

    it('should fire LONG when funding < -threshold (shorts crowded)', () => {
      const sensor = new FundingRateSensor('fr-test', { threshold: 0.0005 });

      // Accelerating negative funding: -0.0006 → -0.0008 → -0.001
      const rates = createRates([-0.0006, -0.0008, -0.001]);
      const vote = sensor.evaluate(rates);

      expect(vote.fire).toBe(true);
      expect(vote.direction).toBe('LONG');
    });

    it('should NOT fire when funding is within threshold', () => {
      const sensor = new FundingRateSensor('fr-test', { threshold: 0.0005 });

      // Rates within ±0.0005
      const rates = createRates([0.0001, 0.0002, 0.0003]);
      const vote = sensor.evaluate(rates);

      expect(vote.fire).toBe(false);
      expect(vote.direction).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should handle zero funding rate', () => {
      const sensor = new FundingRateSensor('fr-test');

      const rates = createRates([0, 0, 0]);
      const vote = sensor.evaluate(rates);

      expect(vote.fire).toBe(false);
      expect(vote.direction).toBeUndefined();
    });

    it('should handle empty rates array gracefully (return vote=0)', () => {
      const sensor = new FundingRateSensor('fr-test');

      const vote = sensor.evaluate([]);

      expect(vote.fire).toBe(false);
      expect(vote.sensorId).toBe('fr-test');
      expect(vote.data?.reason).toBe('no_data');
    });

    it('should handle undefined rates gracefully (return vote=0)', () => {
      const sensor = new FundingRateSensor('fr-test');

      // Cast to simulate missing data
      const vote = sensor.evaluate(undefined as unknown as FundingRate[]);

      expect(vote.fire).toBe(false);
      expect(vote.data?.reason).toBe('no_data');
    });

    it('should handle exactly at positive threshold boundary', () => {
      const sensor = new FundingRateSensor('fr-test', { threshold: 0.0005 });

      // Average exactly at threshold — should NOT fire (need to exceed, not equal)
      const rates = createRates([0.0005, 0.0005, 0.0005]);
      const vote = sensor.evaluate(rates);

      expect(vote.fire).toBe(false);
    });

    it('should handle exactly at negative threshold boundary', () => {
      const sensor = new FundingRateSensor('fr-test', { threshold: 0.0005 });

      // Average exactly at -threshold — should NOT fire
      const rates = createRates([-0.0005, -0.0005, -0.0005]);
      const vote = sensor.evaluate(rates);

      expect(vote.fire).toBe(false);
    });

    it('should handle single funding rate entry', () => {
      const sensor = new FundingRateSensor('fr-test', { threshold: 0.0005 });

      // Single extreme entry — fires with reduced confidence (no RoC data)
      const rates = createRates([0.001]);
      const vote = sensor.evaluate(rates);

      expect(vote.fire).toBe(true);
      expect(vote.direction).toBe('SHORT');
      expect(vote.confidence).toBe(0.7); // Single-point confidence
    });
  });

  describe('configurable threshold', () => {
    it('should use custom threshold', () => {
      // With default threshold (0.0005), rate 0.0003 would NOT fire
      const defaultSensor = new FundingRateSensor('default');
      const defaultVote = defaultSensor.evaluate(createRates([0.0003, 0.0003, 0.0004]));
      expect(defaultVote.fire).toBe(false);

      // With lower threshold (0.0002), same rate SHOULD fire
      const sensitiveSensor = new FundingRateSensor('sensitive', { threshold: 0.0002 });
      const sensitiveVote = sensitiveSensor.evaluate(createRates([0.0003, 0.0003, 0.0004]));
      expect(sensitiveVote.fire).toBe(true);
      expect(sensitiveVote.direction).toBe('SHORT');
    });
  });

  describe('determinism', () => {
    it('should produce identical output for identical input', () => {
      const sensor = new FundingRateSensor('fr-det', { threshold: 0.0005 });
      const rates = createRates([0.0006, 0.0008, 0.001]);

      const vote1 = sensor.evaluate(rates);
      const vote2 = sensor.evaluate(rates);

      expect(vote1.fire).toBe(vote2.fire);
      expect(vote1.direction).toBe(vote2.direction);
      expect(vote1.confidence).toBe(vote2.confidence);
      expect(vote1.data).toEqual(vote2.data);
    });
  });

  describe('metadata', () => {
    it('should include funding rate and threshold in vote data', () => {
      const sensor = new FundingRateSensor('fr-meta', { threshold: 0.0005, lookback: 3 });
      const rates = createRates([0.0006, 0.0008, 0.001]);
      const vote = sensor.evaluate(rates);

      expect(vote.data).toBeDefined();
      expect(vote.data?.funding_rate).toBe(0.001);
      expect(vote.data?.threshold).toBe(0.0005);
      expect(vote.data?.lookback).toBe(3);
      expect(vote.data?.avg_funding_rate).toBeTypeOf('number');
      expect(vote.data?.rate_of_change).toBeTypeOf('number');
      expect(vote.data?.window_size).toBe(3);
    });

    it('should include metadata even when not firing', () => {
      const sensor = new FundingRateSensor('fr-meta', { threshold: 0.0005 });
      const rates = createRates([0.0001, 0.0002, 0.0001]);
      const vote = sensor.evaluate(rates);

      expect(vote.fire).toBe(false);
      expect(vote.data?.funding_rate).toBeDefined();
      expect(vote.data?.threshold).toBe(0.0005);
    });
  });

  describe('rate of change', () => {
    it('should fire with high confidence when rate is accelerating', () => {
      const sensor = new FundingRateSensor('fr-roc', { threshold: 0.0005 });

      // Funding getting more extreme: 0.0006 → 0.0008 → 0.001
      const rates = createRates([0.0006, 0.0008, 0.001]);
      const vote = sensor.evaluate(rates);

      expect(vote.fire).toBe(true);
      expect(vote.confidence).toBe(1.0);
      expect(vote.data?.rate_of_change).toBeGreaterThan(0);
    });

    it('should NOT fire when extreme funding is already reverting', () => {
      const sensor = new FundingRateSensor('fr-roc', { threshold: 0.0005 });

      // Funding was extreme but is now declining: 0.002 → 0.001 → 0.0006
      // Average is still > threshold, but rate of change is negative
      const rates = createRates([0.002, 0.001, 0.0006]);
      const vote = sensor.evaluate(rates);

      expect(vote.fire).toBe(false);
      expect(vote.data?.reason).toBe('extreme_but_reverting');
    });

    it('should fire with high confidence when negative rate is accelerating', () => {
      const sensor = new FundingRateSensor('fr-roc', { threshold: 0.0005 });

      // Shorts getting more crowded: -0.0006 → -0.0008 → -0.001
      const rates = createRates([-0.0006, -0.0008, -0.001]);
      const vote = sensor.evaluate(rates);

      expect(vote.fire).toBe(true);
      expect(vote.direction).toBe('LONG');
      expect(vote.confidence).toBe(1.0);
      expect(vote.data?.rate_of_change).toBeLessThan(0);
    });

    it('should NOT fire when negative extreme is already reverting', () => {
      const sensor = new FundingRateSensor('fr-roc', { threshold: 0.0005 });

      // Was extreme negative but recovering: -0.002 → -0.001 → -0.0006
      const rates = createRates([-0.002, -0.001, -0.0006]);
      const vote = sensor.evaluate(rates);

      expect(vote.fire).toBe(false);
      expect(vote.data?.reason).toBe('extreme_but_reverting');
    });

    it('should handle flat extreme funding (no change) as non-reverting', () => {
      const sensor = new FundingRateSensor('fr-roc', { threshold: 0.0005 });

      // Flat extreme: 0.001 → 0.001 → 0.001 (rateOfChange = 0)
      // Not accelerating, but also not reverting — rateOfChange is 0
      // For positive extreme: isAccelerating = (0 > 0) = false → doesn't fire
      const rates = createRates([0.001, 0.001, 0.001]);
      const vote = sensor.evaluate(rates);

      // Flat = not accelerating → treated as reverting → no fire
      expect(vote.fire).toBe(false);
    });
  });

  describe('lookback window', () => {
    it('should use configured lookback to slice rates', () => {
      // With lookback=2, only last 2 rates matter
      const sensor = new FundingRateSensor('fr-lb', { threshold: 0.0005, lookback: 2 });

      // Old rates are within threshold, recent rates are extreme and accelerating
      const rates = createRates([0.0001, 0.0002, 0.0008, 0.001]);
      const vote = sensor.evaluate(rates);

      // Only last 2 (0.0008, 0.001) are considered — avg=0.0009 > 0.0005, accelerating
      expect(vote.fire).toBe(true);
      expect(vote.direction).toBe('SHORT');
    });

    it('should handle fewer rates than lookback', () => {
      const sensor = new FundingRateSensor('fr-lb', { threshold: 0.0005, lookback: 10 });

      // Only 2 rates provided, lookback is 10
      const rates = createRates([0.0008, 0.001]);
      const vote = sensor.evaluate(rates);

      // Should use all available rates (2 of requested 10)
      expect(vote.fire).toBe(true);
      expect(vote.data?.window_size).toBe(2);
    });
  });

  describe('symbol handling', () => {
    it('should use symbol from the latest funding rate entry', () => {
      const sensor = new FundingRateSensor('fr-sym', { threshold: 0.0005 });

      const rates = createRates([0.0006, 0.0008, 0.001], 'ETHUSDT');
      const vote = sensor.evaluate(rates);

      expect(vote.symbol).toBe('ETHUSDT');
    });
  });
});
