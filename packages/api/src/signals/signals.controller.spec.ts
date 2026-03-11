/**
 * @file signals.controller.spec.ts
 * @description Tests for signals controller — delegates to SignalsService.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignalsController } from './signals.controller';
import { SignalsService } from './signals.service';
import { SignalDirection } from '@agentic-intelligence/core';

describe('SignalsController', () => {
  let controller: SignalsController;
  let mockService: any;

  beforeEach(() => {
    mockService = {
      generateSignalOnDemand: vi.fn(),
      getSensorHealth: vi.fn(),
      getEvaluationLog: vi.fn(),
    };

    controller = new SignalsController(mockService as SignalsService);
  });

  describe('getSignals', () => {
    it('should return empty signals when no sensors fire', async () => {
      mockService.generateSignalOnDemand.mockResolvedValue({
        version: 'test',
        signals: [],
        sensorVotes: [],
      });

      const result = await controller.getSignals('BTCUSDT', '4h', '50');

      expect(result.signals).toEqual([]);
      expect(mockService.generateSignalOnDemand).toHaveBeenCalledWith('BTCUSDT', '4h', 50);
    });

    it('should return signals from service', async () => {
      const mockSignal = {
        id: 'test-id',
        symbol: 'BTCUSDT',
        direction: SignalDirection.LONG,
        entry: 50200,
        tp: 50953,
        sl: 49698,
        timeframe: '4h',
        timestamp: Date.now(),
        sensorVotes: [],
      };

      mockService.generateSignalOnDemand.mockResolvedValue({
        version: 'test',
        signals: [mockSignal],
        sensorVotes: [],
      });

      const result = await controller.getSignals('BTCUSDT', '4h', '50');

      expect(result.signals).toHaveLength(1);
      expect(result.signals[0].direction).toBe(SignalDirection.LONG);
      expect(result.version).toBe('test');
    });

    it('should use default parameters when not provided', async () => {
      mockService.generateSignalOnDemand.mockResolvedValue({
        version: 'test',
        signals: [],
        sensorVotes: [],
      });

      await controller.getSignals();

      expect(mockService.generateSignalOnDemand).toHaveBeenCalledWith('BTCUSDT', '4h', 50);
    });
  });

  describe('getSensorHealth', () => {
    it('should return sensor health from service', () => {
      const mockHealth = {
        ema: { lastEval: new Date().toISOString() },
        funding: { lastEval: new Date().toISOString() },
      };
      mockService.getSensorHealth.mockReturnValue(mockHealth);

      const result = controller.getSensorHealth();

      expect(result).toEqual(mockHealth);
    });
  });

  describe('getEvaluationLog', () => {
    it('should return evaluation log with limit', () => {
      const mockLog = [{ sensorId: 'test', fired: false }];
      mockService.getEvaluationLog.mockReturnValue(mockLog);

      const result = controller.getEvaluationLog('10');

      expect(result).toEqual(mockLog);
      expect(mockService.getEvaluationLog).toHaveBeenCalledWith(10);
    });
  });
});
