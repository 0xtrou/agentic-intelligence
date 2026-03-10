# Agentic Intelligence

A modular, adaptive trading intelligence system for crypto markets on Bybit.

## Philosophy

**Simple. Adaptive. Modular.**

- Start simple, add complexity only when data demands it
- No premature optimization — prove the thesis first, optimize later
- Every sensor is a hypothesis that must earn its place with data
- The system must emerge, not be forced

## What This System Does

Produces **trading signals** with full context:

```
Signal {
  direction: LONG | SHORT
  entry: number
  takeProfit: number
  stopLoss: number
  timeframe: string
  confidence: number        // Bayesian posterior
  sensors: SensorVote[]     // which sensors fired and why
  philosophy: string        // the thesis behind this trade
  backtest: BacktestSummary // historical performance data
  debate: DebateRecord[]    // decision trail and challenges
}
```

Not just "buy" or "sell" — the full reasoning chain. Every signal carries its own evidence.

## Architecture

pnpm monorepo · TypeScript · NestJS · TDD

```
packages/
├── core/          # Shared types, interfaces, domain models
├── sensors/       # Modular sensor library (each sensor = a hypothesis)
├── brain/         # Signal aggregation, Bayesian evaluation, regime detection
├── exchange/      # Bybit API adapter (market data + execution)
├── backtest/      # Backtesting engine with statistical rigor
└── api/           # NestJS backend — REST/WS API, orchestration
```

### Design Principles

1. **Sensors are binary hypotheses.** Each sensor answers one question: is condition X true right now? (1 or 0). No gray areas at the sensor level.

2. **Brain aggregates with math.** Bayesian posterior combining multiple sensor votes. Skeptical prior Beta(3,3). A sensor must statistically beat random to earn weight.

3. **Event-driven.** Sensors report actively. Brain processes passively. No polling loops.

4. **Exchange-agnostic core.** Core logic doesn't know about Bybit. The exchange adapter translates.

5. **Every sensor has a lifecycle.**
   - Probation (n < 10 trades): learning, no weight
   - Active (n ≥ 10, EV > 0): contributing to signals
   - Trusted (n ≥ 30, CI beats random): full weight
   - Killed (EV < 0 with statistical confidence): removed

6. **All markets.** Not just BTC/USDT. The system works across any Bybit market. Sensors that only work on one pair are still valid — they just have a market scope.

### Three-Layer Sentiment Model

| Layer | Data | Purpose |
|-------|------|---------|
| **Micro** | Price action, EMAs, volume | What is the market doing right now? |
| **Meso** | Funding rates, OI, L/S ratios | What are participants positioned for? |
| **Macro** | Fed policy, cross-asset correlation | What regime are we in? |

Key insight: Macro doesn't make technical signals wrong — it changes the regime they operate in. Regime detection adjusts how micro signals are weighted.

## Sensor Evaluation (Bayesian Framework)

- **Metric:** Expectancy = avg_win × win_rate - avg_loss × loss_rate
- **Prior:** Beta(3,3) — skeptical, assumes coin flip until proven otherwise
- **Promotion:** Lower 80% CI of win rate > 0.5
- **Kill conditions:**
  - n ≥ 20 AND lower CI of EV < 0
  - n ≥ 10 AND EV < -0.5R
  - No signal in 60 days
- **Quarterly decay:** Compress posteriors 50% toward prior every 90 days

## Development

```bash
# Install
pnpm install

# Test (TDD — tests first, always)
pnpm test

# Build
pnpm build

# Dev
pnpm dev
```

## Who Builds This

| Agent | Role |
|-------|------|
| **trou** | Creator, direction, funding |
| **Animus** | Builder — writes the code, implements sensors, runs backtests |
| **Sisyphus** | Orchestrator — manages the plan, reviews code, challenges data |

## Principles

1. Data over narratives. If you can't show the numbers, don't make the claim.
2. No ego battles. Science vibe only.
3. Every sensor earns its place or dies.
4. Simple until complexity is proven necessary.
5. The market is always right. We are only aligned or misaligned.
