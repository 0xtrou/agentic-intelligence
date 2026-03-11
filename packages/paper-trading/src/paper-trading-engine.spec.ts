/**
 * @module paper-trading-engine.spec
 * @description Tests for paper trading engine.
 *
 * Validates:
 * - Position tracking (entry, P&L calculation)
 * - TP/SL auto-close logic
 * - Outcome determination (WIN/LOSS/BREAKEVEN)
 * - Bayesian posterior updates
 * - Concurrent position limits
 * - Balance management
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PaperTradingEngine } from './paper-trading-engine';
import {
  Signal,
  SignalDirection,
  TradeStatus,
  TradeOutcome,
  SensorVote,
  MarketRegime,
} from '@agentic-intelligence/core';

describe('PaperTradingEngine', () => {
  let engine: PaperTradingEngine;

  beforeEach(() => {
    engine = new PaperTradingEngine({
      initialBalance: 10000,
      positionSizePercent: 1,
      maxConcurrentPositions: 3,
    });
  });

  describe('openTrade', () => {
    it('should open a trade from a signal', () => {
      const signal = createMockSignal({
        direction: SignalDirection.LONG,
        entry: 50000,
        tp: 51000,
        sl: 49500,
      });

      const trade = engine.openTrade(signal);

      expect(trade).not.toBeNull();
      expect(trade?.status).toBe(TradeStatus.OPEN);
      expect(trade?.direction).toBe(SignalDirection.LONG);
      expect(trade?.entry).toBe(50000);
      expect(trade?.tp).toBe(51000);
      expect(trade?.sl).toBe(49500);
      expect(trade?.size).toBe(100); // 1% of 10000
    });

    it('should reject trade when max concurrent positions reached', () => {
      const signal = createMockSignal();

      // Open 3 trades
      engine.openTrade(signal);
      engine.openTrade(signal);
      engine.openTrade(signal);

      // 4th trade should be rejected
      const rejected = engine.openTrade(signal);
      expect(rejected).toBeNull();
    });

    it('should track sensor votes in trade record', () => {
      const signal = createMockSignal({
        sensorVotes: [
          { sensorId: 'ema-cross', fire: true, direction: SignalDirection.LONG, symbol: 'BTCUSDT', timeframe: '1h', timestamp: Date.now() },
          { sensorId: 'funding-div', fire: true, direction: SignalDirection.LONG, symbol: 'BTCUSDT', timeframe: '1h', timestamp: Date.now() },
        ],
      });

      const trade = engine.openTrade(signal);

      expect(trade?.sensorVotes).toEqual(['ema-cross', 'funding-div']);
    });
  });

  describe('updatePositions - TP/SL logic', () => {
    it('should close LONG trade when TP hit', () => {
      const signal = createMockSignal({
        direction: SignalDirection.LONG,
        entry: 50000,
        tp: 51000,
        sl: 49500,
      });

      engine.openTrade(signal);

      // Price hits TP
      const closedTrades = engine.updatePositions('BTCUSDT', 51000);

      expect(closedTrades).toHaveLength(1);
      expect(closedTrades[0].status).toBe(TradeStatus.CLOSED);
      expect(closedTrades[0].exitPrice).toBe(51000);
      expect(closedTrades[0].outcome).toBe(TradeOutcome.WIN);
    });

    it('should close LONG trade when SL hit', () => {
      const signal = createMockSignal({
        direction: SignalDirection.LONG,
        entry: 50000,
        tp: 51000,
        sl: 49500,
      });

      engine.openTrade(signal);

      // Price hits SL
      const closedTrades = engine.updatePositions('BTCUSDT', 49500);

      expect(closedTrades).toHaveLength(1);
      expect(closedTrades[0].status).toBe(TradeStatus.CLOSED);
      expect(closedTrades[0].exitPrice).toBe(49500);
      expect(closedTrades[0].outcome).toBe(TradeOutcome.LOSS);
    });

    it('should close SHORT trade when TP hit', () => {
      const signal = createMockSignal({
        direction: SignalDirection.SHORT,
        entry: 50000,
        tp: 49000,
        sl: 50500,
      });

      engine.openTrade(signal);

      // Price hits TP (goes down)
      const closedTrades = engine.updatePositions('BTCUSDT', 49000);

      expect(closedTrades).toHaveLength(1);
      expect(closedTrades[0].status).toBe(TradeStatus.CLOSED);
      expect(closedTrades[0].exitPrice).toBe(49000);
      expect(closedTrades[0].outcome).toBe(TradeOutcome.WIN);
    });

    it('should close SHORT trade when SL hit', () => {
      const signal = createMockSignal({
        direction: SignalDirection.SHORT,
        entry: 50000,
        tp: 49000,
        sl: 50500,
      });

      engine.openTrade(signal);

      // Price hits SL (goes up)
      const closedTrades = engine.updatePositions('BTCUSDT', 50500);

      expect(closedTrades).toHaveLength(1);
      expect(closedTrades[0].status).toBe(TradeStatus.CLOSED);
      expect(closedTrades[0].exitPrice).toBe(50500);
      expect(closedTrades[0].outcome).toBe(TradeOutcome.LOSS);
    });

    it('should not close trade when price between TP and SL', () => {
      const signal = createMockSignal({
        direction: SignalDirection.LONG,
        entry: 50000,
        tp: 51000,
        sl: 49500,
      });

      engine.openTrade(signal);

      // Price moves but doesn't hit TP or SL
      const closedTrades = engine.updatePositions('BTCUSDT', 50200);

      expect(closedTrades).toHaveLength(0);
      expect(engine.getOpenTrades()).toHaveLength(1);
    });
  });

  describe('P&L calculation', () => {
    it('should calculate correct P&L for winning LONG trade', () => {
      const signal = createMockSignal({
        direction: SignalDirection.LONG,
        entry: 50000,
        tp: 51000,
        sl: 49500,
      });

      const trade = engine.openTrade(signal);
      engine.updatePositions('BTCUSDT', 51000);

      const closedTrade = engine.getTrades().find((t) => t.id === trade?.id);

      // Position size = 100 USD
      // Entry = 50000, Exit = 51000
      // Contracts = 100 / 50000 = 0.002
      // P&L = (51000 - 50000) * 0.002 = 2 USD
      expect(closedTrade?.pnl).toBeCloseTo(2, 2);
      expect(closedTrade?.pnlPercent).toBeCloseTo(2, 2); // 2% gain
    });

    it('should calculate correct P&L for losing SHORT trade', () => {
      const signal = createMockSignal({
        direction: SignalDirection.SHORT,
        entry: 50000,
        tp: 49000,
        sl: 50500,
      });

      const trade = engine.openTrade(signal);
      engine.updatePositions('BTCUSDT', 50500);

      const closedTrade = engine.getTrades().find((t) => t.id === trade?.id);

      // Position size = 100 USD
      // Entry = 50000, Exit = 50500 (SL hit)
      // Contracts = 100 / 50000 = 0.002
      // P&L = (50000 - 50500) * 0.002 = -1 USD
      expect(closedTrade?.pnl).toBeCloseTo(-1, 2);
      expect(closedTrade?.pnlPercent).toBeCloseTo(-1, 2); // -1% loss
    });

    it('should calculate unrealized P&L for open position', () => {
      const signal = createMockSignal({
        direction: SignalDirection.LONG,
        entry: 50000,
        tp: 51000,
        sl: 49500,
      });

      const trade = engine.openTrade(signal);

      // Price moves up but doesn't hit TP
      const unrealizedPnL = engine.getUnrealizedPnL(trade!.id, 50500);

      // Contracts = 100 / 50000 = 0.002
      // Unrealized P&L = (50500 - 50000) * 0.002 = 1 USD
      expect(unrealizedPnL).toBeCloseTo(1, 2);
    });
  });

  describe('Bayesian posterior updates', () => {
    it('should update sensor posterior on winning trade', () => {
      const signal = createMockSignal({
        direction: SignalDirection.LONG,
        entry: 50000,
        tp: 51000,
        sl: 49500,
        sensorVotes: [
          { sensorId: 'test-sensor', fire: true, direction: SignalDirection.LONG, symbol: 'BTCUSDT', timeframe: '1h', timestamp: Date.now() },
        ],
      });

      engine.openTrade(signal);
      engine.updatePositions('BTCUSDT', 51000); // TP hit → WIN

      const posterior = engine.getSensorPosterior('test-sensor');

      // Prior: Beta(3, 3)
      // After 1 win: Beta(4, 3)
      expect(posterior?.alpha).toBe(4);
      expect(posterior?.beta).toBe(3);
    });

    it('should update sensor posterior on losing trade', () => {
      const signal = createMockSignal({
        direction: SignalDirection.LONG,
        entry: 50000,
        tp: 51000,
        sl: 49500,
        sensorVotes: [
          { sensorId: 'test-sensor', fire: true, direction: SignalDirection.LONG, symbol: 'BTCUSDT', timeframe: '1h', timestamp: Date.now() },
        ],
      });

      engine.openTrade(signal);
      engine.updatePositions('BTCUSDT', 49500); // SL hit → LOSS

      const posterior = engine.getSensorPosterior('test-sensor');

      // Prior: Beta(3, 3)
      // After 1 loss: Beta(3, 4)
      expect(posterior?.alpha).toBe(3);
      expect(posterior?.beta).toBe(4);
    });

    it('should not update posterior on BREAKEVEN trade', () => {
      const signal = createMockSignal({
        direction: SignalDirection.LONG,
        entry: 50000,
        tp: 51000,
        sl: 49500,
        sensorVotes: [
          { sensorId: 'test-sensor', fire: true, direction: SignalDirection.LONG, symbol: 'BTCUSDT', timeframe: '1h', timestamp: Date.now() },
        ],
      });

      const trade = engine.openTrade(signal);
      // Close at entry price → BREAKEVEN
      engine.closeTrade(trade!.id, 50000);

      const posterior = engine.getSensorPosterior('test-sensor');

      // BREAKEVEN doesn't initialize posterior — sensor remains untracked
      expect(posterior).toBeUndefined();
    });

    it('should update multiple sensors on a single trade', () => {
      const signal = createMockSignal({
        direction: SignalDirection.LONG,
        entry: 50000,
        tp: 51000,
        sl: 49500,
        sensorVotes: [
          { sensorId: 'sensor-a', fire: true, direction: SignalDirection.LONG, symbol: 'BTCUSDT', timeframe: '1h', timestamp: Date.now() },
          { sensorId: 'sensor-b', fire: true, direction: SignalDirection.LONG, symbol: 'BTCUSDT', timeframe: '1h', timestamp: Date.now() },
        ],
      });

      engine.openTrade(signal);
      engine.updatePositions('BTCUSDT', 51000); // WIN

      const posteriorA = engine.getSensorPosterior('sensor-a');
      const posteriorB = engine.getSensorPosterior('sensor-b');

      expect(posteriorA?.alpha).toBe(4);
      expect(posteriorB?.alpha).toBe(4);
    });
  });

  describe('balance management', () => {
    it('should update balance on winning trade', () => {
      const initialBalance = engine.getBalance();

      const signal = createMockSignal({
        direction: SignalDirection.LONG,
        entry: 50000,
        tp: 51000,
        sl: 49500,
      });

      engine.openTrade(signal);
      engine.updatePositions('BTCUSDT', 51000); // WIN

      const finalBalance = engine.getBalance();

      expect(finalBalance).toBeGreaterThan(initialBalance);
    });

    it('should update balance on losing trade', () => {
      const initialBalance = engine.getBalance();

      const signal = createMockSignal({
        direction: SignalDirection.LONG,
        entry: 50000,
        tp: 51000,
        sl: 49500,
      });

      engine.openTrade(signal);
      engine.updatePositions('BTCUSDT', 49500); // LOSS

      const finalBalance = engine.getBalance();

      expect(finalBalance).toBeLessThan(initialBalance);
    });
  });

  describe('getOpenTrades', () => {
    it('should return only open trades', () => {
      const signal = createMockSignal();

      engine.openTrade(signal);
      engine.openTrade(signal);
      const trade3 = engine.openTrade(signal);

      // Close one trade
      engine.closeTrade(trade3!.id, 50000);

      const openTrades = engine.getOpenTrades();

      expect(openTrades).toHaveLength(2);
      expect(openTrades.every((t) => t.status === TradeStatus.OPEN)).toBe(true);
    });
  });
});

/**
 * Helper to create a mock signal for testing.
 */
function createMockSignal(overrides: Partial<Signal> = {}): Signal {
  const defaultSensorVote: SensorVote = {
    sensorId: 'mock-sensor',
    symbol: 'BTCUSDT',
    timeframe: '1h',
    fire: true,
    direction: SignalDirection.LONG,
    timestamp: Date.now(),
  };

  return {
    id: `signal_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    symbol: 'BTCUSDT',
    direction: SignalDirection.LONG,
    entry: 50000,
    tp: 51000,
    sl: 49500,
    timeframe: '1h',
    confidence: 0.7,
    sensorVotes: [defaultSensorVote],
    regime: MarketRegime.TRENDING,
    timestamp: Date.now(),
    ...overrides,
  };
}
