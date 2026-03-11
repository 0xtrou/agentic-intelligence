/**
 * @module @agentic-intelligence/exchange
 * @description Bybit V5 exchange adapter for autonomous trading backend.
 *
 * Provides:
 * - REST API client for candles, ticker, funding rate, open interest
 * - WebSocket client for real-time candle streams
 * - Rate limiting with exponential backoff
 * - Automatic reconnection on disconnect
 *
 * Part of the M2 milestone: exchange integration.
 */

export { BybitRestClient, type BybitRestConfig } from './bybit-rest';
export { BybitWebSocketClient, type BybitWebSocketConfig } from './bybit-ws';
export { RateLimiter, type RateLimiterConfig } from './rate-limiter';
export { toBybitInterval } from './utils';
