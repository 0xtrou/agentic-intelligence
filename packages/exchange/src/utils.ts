/**
 * @module utils
 * @description Shared utility functions for Bybit exchange adapter.
 */

import type { Timeframe } from '@agentic-intelligence/core';

/**
 * Convert internal timeframe to Bybit interval format.
 * 
 * Used by both REST and WebSocket clients.
 * 
 * @param timeframe - Internal timeframe representation
 * @returns Bybit interval string (e.g., '1', '60', 'D')
 */
export function toBybitInterval(timeframe: Timeframe): string {
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
