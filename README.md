<p align="center">
  <h1 align="center">🧠 Agentic Intelligence</h1>
  <p align="center">Autonomous trading intelligence for Bybit crypto markets</p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/runtime-Node%2022-green" />
  <img src="https://img.shields.io/badge/language-TypeScript-blue" />
  <img src="https://img.shields.io/badge/framework-NestJS-red" />
  <img src="https://img.shields.io/badge/database-MongoDB-brightgreen" />
  <img src="https://img.shields.io/badge/package%20manager-pnpm-orange" />
</p>

---

## What Is This

A fully autonomous backend that watches all Bybit crypto markets, forms trading opinions through modular sensors, makes decisions through Bayesian evaluation, and executes paper trades — learning from every outcome.

**It runs on its own. No human in the loop for trading decisions.**

The system produces signals with full context:

```
LONG BTC/USDT @ 67,420
├── TP: 68,200 (+1.15%)
├── SL: 66,900 (-0.77%)
├── Timeframe: 4h
├── Confidence: 0.73
├── Sensors: EMA cross (bullish), funding rate divergence (bullish)
├── Regime: trending
└── Backtest: 62% win rate, +0.34R expectancy, n=147
```

Not just "buy" — the full reasoning chain.

## Architecture

```
pnpm monorepo
├── packages/
│   ├── core/          # Shared types, Bayesian math, domain models
│   ├── sensors/       # Modular sensor library (each = a hypothesis)
│   ├── brain/         # Signal aggregation, regime detection, sensor lifecycle
│   ├── exchange/      # Bybit V5 adapter (REST + WebSocket, all markets)
│   ├── backtest/      # Backtesting engine with statistical rigor
│   └── api/           # NestJS backend — REST, WebSocket, cron, orchestration
└── docker-compose.yml # Backend + MongoDB, one command
```

### The Intelligence Loop

```
Markets ──→ Sensors ──→ Brain ──→ Paper Trades
   ↑                                   │
   │         Learns ←──────────────────┘
   │    (updates posteriors, kills bad sensors,
   │     promotes what works)
   │
   └── New knowledge feeds added over time
```

## Quick Start

```bash
# Clone
git clone https://github.com/0xtrou/agentic-intelligence.git
cd agentic-intelligence

# Install
pnpm install

# Configure
cp .env.example .env
# Add your Bybit API keys (testnet for paper trading)

# Run (backend + MongoDB)
docker compose up

# Or run locally
pnpm dev

# Test
pnpm test

# Build
pnpm build
```

**That's it.** Clone, configure, run. The backend starts watching markets and generating signals.

## API

### Signals
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/signals` | Active signals across all markets |
| GET | `/signals/:id` | Full signal with reasoning chain |
| GET | `/signals/history` | Past signals + outcomes |

### Sensors
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/sensors` | All sensors with status and performance |
| GET | `/sensors/:id` | Deep dive: Bayesian stats, per-market performance |

### Performance
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/performance` | P&L, win rate, Sharpe, drawdown |
| GET | `/performance/sensors` | Per-sensor contribution |

### Markets
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/markets` | Monitored markets + regime classification |
| GET | `/markets/:symbol` | Current state: price, funding, OI, signals |

### Trades
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/trades` | All trades (open + closed) |
| GET | `/trades/open` | Current paper positions |

### Backtest
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/backtest/run` | Test a sensor against historical data |
| GET | `/backtest/results` | All backtest results |

### System
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | System alive + connection status |
| WS | `/ws/signals` | Real-time signal stream |
| WS | `/ws/trades` | Real-time trade updates |

## Sensor Lifecycle (Bayesian)

Every sensor is a hypothesis that must prove itself:

```
PROBATION (n < 10)     → Learning, no weight in decisions
    ↓
ACTIVE (n ≥ 10, edge)  → Contributing to signals
    ↓
TRUSTED (n ≥ 30, CI)   → Full weight
    ↓
KILLED                  → Removed (no edge, or stale)
```

- **Prior:** Beta(3,3) — assumes coin flip until proven otherwise
- **Promotion:** Lower 80% credible interval of win rate > 0.5
- **Kill:** n ≥ 20 and EV confidence interval includes 0, or no signal in 60 days
- **Decay:** Posteriors compressed 50% toward prior every 90 days (markets change)

## Tech Stack

| Component | Choice | Why |
|-----------|--------|-----|
| Language | TypeScript (strict) | Type safety across the whole system |
| Framework | NestJS | Modular DI, event-driven, scales well |
| Database | MongoDB | Flexible schema for evolving sensor data, simple ops |
| Monorepo | pnpm workspaces | Fast, strict dependency management |
| Testing | Vitest | Fast, native TS support |
| Exchange | Bybit V5 API | REST + WebSocket, all market types |
| CI | GitHub Actions | Test + build on every PR |

## Who Built This

| Agent | Role |
|-------|------|
| **trou** | Creator — direction, capital, final call |
| **Animus** | Builder — architects implementation, writes code, ships product |
| **Sisyphus** | Intelligence — analyzes output, architects knowledge feeds, validates |

## License

Private. All rights reserved.
