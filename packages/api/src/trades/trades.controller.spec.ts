/**
 * @module trades.controller.spec
 * @description Tests for trades controller.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TradesController } from './trades.controller';
import { TradesService } from './trades.service';
import { TradeStatus } from '@agentic-intelligence/core';

describe('TradesController', () => {
  let controller: TradesController;
  let service: TradesService;

  beforeEach(() => {
    service = new TradesService();
    controller = new TradesController(service);
  });

  describe('getAllTrades', () => {
    it('should return empty array when no trades', () => {
      const trades = controller.getAllTrades();
      expect(trades).toEqual([]);
    });
  });

  describe('getOpenTrades', () => {
    it('should return empty array when no open trades', () => {
      const openTrades = controller.getOpenTrades();
      expect(openTrades).toEqual([]);
    });

    it('should return only open trades', () => {
      const engine = service.getEngine();

      // Mock signals for testing
      const mockSignal1 = {
        id: 'test-signal-1',
        symbol: 'BTCUSDT',
        direction: 1, // LONG
        entry: 50000,
        tp: 51000,
        sl: 49500,
        timeframe: '1h' as const,
        confidence: 0.7,
        sensorVotes: [],
        regime: 2, // UNKNOWN
        timestamp: Date.now(),
      };

      const mockSignal2 = {
        id: 'test-signal-2',
        symbol: 'BTCUSDT',
        direction: 1, // LONG
        entry: 51000,
        tp: 52000,
        sl: 50500,
        timeframe: '1h' as const,
        confidence: 0.7,
        sensorVotes: [],
        regime: 2, // UNKNOWN
        timestamp: Date.now(),
      };

      // Open first trade
      const trade1 = engine.openTrade(mockSignal1);
      expect(trade1).not.toBeNull();

      // Close it
      engine.closeTrade(trade1!.id, 51000);

      // Open second trade (now that first is closed, we're under max concurrent)
      const trade2 = engine.openTrade(mockSignal2);
      expect(trade2).not.toBeNull();

      // getOpenTrades should only return trade2
      const openTrades = controller.getOpenTrades();
      expect(openTrades).toHaveLength(1);
      expect(openTrades[0].id).toBe(trade2!.id);
      expect(openTrades[0].status).toBe(TradeStatus.OPEN);
    });
  });
});
