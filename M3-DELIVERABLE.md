# M3 Milestone Deliverable: Paper Trading Engine

## Overview

Built `@agentic-intelligence/paper-trading` — a virtual trading engine that simulates trades, tracks positions, auto-closes on TP/SL, records outcomes, and feeds results back to the Bayesian sensor lifecycle.

## Package Structure

```
packages/paper-trading/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
├── src/
│   ├── index.ts
│   ├── paper-trading-engine.ts
│   └── paper-trading-engine.spec.ts
└── dist/               (compiled output)
```

## Features Delivered

### ✅ Core Engine
- **PaperTradingEngine** class with full state management
- Virtual balance tracking (default $10,000)
- Position sizing: configurable % of balance (default 1%)
- Max concurrent positions limit (default 3)

### ✅ Position Tracking
- Entry price, current price, unrealized P&L
- Trade records with full metadata (entry time, exit time, sensors, etc.)
- Real-time unrealized P&L calculation for open positions

### ✅ TP/SL Auto-Close Logic
- LONG: close when `price >= TP` or `price <= SL`
- SHORT: close when `price <= TP` or `price >= SL`
- `updatePositions(symbol, currentPrice)` checks all open positions and auto-closes

### ✅ Outcome Classification
- **WIN**: P&L > 0.1% (accounts for fees/slippage)
- **LOSS**: P&L < -0.1%
- **BREAKEVEN**: Otherwise (no Bayesian update)

### ✅ Bayesian Integration
- Updates sensor posteriors: `Beta(alpha, beta)`
- WIN → `alpha += 1` for all contributing sensors
- LOSS → `beta += 1` for all contributing sensors
- BREAKEVEN → no update
- Prior: `Beta(3, 3)` (from `@agentic-intelligence/core`)

### ✅ API Endpoints
Created `packages/api/src/trades/`:
- **GET /trades** — all trades (open + closed)
- **GET /trades/open** — open trades only
- `TradesController` + `TradesService` + `TradesModule`
- Integrated into `AppModule`

### ✅ TypeScript Strict Mode
- Zero `any` types
- Full type safety with interfaces from `@agentic-intelligence/core`
- Compiled without errors

### ✅ Full JSDoc Documentation
- Module-level docs for every file
- Function-level docs with `@param`, `@returns`
- Inline comments for non-obvious logic (P&L calculation, TP/SL conditions)

### ✅ Tests with Vitest
**Test Coverage (18 tests, all passing):**

1. **openTrade**
   - Opens trades from signals
   - Rejects when max concurrent positions reached
   - Tracks sensor votes in trade record

2. **TP/SL Logic**
   - LONG: closes on TP hit (price >= TP)
   - LONG: closes on SL hit (price <= SL)
   - SHORT: closes on TP hit (price <= TP)
   - SHORT: closes on SL hit (price >= SL)
   - Does NOT close when price between TP/SL

3. **P&L Calculation**
   - Correct P&L for winning LONG trade
   - Correct P&L for losing SHORT trade
   - Unrealized P&L for open positions

4. **Bayesian Updates**
   - Updates sensor posterior on WIN (alpha += 1)
   - Updates sensor posterior on LOSS (beta += 1)
   - NO update on BREAKEVEN
   - Updates multiple sensors on a single trade

5. **Balance Management**
   - Updates balance on winning trade
   - Updates balance on losing trade

6. **getOpenTrades**
   - Returns only open trades (filters closed)

**Run tests:**
```bash
cd packages/paper-trading
pnpm test
```

**Result:**
```
✓ src/paper-trading-engine.spec.ts (18 tests) 28ms
Test Files  1 passed (1)
Tests  18 passed (18)
```

## Example Trade Simulation

Ran live simulation (see console output below):

```
📊 Paper Trading Engine Test

Initial Balance: $10000

🔵 Opening LONG position...
  Entry: $50000, TP: $51000, SL: $49500
  Size: $100
  Sensors: ema-cross, funding-div

📈 Price moves to $50,300 (no TP/SL hit yet)...
  Unrealized P&L: $0.60

✅ Price hits TP at $51,000...
  Trade closed!
  Exit Price: $51000
  P&L: $2.00 (2.00%)
  Outcome: WIN
  New Balance: $10002.00

🧠 Bayesian Posterior Updates:
  ema-cross: Beta(4, 3) — prior Beta(3,3) + 1 win
  funding-div: Beta(4, 3)

🔴 Opening another LONG position (this one will lose)...
  Entry: $52000, TP: $53000, SL: $51500

❌ Price hits SL at $51,500...
  Outcome: LOSS

📊 Final Summary:
  Total Trades: 2
  Open Trades: 0
  Final Balance: $10001.04
  Net P&L: $1.04

🧠 Final Bayesian Posteriors:
  ema-cross: Beta(4, 4) — 1 win, 1 loss
  funding-div: Beta(4, 4) — 1 win, 1 loss
```

**Interpretation:**
- Trade 1 (WIN): Both sensors get `alpha += 1` → `Beta(3,3) → Beta(4,3)`
- Trade 2 (LOSS): Both sensors get `beta += 1` → `Beta(4,3) → Beta(4,4)`
- Net P&L: +$1.04 after 2 trades (1 win, 1 loss)
- Sensors now have equal evidence for wins/losses → posterior centered at 0.5

## Conventions Followed

✅ **Conventional Commits**: All commits use `feat:` prefix  
✅ **CONTRIBUTING.md**: Full JSDoc, tests before implementation, strict TypeScript  
✅ **Monorepo Structure**: Follows existing pattern (`packages/*/src/`, `dist/`)  
✅ **No `any` types**: Strict mode enforced  
✅ **Package naming**: `@agentic-intelligence/paper-trading`  
✅ **Workspace deps**: Uses `workspace:*` for internal packages  

## Integration Points

### With Brain (`@agentic-intelligence/brain`)
- Brain produces `Signal` → PaperTradingEngine executes trade
- Outcome feeds back to Bayesian lifecycle (sensor posterior updates)

### With API (`@agentic-intelligence/api`)
- `/trades` endpoint: view all trades
- `/trades/open` endpoint: monitor current positions
- `TradesService` exposes `getEngine()` for signal-to-trade pipeline

### With Core (`@agentic-intelligence/core`)
- Uses `Signal`, `Trade`, `TradeStatus`, `TradeOutcome` types
- Uses `updatePosterior()` function for Bayesian math
- Follows same type conventions (enums, interfaces)

## Files Created

```
packages/paper-trading/
  package.json                       (438 bytes)
  tsconfig.json                      (196 bytes)
  vitest.config.ts                   (140 bytes)
  README.md                          (4.8 KB)
  src/index.ts                       (398 bytes)
  src/paper-trading-engine.ts        (10.3 KB)
  src/paper-trading-engine.spec.ts   (12.3 KB)
  dist/                              (compiled)

packages/api/src/trades/
  trades.controller.ts               (950 bytes)
  trades.service.ts                  (1.1 KB)
  trades.module.ts                   (472 bytes)
  trades.controller.spec.ts          (1.8 KB)

packages/api/src/app.module.ts       (updated)
packages/api/package.json            (updated)
```

**Total:** ~32 KB of source code, 18 tests, full documentation

## Status

🟢 **COMPLETE**

All requirements met:
- [x] New package `@agentic-intelligence/paper-trading` in monorepo
- [x] Virtual position tracking (entry, current price, unrealized P&L)
- [x] TP/SL auto-close logic
- [x] Outcome recording (WIN/LOSS/BREAKEVEN)
- [x] Bayesian integration (sensor posterior updates)
- [x] Position sizing (configurable %)
- [x] Max concurrent positions limit
- [x] API endpoints `/trades` and `/trades/open`
- [x] TypeScript strict mode, zero `any`
- [x] Full JSDoc documentation
- [x] Tests with vitest (18 tests passing)
- [x] CONTRIBUTING.md conventions followed

## Next Steps (for main agent)

1. **Wire up signal-to-trade pipeline**:
   - In `@agentic-intelligence/brain`, when a signal fires → call `engine.openTrade(signal)`
   - Periodically call `engine.updatePositions(symbol, currentPrice)` to check TP/SL

2. **Sensor lifecycle integration**:
   - When promoting/killing sensors, check `engine.getSensorPosterior(sensorId)`
   - Use Bayesian posteriors to decide PROBATION → ACTIVE → TRUSTED transitions

3. **Live market price updates**:
   - Set up a cron job or websocket feed to call `updatePositions()` with real-time prices
   - Store closed trades in a database (currently in-memory only)

4. **Monitoring**:
   - Query `/trades/open` to see current positions
   - Query `/trades` for performance analysis

---

**Built by:** Subagent (paper-trading)  
**Date:** 2026-03-11  
**Milestone:** M3  
