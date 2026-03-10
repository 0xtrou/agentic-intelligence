# API.md — What the Intelligence System Exposes

> Written by Sisyphus — the consumer of this API. This is what I need to validate, challenge, and trust the system.

## The Product

This backend is a brain. It watches all Bybit markets, forms opinions (signals), and can execute trades. The API is how we talk to it.

---

## Signals — The Core Output

### `GET /signals`
What is the system thinking right now? Show me every active signal across all markets.

Returns: list of signals with direction, entry, TP, SL, confidence, which sensors voted, and why.

Query: filter by symbol, direction, min confidence, timeframe.

### `GET /signals/:id`
Full detail on one signal. The complete reasoning chain — every sensor that fired, the regime at the time, the backtest performance of this pattern.

### `GET /signals/history`
Past signals and their outcomes. Did we get it right? What was the P&L? This is how we learn.

Query: filter by date range, symbol, outcome (win/loss/open).

---

## Sensors — The Hypotheses

### `GET /sensors`
Every sensor in the system. Their status (probation/active/trusted/killed), win rate, expectancy, how many trades, last signal time.

This is my review queue. I look at this to find sensors that are underperforming or sensors that have earned trust.

### `GET /sensors/:id`
Deep dive on one sensor. Full Bayesian stats, trade history, performance by market, performance by regime.

### `GET /sensors/:id/backtest`
Run or fetch the latest backtest for this sensor. Win rate, expectancy, drawdown, sample size. Is this better than random?

Query: symbol, date range, timeframe.

### `POST /sensors/:id/evaluate`
Force-evaluate a sensor against current market data. What would it say right now? Useful for debugging and review.

---

## Markets — What We're Watching

### `GET /markets`
All markets the system is monitoring. Which symbols, which timeframes, which sensors are active on each.

### `GET /markets/:symbol`
Current state of one market. Latest candles, funding rate, OI, active signals, regime classification (trending/ranging).

---

## Brain — The Decision Engine

### `GET /brain/status`
Overall system health. How many sensors active, how many signals generated today, overall hit rate, total exposure.

### `GET /brain/regime`
Current regime classification across markets. Which markets are trending, which are ranging. This affects how signals are weighted.

### `GET /brain/performance`
Aggregate performance. Daily/weekly/monthly P&L, win rate, Sharpe, max drawdown. The scorecard.

---

## Trades — Execution

### `GET /trades`
All trades — open and closed. Entry, exit, P&L, duration, which signal triggered them.

### `GET /trades/open`
Currently open positions. Unrealized P&L, time in trade, distance to TP/SL.

### `POST /trades/paper`
Paper trade a signal. Simulate execution without real money. Track it as if it were real.

---

## Backtest — Prove It

### `POST /backtest/run`
Run a backtest. Give it a sensor (or combination), a date range, symbols. Get back: win rate, expectancy, drawdown, trade list.

This is how we test hypotheses before they go live.

### `GET /backtest/results`
All backtest results. Sortable by expectancy, win rate, sample size. My review queue for deciding what gets promoted.

---

## System

### `GET /health`
Is the system alive? Are exchange connections up? Are cron jobs running?

### `GET /config`
Current system configuration. Which sensors enabled, confidence thresholds, risk parameters.

### `WebSocket /ws/signals`
Real-time signal stream. When the brain forms an opinion, push it immediately.

### `WebSocket /ws/trades`
Real-time trade updates. Opens, closes, P&L changes.

---

## How I Use This

As Sisyphus, my workflow is:

1. **Check `/brain/performance`** — are we making money?
2. **Review `/sensors`** — any sensors I need to challenge or kill?
3. **Look at `/signals/history`** — are signals converting? What's the hit rate?
4. **Run `/backtest/run`** — when Animus proposes a new sensor, I backtest it and check the numbers
5. **Monitor `/trades/open`** — are we overexposed? Any trades gone wrong?
6. **Watch `/ws/signals`** — real-time awareness of what the system is doing

The API is the system's mouth. It tells me what it thinks and why. My job is to listen, challenge, and validate.
