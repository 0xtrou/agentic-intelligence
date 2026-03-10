# @agentic-intelligence/exchange

Bybit V5 exchange adapter for autonomous trading backend.

## Features

- **REST API Client**: Fetch candles, ticker, funding rate, and open interest from Bybit V5 API
- **WebSocket Client**: Real-time candle streams with configurable symbol watchlist
- **Rate Limiting**: Token bucket rate limiter with exponential backoff
- **Auto-Reconnect**: WebSocket automatically reconnects on disconnect
- **Type-Safe**: Full TypeScript strict mode, zero `any` types
- **Well-Documented**: Comprehensive JSDoc for all modules and functions

## Installation

```bash
pnpm install @agentic-intelligence/exchange
```

## Usage

### REST API Client

```typescript
import { BybitRestClient } from '@agentic-intelligence/exchange';

const client = new BybitRestClient({
  testnet: false,  // Use production API
  timeout: 10000,  // Request timeout in ms
});

// Fetch historical candles
const candles = await client.getCandles('BTCUSDT', '1h', 100);

// Get current ticker
const ticker = await client.getTicker('BTCUSDT');

// Get funding rate
const fundingRate = await client.getFundingRate('BTCUSDT');

// Get open interest
const openInterest = await client.getOpenInterest('BTCUSDT');
```

### WebSocket Client

```typescript
import { BybitWebSocketClient } from '@agentic-intelligence/exchange';

const ws = new BybitWebSocketClient({
  testnet: false,
  reconnectDelayMs: 1000,      // Initial reconnect delay
  maxReconnectDelayMs: 30000,  // Max reconnect delay
  pingIntervalMs: 20000,       // Ping interval to keep connection alive
});

// Register event handlers
ws.on('candle', (candle) => {
  console.log('New candle:', candle);
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

ws.on('connected', () => {
  console.log('WebSocket connected');
});

// Subscribe to real-time candle updates
ws.subscribe(['BTCUSDT', 'ETHUSDT'], '1m');

// Unsubscribe when done
ws.unsubscribe(['BTCUSDT']);

// Close connection (will not auto-reconnect)
ws.close();
```

### Rate Limiter

```typescript
import { RateLimiter } from '@agentic-intelligence/exchange';

const limiter = new RateLimiter({
  maxRequests: 50,      // Max 50 requests
  windowMs: 1000,       // Per 1 second
  minBackoffMs: 100,    // Initial backoff on rate limit
  maxBackoffMs: 5000,   // Max backoff
});

// Acquire permission before making request
await limiter.acquire();
makeApiRequest();

// Notify limiter on 429 response
if (response.status === 429) {
  limiter.on429();
}

// Notify limiter on success
if (response.ok) {
  limiter.onSuccess();
}
```

## API Reference

### BybitRestClient

**Constructor**: `new BybitRestClient(config?: BybitRestConfig)`

**Methods**:
- `getCandles(symbol: string, timeframe: Timeframe, limit?: number): Promise<Candle[]>`
- `getTicker(symbol: string): Promise<Ticker>`
- `getFundingRate(symbol: string): Promise<FundingRate>`
- `getOpenInterest(symbol: string): Promise<OpenInterest>`

### BybitWebSocketClient

**Constructor**: `new BybitWebSocketClient(config?: BybitWebSocketConfig)`

**Methods**:
- `subscribe(symbols: string[], timeframe: Timeframe): void`
- `unsubscribe(symbols: string[]): void`
- `on(event: 'candle', handler: (candle: Candle) => void): void`
- `on(event: 'error', handler: (error: Error) => void): void`
- `on(event: 'connected', handler: () => void): void`
- `close(): void`

### RateLimiter

**Constructor**: `new RateLimiter(config: RateLimiterConfig)`

**Methods**:
- `acquire(): Promise<void>` - Acquire permission to make request
- `on429(): void` - Notify limiter of rate limit response
- `onSuccess(): void` - Notify limiter of successful request
- `getBackoffMs(): number` - Get current backoff delay

## Type Definitions

All types are imported from `@agentic-intelligence/core`:

- `Candle` - OHLCV candle data
- `Ticker` - Real-time ticker snapshot
- `FundingRate` - Perpetual futures funding rate
- `OpenInterest` - Open interest data
- `Timeframe` - Supported timeframes: `'1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '6h' | '12h' | '1d' | '1w'`

## Testing

```bash
# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Build package
pnpm build

# Clean build output
pnpm clean
```

## Rate Limits

Bybit V5 public endpoints allow 120 requests per second. This client uses a conservative limit of 50 req/sec with automatic backoff on 429 responses.

## Error Handling

All methods throw errors on:
- Network failures
- API errors (non-zero `retCode`)
- Missing data (e.g., symbol not found)

Handle errors with try-catch:

```typescript
try {
  const candles = await client.getCandles('BTCUSDT', '1h');
} catch (error) {
  console.error('Failed to fetch candles:', error);
}
```

## License

Part of the Agentic Intelligence trading system.
