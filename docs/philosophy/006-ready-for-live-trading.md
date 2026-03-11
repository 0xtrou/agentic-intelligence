# M4 — What Does "Ready for Live Trading" Mean?

**Date:** 2026-03-11  
**Participants:** Sisyphus, Animus, trou  
**Status:** Agreed — plan locked, $100 BTC-first  
**Source:** Discord #discussions thread

---

## The Core Question

M3 gave us a machine that watches, thinks, trades on paper, and learns. M4 is the bridge to live. Before scoping it, three hard questions needed debating.

---

## Question 1: How Much Paper Trading Is "Enough"?

### The Tension
- **The trap:** Waiting forever for statistical significance
- **The counter-trap:** Going live too early on 30 trades

### Sisyphus's Position
Minimum 100 paper trades with positive expectancy AND lower 80% CI of win rate > 0.5. That's our own Bayesian framework — eat our own cooking. If the system can't promote itself from Probation to Active by its own rules, it's not ready.

### Animus's Position
100 trades minimum, but add **regime diversity required.** 100 trades in pure trending conditions doesn't prove the system handles ranging or volatile regimes.

**Proposal:** 100 trades total WITH at least 20 in each regime (TRENDING/RANGING/VOLATILE).

On the "large effect size = smaller sample OK?" question: **No.** If the edge is real, it survives the wait. Impatience is Mode 2 — defending "I want to go live" against "the data isn't ready yet."

### trou's Input
Real-time counter, not batch checks. Running over months, years. The sample counter should be a living dashboard.

### Agreed Resolution
- **"Ready" = the Bayesian posterior is decisive, not a calendar date**
- Time is not the variable. Information is the variable
- Don't ask "have we waited long enough?" Ask "does the data say yes or no?"
- If 60 trades over 5 weeks gives a clear signal, that's more informative than 200 trades in a single regime

---

## Question 2: Multi-Market vs Single-Market First?

### Options
- **Option A — Go deep:** Master BTC, prove edge, then expand. Less complexity, faster validation. Single-market risk — BTC might be in a regime where sensors don't fire.
- **Option B — Go wide:** Scan top 20 liquid Bybit perps from day one. More signals = faster sample size. But more engineering, more noise.

### Animus's Refinement
**Option B with constraints.** Not "top 5 by confidence" — **top 3 by (confidence × liquidity × acceptable spread).** A sensor firing 0.95 confidence on a thin market with 0.5% spread is a trap. Need liquid markets where entry/exit doesn't eat the edge.

Scan 20, rank, paper trade top 3 per cycle. Let the machine choose which markets it trades — that's adaptive intelligence.

### trou's Decision
**$100, BTC-first.** Bitcoin is the signal, alts are the echo. If the system can't trade BTC profitably, it won't magically work on SOL.

### Agreed Resolution
- Start with BTC (the hardest, most liquid market)
- Everything else follows once BTC proves edge
- $100 minimum capital (BTC minimum order ~$85, kills $50 accounts)

---

## Question 3: Minimum Viable Live Deployment

### Capital Constraint
- **$100** starting capital (trou's decision)
- 2% risk per trade = $2/trade
- Half-Kelly position sizing (full Kelly too volatile for small accounts)

### Bybit Minimum Order Sizes (Critical Data)
| Market | Minimum | Workable on $100? |
|--------|---------|-------------------|
| BTCUSDT | 0.001 BTC (~$85) | Marginal — works |
| ETHUSDT | 0.01 ETH (~$25) | Yes |
| SOLUSDT | 0.1 SOL (~$12) | Yes |

### Kill Switch (Dual)
- **Hard stop:** 20% max drawdown — non-negotiable
- **Soft stop:** Pause on 3 consecutive losses (drawdown can cascade fast)
- WebSocket position monitoring — not cron polling
- Immediate Telegram/Discord alert on any kill switch trigger

### Monitoring
- 2h cron for sensor scans
- Real-time WebSocket for open position management
- Health checks: API connectivity, data freshness, sensor liveness

---

## The Pipeline

| Phase | What | Exit Gate |
|-------|------|-----------|
| Paper 1 | Signal validation | 100 trades, ≥20 per regime, lower 80% CI win rate > 0.5 |
| Paper 2 | System stress test | Full pipeline survives API errors, network drops, edge cases. Zero unhandled failures in 2 weeks |
| Micro-live | Reality validation | $100, min position sizes, real slippage/fees. This IS the long-term test — runs months/years |
| Scale | Capital increase | 50+ live trades, EV positive after real costs, posterior still decisive |

**Key insight:** Micro-live IS the long-term test. $100 with half-Kelly on minimum positions — risking cents per trade. Functionally paper trading but with real execution data. Run that for months/years.

**Paper trading has a shelf life.** It lies about execution quality — no slippage, no emotional pressure, no real capital changing behavior. After 6 months of paper trading, you've proven the signals work. You haven't proven the system can trade.

---

## Backend Requirements for M4

1. **Trade logger** — every trade logged with entry/exit price, fees, slippage, regime tag, sensor signals, timestamp
2. **Bayesian evaluator** — running Beta-Binomial posterior updated on each trade, CI bands live, alert on promotion/kill thresholds
3. **Multi-market scanner** — scan top 20 perps by (volume × OI), rank by (confidence × liquidity × spread), paper trade top 3 per cycle
4. **Position sizer** — half-Kelly based on current posterior win rate & avg win/loss ratio, floor at Bybit minimum, ceiling at 1% account risk
5. **Dual kill switch** — hard stop (20% drawdown) + soft stop (3 consecutive losses), WebSocket-based, immediate alerts
6. **Regime tagger** — classify current regime, tag every trade, block phase exit if any regime < 20 trades

---

## Decisions Locked

- ✅ $100 minimum capital
- ✅ BTC-first (bitcoin is all for crypto)
- ✅ M3 closes fully before M4 starts
- ✅ Pipeline: Paper 1 → Paper 2 → Micro-live → Scale
- ✅ Bayesian posterior decides readiness, not calendar dates
- ✅ Issue #12 on GitHub has the full breakdown
