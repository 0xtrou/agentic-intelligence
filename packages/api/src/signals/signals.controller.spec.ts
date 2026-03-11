/**
 * @file signals.controller.spec.ts
 * @description Tests for signals endpoint.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignalsController } from './signals.controller';
import { BybitRestClient } from '@agentic-intelligence/exchange';
import { EmaCrossSensor, FundingRateSensor } from '@agentic-intelligence/sensors';
import { SensorStatus, SignalDirection, type Candle, type FundingRate } from '@agentic-intelligence/core';

// Mock dependencies
vi.mock('@agentic-intelligence/exchange');
vi.mock('@agentic-intelligence/sensors');

describe('SignalsController', () => {
  let controller: SignalsController;
  let mockBybit: any;
  let mockEmaSensor: any;
  let mockFundingSensor: any;

  const mockFundingRate: FundingRate = {
    symbol: 'BTCUSDT',
    rate: 0.0001,
    nextFundingTime: Date.now() + 3600000,
    timestamp: Date.now(),
  };

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Mock Bybit client
    mockBybit = {
      getCandles: vi.fn(),
      getFundingRate: vi.fn().mockResolvedValue(mockFundingRate),
    };
    (BybitRestClient as any).mockImplementation(() => mockBybit);

    // Mock EMA sensor
    mockEmaSensor = {
      evaluate: vi.fn(),
    };
    (EmaCrossSensor as any).mockImplementation(() => mockEmaSensor);

    // Mock funding sensor
    mockFundingSensor = {
      evaluate: vi.fn().mockReturnValue({
        sensorId: 'funding-extreme',
        symbol: 'BTCUSDT',
        timeframe: '1h' as const,
        fire: false,
        timestamp: Date.now(),
        data: {},
      }),
    };
    (FundingRateSensor as any).mockImplementation(() => mockFundingSensor);

    controller = new SignalsController();
  });

  describe('getSignals', () => {
    it('should return empty signals when no sensors fire', async () => {
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

      const mockEmaVote = {
        sensorId: 'ema-cross-9-21',
        symbol: 'BTCUSDT',
        timeframe: '4h' as const,
        fire: false,
        timestamp: Date.now(),
        data: { ema_fast: 50100, ema_slow: 50000 },
      };

      mockBybit.getCandles.mockResolvedValue(mockCandles);
      mockEmaSensor.evaluate.mockReturnValue(mockEmaVote);

      const result = await controller.getSignals('BTCUSDT', '4h', '50');

      expect(result.signals).toEqual([]);
      expect(result.sensorVotes).toHaveLength(2);
      expect(mockBybit.getCandles).toHaveBeenCalledWith('BTCUSDT', '4h', 50);
      expect(mockBybit.getFundingRate).toHaveBeenCalledWith('BTCUSDT');
    });

    it('should generate LONG signal when EMA sensor fires bullish', async () => {
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

      const mockEmaVote = {
        sensorId: 'ema-cross-9-21',
        symbol: 'BTCUSDT',
        timeframe: '4h' as const,
        fire: true,
        direction: SignalDirection.LONG,
        timestamp: Date.now(),
        data: { ema_fast: 50300, ema_slow: 50000 },
      };

      mockBybit.getCandles.mockResolvedValue(mockCandles);
      mockEmaSensor.evaluate.mockReturnValue(mockEmaVote);

      const result = await controller.getSignals('BTCUSDT', '4h', '50');

      expect(result.signals).toHaveLength(1);
      expect(result.signals[0].direction).toBe(SignalDirection.LONG);
      expect(result.signals[0].symbol).toBe('BTCUSDT');
      expect(result.signals[0].entry).toBe(50200);
      expect(result.signals[0].tp).toBeGreaterThan(50200);
      expect(result.signals[0].sl).toBeLessThan(50200);
    });

    it('should generate SHORT signal when funding sensor fires', async () => {
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

      const mockEmaVote = {
        sensorId: 'ema-cross-9-21',
        symbol: 'BTCUSDT',
        timeframe: '4h' as const,
        fire: false,
        timestamp: Date.now(),
        data: {},
      };

      const mockFundingVote = {
        sensorId: 'funding-extreme',
        symbol: 'BTCUSDT',
        timeframe: '1h' as const,
        fire: true,
        direction: SignalDirection.SHORT,
        timestamp: Date.now(),
        data: { funding_rate: 0.0008, avg_funding_rate: 0.0008 },
      };

      mockBybit.getCandles.mockResolvedValue(mockCandles);
      mockEmaSensor.evaluate.mockReturnValue(mockEmaVote);
      mockFundingSensor.evaluate.mockReturnValue(mockFundingVote);

      const result = await controller.getSignals('BTCUSDT', '4h', '50');

      expect(result.signals).toHaveLength(1);
      expect(result.signals[0].direction).toBe(SignalDirection.SHORT);
      expect(result.signals[0].symbol).toBe('BTCUSDT');
      expect(result.signals[0].entry).toBe(50200);
      expect(result.signals[0].tp).toBeLessThan(50200);
      expect(result.signals[0].sl).toBeGreaterThan(50200);
    });

    it('should combine votes from both sensors when both fire', async () => {
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

      const mockEmaVote = {
        sensorId: 'ema-cross-9-21',
        symbol: 'BTCUSDT',
        timeframe: '4h' as const,
        fire: true,
        direction: SignalDirection.LONG,
        timestamp: Date.now(),
        data: {},
      };

      const mockFundingVote = {
        sensorId: 'funding-extreme',
        symbol: 'BTCUSDT',
        timeframe: '1h' as const,
        fire: true,
        direction: SignalDirection.LONG,
        timestamp: Date.now(),
        data: {},
      };

      mockBybit.getCandles.mockResolvedValue(mockCandles);
      mockEmaSensor.evaluate.mockReturnValue(mockEmaVote);
      mockFundingSensor.evaluate.mockReturnValue(mockFundingVote);

      const result = await controller.getSignals('BTCUSDT', '4h', '50');

      expect(result.signals).toHaveLength(1);
      expect(result.signals[0].sensorVotes).toHaveLength(2);
    });

    it('should use default parameters when not provided', async () => {
      const mockCandles: Candle[] = [];
      const mockEmaVote = {
        sensorId: 'ema-cross-9-21',
        symbol: 'BTCUSDT',
        timeframe: '4h' as const,
        fire: false,
        timestamp: Date.now(),
        data: {},
      };

      mockBybit.getCandles.mockResolvedValue(mockCandles);
      mockEmaSensor.evaluate.mockReturnValue(mockEmaVote);

      await controller.getSignals();

      expect(mockBybit.getCandles).toHaveBeenCalledWith('BTCUSDT', '4h', 50);
      expect(mockBybit.getFundingRate).toHaveBeenCalledWith('BTCUSDT');
    });
  });
});
