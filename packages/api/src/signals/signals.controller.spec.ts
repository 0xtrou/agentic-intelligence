/**
 * @file signals.controller.spec.ts
 * @description Tests for signals endpoint.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignalsController } from './signals.controller';
import { BybitRestClient } from '@agentic-intelligence/exchange';
import { EmaCrossSensor } from '@agentic-intelligence/sensors';
import { SensorStatus, SignalDirection, type Candle } from '@agentic-intelligence/core';

// Mock dependencies
vi.mock('@agentic-intelligence/exchange');
vi.mock('@agentic-intelligence/sensors');

describe('SignalsController', () => {
  let controller: SignalsController;
  let mockBybit: any;
  let mockSensor: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Mock Bybit client
    mockBybit = {
      getCandles: vi.fn(),
    };
    (BybitRestClient as any).mockImplementation(() => mockBybit);

    // Mock sensor
    mockSensor = {
      evaluate: vi.fn(),
    };
    (EmaCrossSensor as any).mockImplementation(() => mockSensor);

    controller = new SignalsController();
  });

  describe('getSignals', () => {
    it('should return empty signals when sensor does not fire', async () => {
      // Mock candles
      const mockCandles: Candle[] = [
        {
          symbol: 'BTCUSDT',
          timeframe: '4h',
          openTime: 1000000,
          closeTime: 1014400000,
          open: 50000,
          high: 50500,
          low: 49500,
          close: 50200,
          volume: 1000,
        },
      ];

      // Mock sensor vote (no fire)
      const mockVote = {
        sensorId: 'ema-cross-9-21',
        symbol: 'BTCUSDT',
        timeframe: '4h' as const,
        fire: false,
        timestamp: Date.now(),
        data: { ema_fast: 50100, ema_slow: 50000 },
      };

      mockBybit.getCandles.mockResolvedValue(mockCandles);
      mockSensor.evaluate.mockReturnValue(mockVote);

      const result = await controller.getSignals('BTCUSDT', '4h', '50');

      expect(result.signals).toEqual([]);
      expect(result.sensorVote).toEqual(mockVote);
      expect(mockBybit.getCandles).toHaveBeenCalledWith('BTCUSDT', '4h', 50);
      expect(mockSensor.evaluate).toHaveBeenCalledWith(mockCandles);
    });

    it('should generate LONG signal when sensor fires bullish', async () => {
      const mockCandles: Candle[] = [
        {
          symbol: 'BTCUSDT',
          timeframe: '4h',
          openTime: 1000000,
          closeTime: 1014400000,
          open: 50000,
          high: 50500,
          low: 49500,
          close: 50200,
          volume: 1000,
        },
      ];

      const mockVote = {
        sensorId: 'ema-cross-9-21',
        symbol: 'BTCUSDT',
        timeframe: '4h' as const,
        fire: true,
        direction: SignalDirection.LONG,
        timestamp: Date.now(),
        data: { ema_fast: 50300, ema_slow: 50000 },
      };

      mockBybit.getCandles.mockResolvedValue(mockCandles);
      mockSensor.evaluate.mockReturnValue(mockVote);

      const result = await controller.getSignals('BTCUSDT', '4h', '50');

      expect(result.signals).toHaveLength(1);
      expect(result.signals[0].direction).toBe(SignalDirection.LONG);
      expect(result.signals[0].symbol).toBe('BTCUSDT');
      expect(result.signals[0].entry).toBe(50200);
      expect(result.signals[0].tp).toBeGreaterThan(50200); // TP above entry for LONG
      expect(result.signals[0].sl).toBeLessThan(50200); // SL below entry for LONG
    });

    it('should generate SHORT signal when sensor fires bearish', async () => {
      const mockCandles: Candle[] = [
        {
          symbol: 'BTCUSDT',
          timeframe: '4h',
          openTime: 1000000,
          closeTime: 1014400000,
          open: 50000,
          high: 50500,
          low: 49500,
          close: 50200,
          volume: 1000,
        },
      ];

      const mockVote = {
        sensorId: 'ema-cross-9-21',
        symbol: 'BTCUSDT',
        timeframe: '4h' as const,
        fire: true,
        direction: SignalDirection.SHORT,
        timestamp: Date.now(),
        data: { ema_fast: 49900, ema_slow: 50200 },
      };

      mockBybit.getCandles.mockResolvedValue(mockCandles);
      mockSensor.evaluate.mockReturnValue(mockVote);

      const result = await controller.getSignals('BTCUSDT', '4h', '50');

      expect(result.signals).toHaveLength(1);
      expect(result.signals[0].direction).toBe(SignalDirection.SHORT);
      expect(result.signals[0].symbol).toBe('BTCUSDT');
      expect(result.signals[0].entry).toBe(50200);
      expect(result.signals[0].tp).toBeLessThan(50200); // TP below entry for SHORT
      expect(result.signals[0].sl).toBeGreaterThan(50200); // SL above entry for SHORT
    });

    it('should attach ACTIVE status to sensor votes', async () => {
      const mockCandles: Candle[] = [
        {
          symbol: 'BTCUSDT',
          timeframe: '4h',
          openTime: 1000000,
          closeTime: 1014400000,
          open: 50000,
          high: 50500,
          low: 49500,
          close: 50200,
          volume: 1000,
        },
      ];

      const mockVote = {
        sensorId: 'ema-cross-9-21',
        symbol: 'BTCUSDT',
        timeframe: '4h' as const,
        fire: true,
        direction: SignalDirection.LONG,
        timestamp: Date.now(),
        data: {},
      };

      mockBybit.getCandles.mockResolvedValue(mockCandles);
      mockSensor.evaluate.mockReturnValue(mockVote);

      const result = await controller.getSignals();

      expect(result.signals[0].sensorVotes[0]).toMatchObject({
        ...mockVote,
        status: SensorStatus.ACTIVE,
      });
    });

    it('should use default parameters when not provided', async () => {
      const mockCandles: Candle[] = [];
      const mockVote = {
        sensorId: 'ema-cross-9-21',
        symbol: 'BTCUSDT',
        timeframe: '4h' as const,
        fire: false,
        timestamp: Date.now(),
        data: {},
      };

      mockBybit.getCandles.mockResolvedValue(mockCandles);
      mockSensor.evaluate.mockReturnValue(mockVote);

      await controller.getSignals();

      expect(mockBybit.getCandles).toHaveBeenCalledWith('BTCUSDT', '4h', 50);
    });

    it('should parse limit parameter from string to number', async () => {
      const mockCandles: Candle[] = [];
      const mockVote = {
        sensorId: 'ema-cross-9-21',
        symbol: 'BTCUSDT',
        timeframe: '1h' as const,
        fire: false,
        timestamp: Date.now(),
        data: {},
      };

      mockBybit.getCandles.mockResolvedValue(mockCandles);
      mockSensor.evaluate.mockReturnValue(mockVote);

      await controller.getSignals('ETHUSDT', '1h', '100');

      expect(mockBybit.getCandles).toHaveBeenCalledWith('ETHUSDT', '1h', 100);
    });
  });
});
