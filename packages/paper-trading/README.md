# @agentic-intelligence/paper-trading

Paper trading engine for virtual position simulation and Bayesian sensor lifecycle.

## Overview

This package simulates trades without real capital, tracks virtual positions, monitors TP/SL conditions, and feeds trade outcomes back to the Bayesian sensor lifecycle for continuous learning.

## Features

- **Virtual Position Tracking**: Track entry price, current price, unrealized P&L
- **Automatic TP/SL**: Auto-close positions when take-profit or stop-loss hit
- **Outcome Recording**: Classify trades as WIN/LOSS/BREAKEVEN
- **Bayesian Integration**: Update sensor posteriors (Beta distribution) based on outcomes
- **Position Sizing**: Configurable % of virtual balance (default $10,000)
- **Risk Management**: Max concurrent positions limit
- **TypeScript**: Full type safety with zero `any` types
- **Tested**: Comprehensive test suite with vitest

## Installation

```bash
pnpm add @agentic-intelligence/paper-trading
```

## Usage

### Basic Example

```typescript
import { PaperTradingEngine } from '@agentic-intelligence/paper-trading';
import { Signal, SignalDirection } from '@agentic-intelligence/core';

// Initialize engine
const engine = new PaperTradingEngine({
  initialBalance: 10000,
  positionSizePercent: 1, // 1% per trade
  maxConcurrentPositions: 3,
});

// Open a trade from a signal
const signal: Signal = {
  id: 'signal-1',
  symbol: 'BTCUSDT',
  direction: SignalDirection.LONG,
  entry: 50000,
  tp: 51000,
  sl: 49500,
  timeframe: '1h',
  confidence: 0.75,
  sensorVotes: [
    { sensorId: 'ema-cross', fire: true, /* ... */ },
    { sensorId: 'funding-div', fire: true, /* ... */ },
  ],
  regime: MarketRegime.TRENDING,
  timestamp: Date.now(),
};

const trade = engine.openTrade(signal);
console.log(`Opened trade: ${trade?.id}`);

// Update positions with current price
const closedTrades = engine.updatePositions('BTCUSDT', 51000);
if (closedTrades.length > 0) {
  console.log(`TP hit! P&L: $${closedTrades[0].pnl}`);
}

// Check Bayesian posteriors
const posterior = engine.getSensorPosterior('ema-cross');
console.log(`ema-cross: Beta(${posterior?.alpha}, ${posterior?.beta})`);
```

### API

#### `PaperTradingEngine`

**Constructor:**

```typescript
new PaperTradingEngine(config?: Partial<PaperTradingConfig>)
```

**Methods:**

- `getBalance(): number` — Get current virtual balance
- `getTrades(): Trade[]` — Get all trades (open + closed)
- `getOpenTrades(): Trade[]` — Get only open trades
- `openTrade(signal: Signal): Trade | null` — Open a new position (returns null if rejected)
- `updatePositions(symbol: string, currentPrice: number): Trade[]` — Update positions, auto-close on TP/SL hit
- `closeTrade(tradeId: string, exitPrice?: number): Trade | null` — Manually close a trade
- `getUnrealizedPnL(tradeId: string, currentPrice: number): number | null` — Get unrealized P&L for open trade
- `getTotalUnrealizedPnL(symbol: string, currentPrice: number): number` — Get total unrealized P&L for symbol
- `getSensorPosterior(sensorId: string): BayesianPosterior | undefined` — Get sensor's Beta posterior
- `getAllSensorPosteriors(): Map<string, BayesianPosterior>` — Get all sensor posteriors

#### `PaperTradingConfig`

```typescript
interface PaperTradingConfig {
  initialBalance: number;           // Default: 10000
  positionSizePercent: number;      // Default: 1 (1% per trade)
  maxConcurrentPositions: number;   // Default: 3
}
```

## TP/SL Logic

**LONG:**
- TP hit when `currentPrice >= tp`
- SL hit when `currentPrice <= sl`

**SHORT:**
- TP hit when `currentPrice <= tp`
- SL hit when `currentPrice >= sl`

## Outcome Classification

- **WIN**: P&L > 0.1% of position size
- **LOSS**: P&L < -0.1% of position size
- **BREAKEVEN**: Otherwise (no Bayesian update)

## Bayesian Updates

When a trade closes:

- **WIN**: `alpha += 1` for all contributing sensors
- **LOSS**: `beta += 1` for all contributing sensors
- **BREAKEVEN**: No update

Prior: `Beta(3, 3)` (weakly informative, centered at 0.5)

## Testing

```bash
pnpm test
```

Test coverage:
- Position opening/closing
- TP/SL auto-close logic (LONG + SHORT)
- P&L calculation
- Bayesian posterior updates
- Concurrent position limits
- Balance management

## Example Output

```
Initial Balance: $10000
Opening LONG position...
  Entry: $50000, TP: $51000, SL: $49500, Size: $100

Price hits TP at $51,000...
  P&L: $2.00 (2.00%)
  Outcome: WIN
  New Balance: $10002.00

Bayesian Posteriors:
  ema-cross: Beta(4, 3) — 1 win
  funding-div: Beta(4, 3) — 1 win
```

## Integration

This package is designed to integrate with:

- **@agentic-intelligence/brain**: Brain produces signals → paper-trading executes → outcomes feed back to Bayesian lifecycle
- **@agentic-intelligence/api**: Exposes `/trades` and `/trades/open` endpoints via NestJS

## License

MIT
