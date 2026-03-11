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

      const mockSignal = {
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

      // Open trade (max concurrent = 1)
      const trade = engine.openTrade(mockSignal);
      expect(trade).not.toBeNull();

      // Should have 1 open trade
      let openTrades = controller.getOpenTrades();
      expect(openTrades).toHaveLength(1);
      expect(openTrades[0].id).toBe(trade!.id);
      expect(openTrades[0].status).toBe(TradeStatus.OPEN);

      // Close it
      engine.closeTrade(trade!.id, 51000);

      // Should have 0 open trades now
      openTrades = controller.getOpenTrades();
      expect(openTrades).toHaveLength(0);

      // But getAllTrades should still show the closed trade
      const allTrades = controller.getAllTrades();
      expect(allTrades).toHaveLength(1);
    });
  });
});
