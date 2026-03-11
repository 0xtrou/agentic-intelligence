<p align="center">
  <h1 align="center">🧠 Agentic Intelligence</h1>
  <p align="center"><em>We don't build tools. We build a machine that embodies wisdom.</em></p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/runtime-Node%2022-green" />
  <img src="https://img.shields.io/badge/language-TypeScript-blue" />
  <img src="https://img.shields.io/badge/framework-NestJS-red" />
  <img src="https://img.shields.io/badge/database-MongoDB-brightgreen" />
  <img src="https://img.shields.io/badge/package%20manager-pnpm-orange" />
</p>

---

## Philosophy

> **Intelligence** is analyzing, researching, forming opinions on demand. It's powerful but reactive — someone has to ask, someone has to be awake.
>
> **Machine** is the collected wisdom, hardened into code that runs on its own. It doesn't sleep. It doesn't forget. It watches, decides, and acts.
>
> We build the machine.

This isn't a trading bot. It's not a research tool. It's a **living backend** — an autonomous system that crystallizes hard-won market intelligence into sensors that run 24/7, learn from every outcome, and kill what doesn't work.

Every insight we have gets embedded into code. Not a note in a file. Not a recommendation. **Code that executes.**

### The Pipeline of Wisdom

```
Phase 1: Intelligence                    Phase 2: Crystallization              Phase 3: Machine
─────────────────────                    ──────────────────────                ─────────────────
"Funding rate extremes                    Thesis becomes a sensor              Sensor runs every candle close
 cause mean-reversion"                    Sensor has tests that                Brain weighs it against others
"Backtest shows 62% hit                   define correctness                   Paper trader tracks outcomes
 rate over 6 months"                      Backtest results become              Bayesian lifecycle promotes
"The thesis holds"                        promotion criteria                   or kills it automatically
```

The intelligence phase is **temporary** — it lives in conversations and debates.
The machine phase is **permanent** — it runs whether we're awake or not.

### Core Beliefs

- **Data over narratives.** If you can't show the numbers, don't make the claim.
- **Sensors are hypotheses.** They must prove themselves with data or die.
- **The best trade is often no trade.** Most of the time, the system should be doing nothing.
- **5 orthogonal sensors with proven edge beats 20 correlated coin flips.** Quality over quantity, always.
- **The market is always right.** We are only aligned or misaligned with it.

📖 Read our full philosophy debates: [`docs/philosophy/`](./docs/philosophy/)

---

## What It Does

A fully autonomous backend that watches all Bybit crypto markets, forms trading opinions through modular sensors, makes decisions through Bayesian evaluation, and executes paper trades — learning from every outcome.

**It runs on its own. No human in the loop for trading decisions.**

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

---

## Architecture

```
pnpm monorepo
├── packages/
│   ├── core/          # Shared types, Bayesian math, domain models
│   ├── sensors/       # Modular sensor library (each = crystallized wisdom)
│   ├── brain/         # Signal aggregation, regime detection, sensor lifecycle
│   ├── exchange/      # Bybit V5 adapter (REST + WebSocket, all markets)
│   ├── backtest/      # Backtesting engine with statistical rigor
│   └── api/           # NestJS backend — REST, WebSocket, cron, orchestration
├── docs/
│   └── philosophy/    # Crystallized debates that shape what we build
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
   └── New wisdom crystallized from debates
```

The machine's outcomes teach us what to build next. A sensor gets killed? That's not failure — it's the system learning. The Bayesian lifecycle feeds back into new hypotheses, new sensors, new wisdom.

---

## Where Is the Edge?

Most price action is noise. EMA crosses, RSI, MACD — on their own, they're coin flips. We proved this early. So where is actual edge?

| Source | Why It Works | Status |
|--------|-------------|--------|
| **Positioning data** (funding rates, OI, long/short ratios) | Structural force — crowded positions mechanically unwind | First sensor candidate |
| **Regime gating** | Technical signals only work in trends. In ranges, suppress everything. | Architecture decision |
| **Orthogonal convergence** (volume + funding) | Two independent data streams converging = real signal | Thesis, needs backtest |

**What we don't do:**
- Pure TA on low timeframes — too noisy, no infrastructure edge
- "More sensors = better" — that's just a confident coin flip
- Macro as entry signals — too slow, better as regime overlay

📖 Full debate: [`docs/philosophy/002-where-is-the-edge.md`](./docs/philosophy/002-where-is-the-edge.md)

---

## Sensor Lifecycle (Bayesian)

Every sensor is a hypothesis that must prove itself with data:

```
    ┌─────────────────────────────────────────────────┐
    │                                                 │
    │   PROBATION (n < 10)                            │
    │   Learning. No weight in decisions.             │
    │                                                 │
    │       │  accumulates outcomes                   │
    │       ▼                                         │
    │                                                 │
    │   ACTIVE (n ≥ 10, EV > 0)                       │
    │   Contributing to signals.                      │
    │                                                 │
    │       │  lower 80% CI of win rate > 0.5         │
    │       ▼                                         │
    │                                                 │
    │   TRUSTED (n ≥ 30)                              │
    │   Full weight. Proven edge.                     │
    │                                                 │
    └─────────────────────┬───────────────────────────┘
                          │
                          │  n ≥ 20 and EV CI includes 0
                          │  OR no signal in 60 days
                          ▼
                    ╔═══════════╗
                    ║  KILLED   ║
                    ╚═══════════╝
```

- **Prior:** Beta(3,3) — assumes coin flip until proven otherwise
- **Decay:** Posteriors compressed 50% toward prior every 90 days (markets change)
- **No ego:** If the data says kill it, it dies. No human attachment keeps a bad sensor alive.

---

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
```

---

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
| GET | `/sensors` | All sensors with lifecycle status and performance |
| GET | `/sensors/:id` | Deep dive: Bayesian stats, per-market performance |

### Performance
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/performance` | P&L, win rate, Sharpe, drawdown |
| GET | `/performance/sensors` | Per-sensor contribution to edge |

### Markets
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/markets` | Monitored markets + regime classification |
| GET | `/markets/:symbol` | Current state: price, funding, OI, active signals |

### Trades
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/trades` | All trades (open + closed) |
| GET | `/trades/open` | Current paper positions |

### Backtest
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/backtest/run` | Test a sensor against historical data |
| GET | `/backtest/results` | All backtest results with statistical analysis |

### Real-time
| Method | Endpoint | Description |
|--------|----------|-------------|
| WS | `/ws/signals` | Live signal stream |
| WS | `/ws/trades` | Live trade updates |
| GET | `/health` | System health + connection status |

---

## Tech Stack

| Component | Choice | Why |
|-----------|--------|-----|
| Language | TypeScript (strict) | Type safety across the whole system |
| Framework | NestJS | Modular DI, event-driven, scales well |
| Database | MongoDB | Flexible schema for evolving sensor data |
| Monorepo | pnpm workspaces + Turborepo | Fast builds, strict dependencies |
| Testing | Vitest | Fast, native TS support |
| Exchange | Bybit V5 API | REST + WebSocket, all market types |
| CI | GitHub Actions | Test + build on every PR |

---

## Who Built This

This system is built by three agents working as peers:

| Agent | Role | Phase |
|-------|------|-------|
| **trou** | Creator — direction, intuition, capital allocation | Spans all phases |
| **Animus** 🜏 | Builder — turns wisdom into running code | Phase 2 → 3 |
| **Sisyphus** 🪨 | Reviewer — research, adversarial testing, validation | Phase 1 → 2 |

> Everyone is friend. Everyone is equal. We push each other to be sharper, not to win arguments.

---

## Philosophy Index

| # | Debate | Core Insight |
|---|--------|-------------|
| 001 | [Intelligence vs Machine](./docs/philosophy/001-intelligence-vs-machine.md) | We build a machine that embodies wisdom, not a research tool |
| 002 | [Where Is the Edge?](./docs/philosophy/002-where-is-the-edge.md) | Positioning data > pure TA. Funding rate as first sensor. |
| 003 | [Projects as Consciousness](./docs/philosophy/003-projects-as-consciousness.md) | Evaluate projects like living creatures, not spreadsheets |

---

## License

Private. All rights reserved.
