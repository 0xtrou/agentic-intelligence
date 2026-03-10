/**
 * @module BybitWebSocketClient
 * @description Bybit V5 WebSocket client for real-time market data streams.
 *
 * Features:
 * - Real-time candle (kline) streams for configurable symbol watchlist
 * - Automatic reconnection with exponential backoff
 * - Ping/pong heartbeat to keep connection alive
 * - Event-driven architecture for candle updates
 *
 * Usage:
 * ```typescript
 * const ws = new BybitWebSocketClient({ testnet: false });
 * ws.on('candle', (candle) => console.log(candle));
 * ws.subscribe(['BTCUSDT'], '1m');
 * ```
 */

import WebSocket from 'ws';
import type { Candle, Timeframe } from '@agentic-intelligence/core';

export interface BybitWebSocketConfig {
  testnet?: boolean;
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  pingIntervalMs?: number;
}

type CandleHandler = (candle: Candle) => void;
type ErrorHandler = (error: Error) => void;
type ConnectedHandler = () => void;

interface BybitKlineMessage {
  topic: string;
  type: string;
  ts: number;
  data: Array<{
    start: number;
    end: number;
    interval: string;
    open: string;
    close: string;
    high: string;
    low: string;
    volume: string;
    turnover: string;
    confirm: boolean;
  }>;
}

/**
 * Convert internal timeframe to Bybit WebSocket interval format.
 */
function toBybitWsInterval(timeframe: Timeframe): string {
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
 * Bybit V5 WebSocket client with automatic reconnection.
 *
 * Maintains persistent connection to Bybit's public WebSocket streams.
 * Handles connection lifecycle, subscriptions, and candle updates.
 */
export class BybitWebSocketClient {
  private ws: WebSocket | null = null;
  private readonly config: Required<BybitWebSocketConfig>;
  private readonly url: string;
  private reconnectDelay: number;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private subscriptions: Map<string, Timeframe> = new Map(); // symbol -> timeframe
  private candleHandlers: CandleHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];
  private connectedHandlers: ConnectedHandler[] = [];
  private isManualClose = false;

  constructor(config: BybitWebSocketConfig = {}) {
    this.config = {
      testnet: config.testnet ?? false,
      reconnectDelayMs: config.reconnectDelayMs ?? 1000,
      maxReconnectDelayMs: config.maxReconnectDelayMs ?? 30000,
      pingIntervalMs: config.pingIntervalMs ?? 20000,
    };

    this.url = this.config.testnet
      ? 'wss://stream-testnet.bybit.com/v5/public/linear'
      : 'wss://stream.bybit.com/v5/public/linear';

    this.reconnectDelay = this.config.reconnectDelayMs;
  }

  /**
   * Subscribe to real-time candle updates for symbols.
   *
   * @param symbols - Array of trading pairs (e.g., ['BTCUSDT', 'ETHUSDT'])
   * @param timeframe - Candle timeframe
   */
  subscribe(symbols: string[], timeframe: Timeframe): void {
    for (const symbol of symbols) {
      this.subscriptions.set(symbol, timeframe);
    }

    // If already connected, send subscription immediately
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendSubscriptions();
    } else if (!this.ws) {
      // Not connected yet — establish connection
      this.connect();
    }
  }

  /**
   * Unsubscribe from candle updates for symbols.
   *
   * @param symbols - Array of trading pairs to unsubscribe
   */
  unsubscribe(symbols: string[]): void {
    const topics: string[] = [];

    for (const symbol of symbols) {
      const timeframe = this.subscriptions.get(symbol);
      if (timeframe) {
        const interval = toBybitWsInterval(timeframe);
        topics.push(`kline.${interval}.${symbol}`);
        this.subscriptions.delete(symbol);
      }
    }

    if (this.ws?.readyState === WebSocket.OPEN && topics.length > 0) {
      this.ws.send(
        JSON.stringify({
          op: 'unsubscribe',
          args: topics,
        })
      );
    }
  }

  /**
   * Register a candle event handler.
   *
   * @param event - Event name ('candle', 'error', 'connected')
   * @param handler - Event handler function
   */
  on(event: 'candle', handler: CandleHandler): void;
  on(event: 'error', handler: ErrorHandler): void;
  on(event: 'connected', handler: ConnectedHandler): void;
  on(
    event: 'candle' | 'error' | 'connected',
    handler: CandleHandler | ErrorHandler | ConnectedHandler
  ): void {
    if (event === 'candle') {
      this.candleHandlers.push(handler as CandleHandler);
    } else if (event === 'error') {
      this.errorHandlers.push(handler as ErrorHandler);
    } else if (event === 'connected') {
      this.connectedHandlers.push(handler as ConnectedHandler);
    }
  }

  /**
   * Close the WebSocket connection.
   * Does not auto-reconnect after manual close.
   */
  close(): void {
    this.isManualClose = true;
    this.clearTimers();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Establish WebSocket connection.
   */
  private connect(): void {
    if (this.ws) {
      // Already connected or connecting
      return;
    }

    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      this.reconnectDelay = this.config.reconnectDelayMs; // Reset backoff
      this.sendSubscriptions();
      this.startPing();
      this.emitConnected();
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      this.handleMessage(data.toString());
    });

    this.ws.on('error', (error: Error) => {
      this.emitError(error);
    });

    this.ws.on('close', () => {
      this.ws = null;
      this.clearTimers();

      // Only reconnect if not manually closed
      if (!this.isManualClose) {
        this.scheduleReconnect();
      }
    });
  }

  /**
   * Send subscription messages for all tracked symbols.
   */
  private sendSubscriptions(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const topics: string[] = [];
    for (const [symbol, timeframe] of this.subscriptions) {
      const interval = toBybitWsInterval(timeframe);
      topics.push(`kline.${interval}.${symbol}`);
    }

    if (topics.length > 0) {
      this.ws.send(
        JSON.stringify({
          op: 'subscribe',
          args: topics,
        })
      );
    }
  }

  /**
   * Handle incoming WebSocket messages.
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as Partial<BybitKlineMessage>;

      // Ping response
      if ('success' in message && message.success) {
        return; // Subscription ack
      }

      // Kline update
      if (message.topic?.startsWith('kline.') && message.data) {
        for (const k of message.data) {
          // Extract symbol from topic: "kline.1.BTCUSDT" -> "BTCUSDT"
          const symbol = message.topic.split('.')[2];
          const timeframe = this.subscriptions.get(symbol);

          if (!timeframe) continue;

          const candle: Candle = {
            symbol,
            timeframe,
            openTime: k.start,
            closeTime: k.end,
            open: parseFloat(k.open),
            high: parseFloat(k.high),
            low: parseFloat(k.low),
            close: parseFloat(k.close),
            volume: parseFloat(k.volume),
          };

          this.emitCandle(candle);
        }
      }
    } catch (error) {
      this.emitError(
        error instanceof Error ? error : new Error('Parse error')
      );
    }
  }

  /**
   * Start ping/pong heartbeat to keep connection alive.
   */
  private startPing(): void {
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ op: 'ping' }));
      }
    }, this.config.pingIntervalMs);
  }

  /**
   * Schedule reconnection with exponential backoff.
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();

      // Exponential backoff, capped at maxReconnectDelayMs
      this.reconnectDelay = Math.min(
        this.reconnectDelay * 2,
        this.config.maxReconnectDelayMs
      );
    }, this.reconnectDelay);
  }

  /**
   * Clear all timers.
   */
  private clearTimers(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Emit candle event to all registered handlers.
   */
  private emitCandle(candle: Candle): void {
    for (const handler of this.candleHandlers) {
      handler(candle);
    }
  }

  /**
   * Emit error event to all registered handlers.
   */
  private emitError(error: Error): void {
    for (const handler of this.errorHandlers) {
      handler(error);
    }
  }

  /**
   * Emit connected event to all registered handlers.
   */
  private emitConnected(): void {
    for (const handler of this.connectedHandlers) {
      handler();
    }
  }
}
