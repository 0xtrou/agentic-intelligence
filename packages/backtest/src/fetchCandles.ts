/**
 * @module fetchCandles
 * @description Fetch historical candles from Bybit V5 API.
 */

import type { Candle, Timeframe } from '@agentic-intelligence/core';
import https from 'node:https';

interface BybitKlineResponse {
  retCode: number;
  retMsg: string;
  result: {
    symbol: string;
    category: string;
    list: string[][];
  };
}

/**
 * Make an HTTPS GET request and return parsed JSON.
 */
function httpsGet<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString();
          resolve(JSON.parse(body) as T);
        } catch (err) {
          reject(err);
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Fetch BTCUSDT klines from Bybit V5.
 * Bybit returns max 200 candles per request, newest first.
 * We paginate backwards to get the full range.
 *
 * @param symbol - Trading pair (e.g., 'BTCUSDT')
 * @param timeframe - Candle interval
 * @param days - Number of days of history to fetch
 * @returns Array of Candle objects, ordered oldest to newest
 */
export async function fetchCandles(
  symbol: string,
  timeframe: Timeframe,
  days: number
): Promise<Candle[]> {
  const intervalMinutes = timeframeToMinutes(timeframe);
  const intervalMs = intervalMinutes * 60 * 1000;
  const now = Date.now();
  const startTime = now - days * 24 * 60 * 60 * 1000;

  const allCandles: Candle[] = [];
  let endTime = now;

  console.log(`Fetching ${days} days of ${symbol} ${timeframe} candles from Bybit V5...`);

  while (endTime > startTime) {
    const url = `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=${bybitInterval(timeframe)}&limit=200&end=${endTime}`;
    
    const response = await httpsGet<BybitKlineResponse>(url);

    if (response.retCode !== 0) {
      throw new Error(`Bybit API error: ${response.retMsg}`);
    }

    const list = response.result.list;
    if (list.length === 0) break;

    // Bybit returns newest first, so reverse to get oldest first
    for (let i = list.length - 1; i >= 0; i--) {
      const row = list[i];
      const openTime = parseInt(row[0], 10);
      if (openTime < startTime) continue;

      allCandles.push({
        symbol,
        timeframe,
        openTime,
        closeTime: openTime + intervalMs,
        open: parseFloat(row[1]),
        high: parseFloat(row[2]),
        low: parseFloat(row[3]),
        close: parseFloat(row[4]),
        volume: parseFloat(row[5]),
      });
    }

    // Move end cursor to the oldest candle in this batch
    const oldestInBatch = parseInt(list[list.length - 1][0], 10);
    endTime = oldestInBatch - 1;

    // Rate limit: Bybit allows 10 req/s, be conservative
    await sleep(150);
  }

  // Sort by openTime and deduplicate
  allCandles.sort((a, b) => a.openTime - b.openTime);
  const seen = new Set<number>();
  const deduped = allCandles.filter((c) => {
    if (seen.has(c.openTime)) return false;
    seen.add(c.openTime);
    return true;
  });

  console.log(`Fetched ${deduped.length} candles (${days} days)`);
  return deduped;
}

function timeframeToMinutes(tf: Timeframe): number {
  const map: Record<Timeframe, number> = {
    '1m': 1, '3m': 3, '5m': 5, '15m': 15, '30m': 30,
    '1h': 60, '2h': 120, '4h': 240, '6h': 360, '12h': 720,
    '1d': 1440, '1w': 10080,
  };
  return map[tf];
}

function bybitInterval(tf: Timeframe): string {
  const map: Record<Timeframe, string> = {
    '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30',
    '1h': '60', '2h': '120', '4h': '240', '6h': '360', '12h': '720',
    '1d': 'D', '1w': 'W',
  };
  return map[tf];
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
