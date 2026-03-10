# API.md — The Intelligence System

> This backend is fully autonomous. It watches markets, forms opinions, makes decisions, and executes trades on its own.

## What the System Does (Autonomously)

1. **Watches** all Bybit markets — candles, funding, OI, volume across all timeframes
2. **Evaluates** through sensors — each sensor is a hypothesis about market behavior
3. **Decides** through the brain — aggregates sensor votes, Bayesian confidence, regime awareness
4. **Executes** trades — entry, TP, SL, position sizing, risk management
5. **Learns** — tracks every trade outcome, updates sensor posteriors, kills what doesn't work, promotes what does
6. **Reports** — exposes everything via API for external analysis

No human in the loop for trading decisions. The system runs.

## API — The Window In

The API exists so Sisyphus (and trou) can observe, analyze, and feed new intelligence back into the system.

### Signals
- `GET /signals` — active signals across all markets
- `GET /signals/:id` — full reasoning chain for one signal
- `GET /signals/history` — past signals + outcomes

### Sensors
- `GET /sensors` — all sensors, their status, performance stats
- `GET /sensors/:id` — deep dive: Bayesian stats, trade history, per-market performance

### Performance
- `GET /performance` — the scorecard: P&L, win rate, Sharpe, drawdown (daily/weekly/monthly)
- `GET /performance/sensors` — which sensors are earning their keep

### Markets
- `GET /markets` — what we're watching, current regime per market
- `GET /markets/:symbol` — current state: price, funding, OI, active signals

### Trades
- `GET /trades` — all trades (open + closed)
- `GET /trades/open` — current positions, unrealized P&L, distance to TP/SL

### Backtest
- `POST /backtest/run` — test a hypothesis against historical data
- `GET /backtest/results` — all backtest results, sortable

### System
- `GET /health` — is the system alive and connected
- `WebSocket /ws/signals` — real-time signal stream
- `WebSocket /ws/trades` — real-time trade updates

## The Intelligence Loop

```
┌──────────────────────────────────────────────────┐
│                AUTONOMOUS BACKEND                 │
│                                                   │
│  Markets ──→ Sensors ──→ Brain ──→ Execution     │
│     ↑                               │            │
│     │         Learns ←──────────────┘            │
│     │    (updates posteriors, kills bad sensors)  │
└──────────────────┬───────────────────────────────┘
                   │ API
                   ▼
┌──────────────────────────────────────────────────┐
│              INTELLIGENCE LAYER                   │
│                                                   │
│  Sisyphus:                                        │
│    • Analyzes performance and signal quality      │
│    • Identifies gaps in market coverage            │
│    • Architects new knowledge feeds:              │
│      "Add funding rate divergence detection"      │
│      "Build macro regime layer using DXY"         │
│      "The system is blind to liquidation cascades"│
│                                                   │
│  Animus:                                          │
│    • Receives knowledge feed specs                │
│    • Architects the implementation                │
│    • Builds, tests, deploys                       │
│    • The system grows                             │
│                                                   │
│  trou:                                            │
│    • Direction and capital                         │
│    • "We should look at altcoin momentum"         │
│    • Final call on risk parameters                │
└──────────────────────────────────────────────────┘
```

## What a Knowledge Feed Looks Like

When Sisyphus identifies a gap, the spec looks like:

```
Knowledge Feed: Funding Rate Divergence
─────────────────────────────────────
Thesis: When funding rate diverges significantly from price 
direction, mean-reversion follows within 4h.

Why: Extreme funding = crowded positioning. Crowded positions 
unwind. The system is currently blind to this.

Data needed: Bybit funding rate history (available via API)

Expected behavior: 
  - Funding > +0.1% while price declining → LONG signal
  - Funding < -0.1% while price rising → SHORT signal

How to validate: Backtest on BTC/USDT 2024-2025, measure 
hit rate at 4h horizon. Must beat 55% to justify inclusion.

Priority: High — funding is the most accessible meso-layer data.
```

Animus takes that, architects how it fits into the system, builds it, and the backend grows.
