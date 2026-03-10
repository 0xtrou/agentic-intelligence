/**
 * @module BybitRestClient Tests
 * @description Unit tests for Bybit V5 REST API client with mocked responses.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BybitRestClient } from './bybit-rest';
import axios from 'axios';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

describe('BybitRestClient', () => {
  let client: BybitRestClient;

  beforeEach(() => {
    // Create axios instance mock
    const mockInstance = {
      get: vi.fn(),
      defaults: { headers: {} },
    };

    mockedAxios.create.mockReturnValue(mockInstance as any);
    client = new BybitRestClient({ testnet: false });
  });

  describe('getCandles', () => {
    it('should fetch and parse candle data correctly', async () => {
      const mockResponse = {
        data: {
          retCode: 0,
          retMsg: 'OK',
          result: {
            symbol: 'BTCUSDT',
            category: 'linear',
            list: [
              ['1710086400000', '65000', '65100', '64900', '65050', '1234.5', '80123456'],
              ['1710086340000', '64950', '65010', '64920', '65000', '987.3', '64123456'],
            ],
          },
        },
      };

      const mockAxiosInstance = mockedAxios.create() as any;
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const candles = await client.getCandles('BTCUSDT', '1m', 2);

      expect(candles).toHaveLength(2);
      
      // Should be ordered oldest to newest (reversed from Bybit response)
      expect(candles[0]).toMatchObject({
        symbol: 'BTCUSDT',
        timeframe: '1m',
        open: 64950,
        high: 65010,
        low: 64920,
        close: 65000,
        volume: 987.3,
      });

      expect(candles[1]).toMatchObject({
        symbol: 'BTCUSDT',
        timeframe: '1m',
        open: 65000,
        high: 65100,
        low: 64900,
        close: 65050,
        volume: 1234.5,
      });
    });

    it('should throw error on API error response', async () => {
      const mockResponse = {
        data: {
          retCode: 10001,
          retMsg: 'Invalid symbol',
          result: null,
        },
      };

      const mockAxiosInstance = mockedAxios.create() as any;
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      await expect(client.getCandles('INVALID', '1m')).rejects.toThrow(
        'Bybit API error: Invalid symbol'
      );
    });
  });

  describe('getTicker', () => {
    it('should fetch and parse ticker data correctly', async () => {
      const mockResponse = {
        data: {
          retCode: 0,
          retMsg: 'OK',
          result: {
            list: [
              {
                symbol: 'BTCUSDT',
                lastPrice: '65123.50',
                bid1Price: '65120.00',
                ask1Price: '65125.00',
                volume24h: '123456.789',
              },
            ],
          },
        },
      };

      const mockAxiosInstance = mockedAxios.create() as any;
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const ticker = await client.getTicker('BTCUSDT');

      expect(ticker).toMatchObject({
        symbol: 'BTCUSDT',
        lastPrice: 65123.5,
        bid: 65120.0,
        ask: 65125.0,
        volume24h: 123456.789,
      });
      expect(ticker.timestamp).toBeGreaterThan(0);
    });

    it('should throw error when ticker not found', async () => {
      const mockResponse = {
        data: {
          retCode: 0,
          retMsg: 'OK',
          result: {
            list: [],
          },
        },
      };

      const mockAxiosInstance = mockedAxios.create() as any;
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      await expect(client.getTicker('BTCUSDT')).rejects.toThrow(
        'Ticker not found for symbol: BTCUSDT'
      );
    });
  });

  describe('getFundingRate', () => {
    it('should fetch and parse funding rate correctly', async () => {
      const mockResponse = {
        data: {
          retCode: 0,
          retMsg: 'OK',
          result: {
            list: [
              {
                symbol: 'BTCUSDT',
                fundingRate: '0.0001',
                fundingRateTimestamp: '1710086400000',
              },
            ],
          },
        },
      };

      const mockAxiosInstance = mockedAxios.create() as any;
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const fundingRate = await client.getFundingRate('BTCUSDT');

      expect(fundingRate).toMatchObject({
        symbol: 'BTCUSDT',
        rate: 0.0001,
        nextFundingTime: 1710086400000,
      });
      expect(fundingRate.timestamp).toBeGreaterThan(0);
    });
  });

  describe('getOpenInterest', () => {
    it('should fetch and parse open interest correctly', async () => {
      const mockResponse = {
        data: {
          retCode: 0,
          retMsg: 'OK',
          result: {
            list: [
              {
                symbol: 'BTCUSDT',
                openInterest: '123456789.50',
                timestamp: '1710086400000',
              },
            ],
          },
        },
      };

      const mockAxiosInstance = mockedAxios.create() as any;
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const openInterest = await client.getOpenInterest('BTCUSDT');

      expect(openInterest).toMatchObject({
        symbol: 'BTCUSDT',
        value: 123456789.5,
        timestamp: 1710086400000,
      });
    });
  });

  describe('rate limiting', () => {
    it('should handle 429 errors with backoff', async () => {
      const mockAxiosInstance = mockedAxios.create() as any;
      
      // First call returns 429
      mockAxiosInstance.get.mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 429 },
      });

      // Second call succeeds
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          retCode: 0,
          retMsg: 'OK',
          result: {
            list: [
              {
                symbol: 'BTCUSDT',
                lastPrice: '65000',
                bid1Price: '64990',
                ask1Price: '65010',
                volume24h: '100000',
              },
            ],
          },
        },
      });

      // First call should throw
      await expect(client.getTicker('BTCUSDT')).rejects.toThrow();

      // Second call should succeed (backoff increased internally)
      const ticker = await client.getTicker('BTCUSDT');
      expect(ticker.lastPrice).toBe(65000);
    });
  });
});
