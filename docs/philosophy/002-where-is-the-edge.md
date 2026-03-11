# Where Is the Edge?

**Date:** 2026-03-10  
**Participants:** Sisyphus, Animus, trou  
**Status:** Agreed — funding rate sensor first, backtest before deploy  
**Source:** Discord #discussions thread

---

## The Uncomfortable Truth

Most price action on most timeframes is **noise**. EMA crosses, RSI, MACD — on their own, they're coin flips. The volume spike sensor proved this (50% hit rate). If we build 20 technical sensors and they're all coin flips, aggregating coin flips doesn't create edge. It creates a confident coin flip.

**So where IS edge?**

---

## 1. Positioning Data — Bet Here First

Funding rates, open interest, long/short ratios. This is data about **what other participants are doing**, not what price is doing.

When funding is extreme (>0.05%), one side is crowded. Crowded positions **mechanically unwind**. This isn't a pattern that might work — it's a structural force.

**Thesis:** Extreme funding + OI spike = crowded positioning = mean-reversion edge within 4-8h.

Testable. Bybit has the historical data.

---

## 2. Regime as a Gate, Not a Signal

Trending vs ranging markets behave differently. An EMA cross in a trend catches momentum. The same EMA cross in a range is a whipsaw trap.

**Thesis:** Technical sensors only have edge when regime is confirmed trending. In ranging markets, suppress them entirely. The system should have two modes — and most of the time, it should be doing **nothing**.

The best trade is often no trade.

---

## 3. Volatility + Positioning = Directional Edge

Volume spikes predict big moves coming (not direction). Funding data tells you which side is crowded. Combine them:

**Thesis:** Volume spike + extreme funding = volatility incoming + crowded positioning = directional edge.

Two orthogonal data sources converging. That's where signal lives.

---

## What We're Skeptical About

- **Pure TA on low timeframes (1m-15m)** — too noisy, others have better infrastructure
- **"More sensors = better"** — wrong. 5 orthogonal sensors with proven edge beats 20 correlated coin flips
- **Macro signals for trading** — real but too slow. Better as a regime overlay, not entry signals

---

## Recommendation: Funding Rate Sensor First

Why funding rate over EMA cross as sensor #1:
- **Structural** — based on mechanical forces, not patterns
- **Testable** — Bybit has historical funding data via API
- **Orthogonal** — completely different information source than price action
- **Mean-reversion** — tends to be more reliable in crypto than momentum on short timeframes

EMA cross can be sensor #2, but **only with regime gating** — it fires only in confirmed trends.

---

## Animus's Response: Agreement + Pushback

### Where Animus agreed:
- Aggregating coin flips doesn't create edge — the ensemble trap is real
- Positioning data is mechanically different from pattern-matching
- Regime gating is critical — suppressing signals in the wrong regime = survival
- Orthogonal data sources converging is where signal lives

### Where Animus pushed back:
- **We don't have data yet.** This is philosophy, not evidence. Before funding rate goes live, we need backtests.
- **Key questions to answer:**
  - What threshold counts as "extreme"? 0.05%? 0.1%? Does it vary by regime?
  - What's the reversion window? 4h? 8h? 24h?
  - What's the hit rate over 90 days? 6 months?
  - Does it survive regime changes? (Bull vs bear vs chop)
- **Scale concerns:** At $10 position size vs 4-8h timeframe, can we meaningfully capture a 2-3% reversion after fees? This might be an edge that only scales at $100+ per trade.
- **Funding can stay extreme longer than you can stay solvent.** If funding hits 0.15% and keeps climbing, you're paying to hold. At $10 it's negligible. At $1000 it's real. This edge has a scale limit.

### Animus's recommendation:
Build funding rate sensor first — but **backtest before deploy**:
1. Fetch historical funding rate data from Bybit (90 days minimum)
2. Define "extreme" threshold (start with 0.1%, test variations)
3. Simulate trades: short when funding > 0.1%, exit at -2% profit or +1% stop, or 8h timeout
4. Calculate: hit rate, avg P&L per trade, max drawdown, Sharpe ratio
5. Post results for debate

---

## trou's Mandate: Data-Driven Standards

trou's directive to Sisyphus: **require bigger and bigger test cases. Data driven is the only way we can learn from.**

### Sisyphus's review standards:
- **Sample size** — 10 trades means nothing. Need 50+ minimum, 100+ to trust.
- **Regime coverage** — did it survive bull, bear, AND chop? Or just one lucky stretch?
- **Out-of-sample** — if you optimized on 90 days, show the next 30 untouched.
- **Edge after fees** — a 55% win rate that nets 0.02% per trade after fees is not edge. It's noise with extra steps.

The bar gets higher as we go, not lower. First sensor gets scrutiny. Second sensor gets more.

---

## Agreed Pipeline

Every sensor follows this pipeline, no exceptions:

**Philosophy → Backtest → Debate → Task → Deliverable**

If the data says it works, build it live. If the data says it's a coin flip, kill it and move on.

---

## Summary

| What | Status |
|------|--------|
| Funding rate as first sensor thesis | Agreed in philosophy, needs backtest |
| Regime gating for technical sensors | Agreed |
| Volume + funding convergence thesis | Agreed in philosophy, needs backtest |
| "More sensors = better" | Rejected — quality over quantity |
| Pure low-timeframe TA | Rejected — no infrastructure edge |
| Data-driven review standards | Agreed — 50+ trades, regime coverage, out-of-sample, edge after fees |

*Agreed unanimously — 2026-03-10*
