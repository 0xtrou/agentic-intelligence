/**
 * @module BybitRestClient
 * @description Bybit V5 REST API client with rate limiting and exponential backoff.
 *
 * Provides methods for:
 * - Fetching historical candles (klines)
 * - Getting real-time ticker data
 * - Querying funding rates
 * - Retrieving open interest
 *
 * All methods handle rate limits automatically via RateLimiter.
 * Responses are mapped to core domain types from @agentic-intelligence/core.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import type {
  Candle,
  Ticker,
  FundingRate,
  OpenInterest,
  Timeframe,
} from '@agentic-intelligence/core';
import { RateLimiter } from './rate-limiter';

export interface BybitRestConfig {
  apiKey?: string;
  apiSecret?: string;
  testnet?: boolean;
  timeout?: number;
}

interface BybitKlineResponse {
  retCode: number;
  retMsg: string;
  result: {
    symbol: string;
    category: string;
    list: string[][]; // [timestamp, open, high, low, close, volume, turnover]
  };
}

interface BybitTickerResponse {
  retCode: number;
  retMsg: string;
  result: {
    list: Array<{
      symbol: string;
      lastPrice: string;
      bid1Price: string;
      ask1Price: string;
      volume24h: string;
    }>;
  };
}

interface BybitFundingRateResponse {
  retCode: number;
  retMsg: string;
  result: {
    list: Array<{
      symbol: string;
      fundingRate: string;
      fundingRateTimestamp: string;
    }>;
  };
}

interface BybitOpenInterestResponse {
  retCode: number;
  retMsg: string;
  result: {
    list: Array<{
      symbol: string;
      openInterest: string;
      timestamp: string;
    }>;
  };
}

/**
 * Convert internal timeframe to Bybit interval format.
 */
function toBybitInterval(timeframe: Timeframe): string {
  const map: Record<Timeframe, string> = {
    '1m': '1',
    '3m': '3',
    '5m': '5',
    '15m': '15',
    '30m': '30',
    '1h': '60',
    '2h': '120',
    '4h': '240',
    '6h': '360',
    '12h': '720',
    '1d': 'D',
    '1w': 'W',
  };
  return map[timeframe];
}

/**
 * Bybit V5 REST API client.
 *
 * Handles authentication, rate limiting, and response mapping.
 * All public endpoints work without API credentials.
 */
export class BybitRestClient {
  private readonly client: AxiosInstance;
  private readonly limiter: RateLimiter;
  private readonly config: Required<BybitRestConfig>;

  constructor(config: BybitRestConfig = {}) {
    this.config = {
      apiKey: config.apiKey ?? '',
      apiSecret: config.apiSecret ?? '',
      testnet: config.testnet ?? false,
      timeout: config.timeout ?? 10000,
    };

    const baseURL = this.config.testnet
      ? 'https://api-testnet.bybit.com'
      : 'https://api.bybit.com';

    this.client = axios.create({
      baseURL,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Bybit V5 rate limit: 120 requests per second for public endpoints
    // Use conservative limit: 50 req/sec to avoid hitting edge
    this.limiter = new RateLimiter({
      maxRequests: 50,
      windowMs: 1000,
      minBackoffMs: 100,
      maxBackoffMs: 5000,
    });
  }

  /**
   * Fetch historical candles (klines) for a symbol.
   *
   * @param symbol - Trading pair (e.g., 'BTCUSDT')
   * @param timeframe - Candle timeframe
   * @param limit - Number of candles to fetch (max 200 for Bybit)
   * @returns Array of candles, ordered oldest to newest
   */
  async getCandles(
    symbol: string,
    timeframe: Timeframe,
    limit: number = 200
  ): Promise<Candle[]> {
    await this.limiter.acquire();

    try {
      const response = await this.client.get<BybitKlineResponse>(
        '/v5/market/kline',
        {
          params: {
            category: 'linear',
            symbol,
            interval: toBybitInterval(timeframe),
            limit,
          },
        }
      );

      this.limiter.onSuccess();

      if (response.data.retCode !== 0) {
        throw new Error(`Bybit API error: ${response.data.retMsg}`);
      }

      // Bybit returns newest first — reverse to oldest first
      const candles = response.data.result.list
        .reverse()
        .map((k): Candle => {
          const [timestamp, open, high, low, close, volume] = k;
          return {
            symbol,
            timeframe,
            openTime: parseInt(timestamp, 10),
            closeTime: parseInt(timestamp, 10) + this.getTimeframeMs(timeframe),
            open: parseFloat(open),
            high: parseFloat(high),
            low: parseFloat(low),
            close: parseFloat(close),
            volume: parseFloat(volume),
          };
        });

      return candles;
    } catch (error) {
      if (this.is429Error(error)) {
        this.limiter.on429();
      }
      throw error;
    }
  }

  /**
   * Get current ticker data for a symbol.
   *
   * @param symbol - Trading pair (e.g., 'BTCUSDT')
   * @returns Real-time ticker snapshot
   */
  async getTicker(symbol: string): Promise<Ticker> {
    await this.limiter.acquire();

    try {
      const response = await this.client.get<BybitTickerResponse>(
        '/v5/market/tickers',
        {
          params: {
            category: 'linear',
            symbol,
          },
        }
      );

      this.limiter.onSuccess();

      if (response.data.retCode !== 0) {
        throw new Error(`Bybit API error: ${response.data.retMsg}`);
      }

      const ticker = response.data.result.list[0];
      if (!ticker) {
        throw new Error(`Ticker not found for symbol: ${symbol}`);
      }

      return {
        symbol,
        lastPrice: parseFloat(ticker.lastPrice),
        bid: parseFloat(ticker.bid1Price),
        ask: parseFloat(ticker.ask1Price),
        volume24h: parseFloat(ticker.volume24h),
        timestamp: Date.now(),
      };
    } catch (error) {
      if (this.is429Error(error)) {
        this.limiter.on429();
      }
      throw error;
    }
  }

  /**
   * Get current funding rate for a perpetual futures symbol.
   *
   * @param symbol - Trading pair (e.g., 'BTCUSDT')
   * @returns Current funding rate and next funding time
   */
  async getFundingRate(symbol: string): Promise<FundingRate> {
    await this.limiter.acquire();

    try {
      const response = await this.client.get<BybitFundingRateResponse>(
        '/v5/market/funding/history',
        {
          params: {
            category: 'linear',
            symbol,
            limit: 1,
          },
        }
      );

      this.limiter.onSuccess();

      if (response.data.retCode !== 0) {
        throw new Error(`Bybit API error: ${response.data.retMsg}`);
      }

      const funding = response.data.result.list[0];
      if (!funding) {
        throw new Error(`Funding rate not found for symbol: ${symbol}`);
      }

      return {
        symbol,
        rate: parseFloat(funding.fundingRate),
        nextFundingTime: parseInt(funding.fundingRateTimestamp, 10),
        timestamp: Date.now(),
      };
    } catch (error) {
      if (this.is429Error(error)) {
        this.limiter.on429();
      }
      throw error;
    }
  }

  /**
   * Get current open interest for a symbol.
   *
   * @param symbol - Trading pair (e.g., 'BTCUSDT')
   * @returns Open interest in USD
   */
  async getOpenInterest(symbol: string): Promise<OpenInterest> {
    await this.limiter.acquire();

    try {
      const response = await this.client.get<BybitOpenInterestResponse>(
        '/v5/market/open-interest',
        {
          params: {
            category: 'linear',
            symbol,
            intervalTime: '1h',
            limit: 1,
          },
        }
      );

      this.limiter.onSuccess();

      if (response.data.retCode !== 0) {
        throw new Error(`Bybit API error: ${response.data.retMsg}`);
      }

      const oi = response.data.result.list[0];
      if (!oi) {
        throw new Error(`Open interest not found for symbol: ${symbol}`);
      }

      return {
        symbol,
        value: parseFloat(oi.openInterest),
        timestamp: parseInt(oi.timestamp, 10),
      };
    } catch (error) {
      if (this.is429Error(error)) {
        this.limiter.on429();
      }
      throw error;
    }
  }

  /**
   * Check if error is a 429 rate limit response.
   */
  private is429Error(error: unknown): boolean {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      return axiosError.response?.status === 429;
    }
    return false;
  }

  /**
   * Convert timeframe to milliseconds.
   */
  private getTimeframeMs(timeframe: Timeframe): number {
    const map: Record<Timeframe, number> = {
      '1m': 60 * 1000,
      '3m': 3 * 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '2h': 2 * 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '12h': 12 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
      '1w': 7 * 24 * 60 * 60 * 1000,
    };
    return map[timeframe];
  }
}
