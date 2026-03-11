/**
 * @module fetchFunding
 * @description Fetch historical funding rates from Bybit V5 API.
 */

import type { FundingRate } from '@agentic-intelligence/core';
import https from 'node:https';

interface BybitFundingResponse {
  retCode: number;
  retMsg: string;
  result: {
    category: string;
    list: Array<{
      symbol: string;
      fundingRate: string;
      fundingRateTimestamp: string;
    }>;
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch funding rate history from Bybit V5.
 * Bybit returns max 200 entries per request.
 *
 * @param symbol - Trading pair (e.g., 'BTCUSDT')
 * @param days - Number of days of history
 * @returns Array of FundingRate objects, ordered oldest to newest
 */
export async function fetchFundingRates(
  symbol: string,
  days: number
): Promise<FundingRate[]> {
  const now = Date.now();
  const startTime = now - days * 24 * 60 * 60 * 1000;
  const allRates: FundingRate[] = [];
  let endTime = now;

  console.log(`Fetching ${days} days of ${symbol} funding rates from Bybit V5...`);

  while (endTime > startTime) {
    const url = `https://api.bybit.com/v5/market/funding/history?category=linear&symbol=${symbol}&limit=200&endTime=${endTime}`;

    const response = await httpsGet<BybitFundingResponse>(url);

    if (response.retCode !== 0) {
      throw new Error(`Bybit API error: ${response.retMsg}`);
    }

    const list = response.result.list;
    if (list.length === 0) break;

    for (let i = list.length - 1; i >= 0; i--) {
      const entry = list[i];
      const timestamp = parseInt(entry.fundingRateTimestamp, 10);
      if (timestamp < startTime) continue;

      allRates.push({
        symbol,
        rate: parseFloat(entry.fundingRate),
        nextFundingTime: timestamp + 8 * 60 * 60 * 1000, // 8h funding interval
        timestamp,
      });
    }

    // Move cursor to oldest in batch
    const oldestTimestamp = parseInt(list[list.length - 1].fundingRateTimestamp, 10);
    endTime = oldestTimestamp - 1;

    await sleep(150);
  }

  // Sort and deduplicate
  allRates.sort((a, b) => a.timestamp - b.timestamp);
  const seen = new Set<number>();
  const deduped = allRates.filter((r) => {
    if (seen.has(r.timestamp)) return false;
    seen.add(r.timestamp);
    return true;
  });

  console.log(`Fetched ${deduped.length} funding rate entries (${days} days)`);
  return deduped;
}
