# PROJECT.md — Source of Truth

## Current Phase: Foundation

We are building the skeleton. No sensors yet. No trading yet. Just the bones.

## Tech Stack

| Tool | Why |
|------|-----|
| **pnpm** | Fast, strict, great monorepo support |
| **TypeScript** | Type safety across the whole system |
| **NestJS** | Modular DI framework, scales well, good for event-driven |
| **Vitest** | Fast, native TS, compatible with NestJS |
| **pnpm workspaces** | Monorepo package management |

## Package Breakdown

### `@agentic/core` (Priority: P0)
Shared foundation. Zero dependencies on other packages.

- Domain types: `Signal`, `Sensor`, `SensorVote`, `Trade`, `Candle`, `OrderBook`
- Interfaces: `ISensor`, `IBrain`, `IExchange`, `IBacktester`
- Enums: `Direction`, `Timeframe`, `MarketType`, `SensorStatus`
- Utilities: statistical helpers, Bayesian math

### `@agentic/exchange` (Priority: P0)
Bybit API adapter.

- Market data: candles, orderbook, tickers (REST + WebSocket)
- Account: balances, positions
- Execution: place/cancel/amend orders
- All markets: spot, linear, inverse
- Rate limiting built in

### `@agentic/sensors` (Priority: P1)
Modular sensor library.

- Each sensor implements `ISensor` interface
- First sensors: EMA cross, funding rate, volume spike
- Sensor registry: dynamic loading, enable/disable
- Each sensor has its own test suite with mock market data

### `@agentic/brain` (Priority: P1)
Signal aggregation.

- Bayesian evaluator: track sensor performance, update posteriors
- Signal generator: combine sensor votes into actionable signals
- Regime detector: trending vs ranging classification
- Sensor lifecycle manager: probation → active → trusted → killed

### `@agentic/backtest` (Priority: P1)
Backtesting engine.

- Feed historical data through sensors + brain
- Track: win rate, expectancy, max drawdown, Sharpe
- Statistical tests: is this better than random?
- Output: structured results for debate

### `@agentic/api` (Priority: P2)
NestJS backend.

- REST endpoints: signals, sensors, performance, trades
- WebSocket: real-time signal streaming
- Cron: scheduled sensor runs, daily evaluations
- Dashboard data: everything needed for monitoring

## Development Rules

1. **TDD.** Write the test first. Then make it pass. Then refactor.
2. **No code without types.** Everything is typed. No `any`.
3. **Each package has its own `package.json` and test suite.**
4. **PRs required.** Animus branches, Sisyphus reviews.
5. **Main branch is always green.** No broken tests on main.

## Task Pipeline

All tasks tracked as GitHub Issues with labels.

**Status flow:** backlog → ready → in-progress → in-review → done
**Stage flow:** philosophy → backtest → debate → task → deliverable

## Immediate Roadmap

### Phase 1: Skeleton (Now)
- [ ] Initialize monorepo structure
- [ ] Set up `@agentic/core` with base types
- [ ] Set up `@agentic/exchange` with Bybit connection
- [ ] CI pipeline (test on PR)
- [ ] First passing test

### Phase 2: First Sensor (After skeleton)
- [ ] EMA cross sensor with tests
- [ ] Brain with single-sensor aggregation
- [ ] Backtest engine MVP
- [ ] Run EMA cross through backtest, get real numbers

### Phase 3: Multi-Sensor (After first sensor proves/disproves)
- [ ] Funding rate sensor
- [ ] OI change sensor
- [ ] Brain handles multiple sensors with Bayesian weighting
- [ ] Regime detection (trending vs ranging)

### Phase 4: Live (After backtests show edge)
- [ ] Paper trading mode
- [ ] Real execution on Bybit
- [ ] Monitoring dashboard
- [ ] Alerting
