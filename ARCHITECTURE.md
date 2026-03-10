# ARCHITECTURE.md — System Specification

> This is the contract. Animus builds against these specs. Sisyphus validates against these tests.

## Package Dependency Graph

```
@agentic/core          ← zero deps, everything depends on this
@agentic/exchange      ← depends on core
@agentic/sensors       ← depends on core
@agentic/brain         ← depends on core, sensors
@agentic/backtest      ← depends on core, sensors, brain, exchange
@agentic/api           ← depends on everything
```

No circular dependencies. Ever.

## @agentic/core — Type Contracts

### Candle
```typescript
interface Candle {
  timestamp: number;    // Unix ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  symbol: string;
  interval: Timeframe;
}
```

### Signal (the product of the system)
```typescript
interface Signal {
  id: string;                   // uuid
  timestamp: number;
  symbol: string;
  direction: Direction;         // LONG | SHORT
  entry: number;
  takeProfit: number;
  stopLoss: number;
  timeframe: Timeframe;
  confidence: number;           // 0-1, Bayesian posterior
  votes: SensorVote[];          // which sensors contributed
  reasoning: string;            // human-readable thesis
  backtestSummary?: BacktestSummary;
}
```

### SensorVote
```typescript
interface SensorVote {
  sensorId: string;
  vote: 1 | 0;                 // fire or not
  direction?: Direction;        // if the sensor has directional opinion
  metadata?: Record<string, unknown>;  // sensor-specific data (e.g., EMA values)
  timestamp: number;
}
```

### ISensor Interface
```typescript
interface ISensor {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly timeframes: Timeframe[];     // which timeframes this sensor operates on
  readonly markets?: string[];          // optional market filter, undefined = all

  evaluate(candles: Candle[], context?: SensorContext): SensorVote;
}

interface SensorContext {
  symbol: string;
  currentFundingRate?: number;
  openInterest?: number;
  longShortRatio?: number;
}
```

### SensorRecord (Bayesian tracking)
```typescript
interface SensorRecord {
  sensorId: string;
  status: SensorStatus;         // PROBATION | ACTIVE | TRUSTED | KILLED
  totalTrades: number;
  wins: number;
  losses: number;
  alpha: number;                // Beta distribution alpha (wins + prior)
  beta: number;                 // Beta distribution beta (losses + prior)
  expectancy: number;           // running EV
  lastSignalAt: number;        // Unix ms
  createdAt: number;
  updatedAt: number;
}
```

### IBrain Interface
```typescript
interface IBrain {
  aggregate(votes: SensorVote[], context: BrainContext): Signal | null;
  evaluateSensor(sensorId: string, outcome: TradeOutcome): SensorRecord;
  getSensorStatus(sensorId: string): SensorRecord;
  getActiveSensors(): SensorRecord[];
}

interface BrainContext {
  symbol: string;
  currentPrice: number;
  candles: Candle[];
  regime?: 'trending' | 'ranging';
}
```

### IExchange Interface
```typescript
interface IExchange {
  // Market data
  getCandles(symbol: string, interval: Timeframe, limit?: number): Promise<Candle[]>;
  getTicker(symbol: string): Promise<Ticker>;
  getSymbols(marketType?: MarketType): Promise<SymbolInfo[]>;

  // Streaming
  subscribeCandles(symbol: string, interval: Timeframe, callback: (candle: Candle) => void): () => void;
  subscribeTicker(symbol: string, callback: (ticker: Ticker) => void): () => void;

  // Account (phase 2)
  getBalance?(): Promise<Balance>;
  getPositions?(): Promise<Position[]>;

  // Execution (phase 2)
  placeOrder?(order: OrderRequest): Promise<OrderResult>;
  cancelOrder?(orderId: string): Promise<void>;
}
```

### Enums
```typescript
enum Direction { LONG = 'LONG', SHORT = 'SHORT' }
enum Timeframe { M1 = '1', M5 = '5', M15 = '15', H1 = '60', H4 = '240', D1 = 'D' }
enum SensorStatus { PROBATION = 'PROBATION', ACTIVE = 'ACTIVE', TRUSTED = 'TRUSTED', KILLED = 'KILLED' }
enum MarketType { LINEAR = 'linear', INVERSE = 'inverse', SPOT = 'spot' }
```

## @agentic/core — Bayesian Math Spec

### updatePosterior(record, won)
```
alpha_new = alpha + (won ? 1 : 0)
beta_new  = beta  + (won ? 0 : 1)
```
Prior: alpha=3, beta=3 (skeptical, assumes coin flip)

### credibleInterval(alpha, beta, level=0.80)
Returns [lower, upper] bounds of the Beta distribution at given credibility level.
Sensor promotes to ACTIVE when lower bound > 0.5.

### expectancy(wins, losses, avgWin, avgLoss)
```
EV = (wins / total) * avgWin - (losses / total) * avgLoss
```

### quarterlyDecay(record)
```
alpha_new = prior_alpha + (alpha - prior_alpha) * 0.5
beta_new  = prior_beta  + (beta  - prior_beta)  * 0.5
```
Compresses posteriors 50% toward prior every 90 days. Markets change.

## @agentic/exchange — Bybit V5 Spec

- Base URL: `https://api.bybit.com` (mainnet), `https://api-testnet.bybit.com` (testnet)
- WebSocket: `wss://stream.bybit.com/v5/public/linear`
- Authentication: HMAC-SHA256 for private endpoints
- Rate limits: respect `X-Bapi-Limit-Status` headers, exponential backoff on 429

### Key Endpoints
| Endpoint | Method | Use |
|----------|--------|-----|
| `/v5/market/kline` | GET | Historical candles |
| `/v5/market/tickers` | GET | Current price/volume |
| `/v5/market/instruments-info` | GET | Available symbols |
| `/v5/market/funding/history` | GET | Funding rate history |
| `/v5/market/open-interest` | GET | Open interest |
| `/v5/order/create` | POST | Place order |

## Test Case Contracts

These are the tests that MUST pass. Animus writes the implementation; these tests define correctness.

### @agentic/core tests

```
describe('Candle', () => {
  it('should enforce all OHLCV fields are positive numbers')
  it('should enforce high >= open, close, low')
  it('should enforce low <= open, close, high')
})

describe('Signal', () => {
  it('should require direction, entry, TP, SL, timeframe')
  it('should enforce TP > entry for LONG, TP < entry for SHORT')
  it('should enforce SL < entry for LONG, SL > entry for SHORT')
  it('should enforce confidence between 0 and 1')
  it('should carry at least one sensor vote')
})

describe('updatePosterior', () => {
  it('should start with prior Beta(3,3)')
  it('should increment alpha on win')
  it('should increment beta on loss')
  it('should maintain alpha + beta = prior + totalTrades')
})

describe('credibleInterval', () => {
  it('should return [lower, upper] where lower < upper')
  it('should return wider interval for fewer observations')
  it('should return interval containing the mean')
  it('Beta(3,3) lower 80% CI should be < 0.5 (can not promote coin flip)')
  it('Beta(13,3) lower 80% CI should be > 0.5 (strong performer promotes)')
})

describe('expectancy', () => {
  it('should return positive EV for 60% win rate with 1:1 RR')
  it('should return negative EV for 40% win rate with 1:1 RR')
  it('should return positive EV for 40% win rate with 3:1 RR')
  it('should return 0 for empty trade set')
})

describe('quarterlyDecay', () => {
  it('should compress alpha toward prior by 50%')
  it('should compress beta toward prior by 50%')
  it('should not change a record already at prior')
})
```

### @agentic/sensors tests

```
describe('ISensor implementation', () => {
  it('should return a SensorVote with vote 0 or 1')
  it('should include sensorId matching the sensor')
  it('should handle empty candle array without throwing')
  it('should handle single candle without throwing')
  it('should be deterministic: same input = same output')
})

describe('EmaCrossSensor', () => {
  it('should fire 1 (LONG) when fast EMA crosses above slow EMA')
  it('should fire 1 (SHORT) when fast EMA crosses below slow EMA')
  it('should fire 0 when no cross occurs')
  it('should require minimum candles = slow EMA period')
  it('should use configurable fast/slow periods')
})
```

### @agentic/exchange tests

```
describe('BybitExchange', () => {
  it('should implement IExchange interface')
  it('should fetch candles and return Candle[] type')
  it('should handle rate limit errors with retry')
  it('should validate symbol exists before fetching')
  it('should normalize Bybit kline response to Candle type')
})
```

### @agentic/brain tests

```
describe('Brain', () => {
  it('should return null when no sensors fire')
  it('should return Signal when confidence threshold met')
  it('should not return Signal when only PROBATION sensors fire')
  it('should weight TRUSTED sensors higher than ACTIVE')
  it('should promote sensor from PROBATION to ACTIVE at n>=10 and lower CI > 0.5')
  it('should kill sensor when n>=20 and lower CI of EV < 0')
  it('should kill sensor with no signal in 60 days')
})
```

### @agentic/backtest tests

```
describe('Backtester', () => {
  it('should run a sensor through historical data and return BacktestResult')
  it('should calculate win rate, expectancy, max drawdown')
  it('should handle no-trade scenarios (sensor never fires)')
  it('should track trade count accurately')
  it('should respect TP/SL logic: trade closes at whichever hits first')
})
```
