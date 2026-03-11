# M4.6 Expanded Backtest Results

Generated: 2026-03-11T13:37:00.019Z

## Configuration

| Timeframe | TP | SL | Max Hold | Regime Threshold |
|-----------|----|----|----------|------------------|
| 1D | +3% | -1.5% | 12 candles | ATR(14) > 1.5% |
| 1W | +8% | -4% | 12 candles | ATR(14) > 1.5% |

## Overall Results

| Symbol | TF | Candles | EMA Signals | EMA WR | EMA Exp | RSI Signals | RSI WR | RSI Exp | Fund Signals | Fund WR | Fund Exp | Total Signals | Overall WR | Overall Exp |
|--------|-----|---------|-------------|--------|---------|-------------|--------|---------|--------------|---------|---------|---------------|------------|-------------|
| BTCUSDT | 1d | 365 | 14 | 42.9% | +0.4286% | 72 | 29.2% | -0.1875% | 0 | N/A | N/A | 86 | 31.4% | -0.0872% |
| ETHUSDT | 1d | 365 | 12 | 50.0% | +0.7500% | 84 | 33.3% | +0.0000% | 0 | N/A | N/A | 96 | 35.4% | +0.0938% |
| SOLUSDT | 1d | 365 | 12 | 41.7% | +0.3750% | 85 | 29.4% | -0.1765% | 2 | 0.0% | -1.5000% | 99 | 30.3% | -0.1364% |
| BTCUSDT | 1w | 104 | 4 | 50.0% | +2.0000% | 27 | 33.3% | +0.0000% | 7 | 28.6% | -0.5714% | 38 | 34.2% | +0.1053% |
| ETHUSDT | 1w | 104 | 4 | 50.0% | +2.0000% | 16 | 25.0% | -1.0000% | 6 | 50.0% | +2.0000% | 26 | 34.6% | +0.1538% |
| SOLUSDT | 1w | 104 | 4 | 0.0% | -4.0000% | 14 | 28.6% | -0.5714% | 20 | 65.0% | +3.8000% | 38 | 44.7% | +1.3684% |

## Regime Breakdown

| Symbol | TF | Sensor | Regime | Signals | WR | Expectancy |
|--------|-----|--------|--------|---------|-----|------------|
| BTCUSDT | 1d | ema-cross-9-21 | trending | 14 | 42.9% | +0.4286% |
| BTCUSDT | 1d | rsi-divergence-14 | trending | 72 | 29.2% | -0.1875% |
| ETHUSDT | 1d | ema-cross-9-21 | trending | 12 | 50.0% | +0.7500% |
| ETHUSDT | 1d | rsi-divergence-14 | trending | 84 | 33.3% | +0.0000% |
| SOLUSDT | 1d | ema-cross-9-21 | trending | 12 | 41.7% | +0.3750% |
| SOLUSDT | 1d | rsi-divergence-14 | trending | 85 | 29.4% | -0.1765% |
| SOLUSDT | 1d | funding-rate-extreme | trending | 2 | 0.0% | -1.5000% |
| BTCUSDT | 1w | ema-cross-9-21 | trending | 4 | 50.0% | +2.0000% |
| BTCUSDT | 1w | rsi-divergence-14 | trending | 27 | 33.3% | +0.0000% |
| BTCUSDT | 1w | funding-rate-extreme | trending | 3 | 66.7% | +4.0000% |
| BTCUSDT | 1w | funding-rate-extreme | ranging | 4 | 0.0% | -4.0000% |
| ETHUSDT | 1w | ema-cross-9-21 | trending | 4 | 50.0% | +2.0000% |
| ETHUSDT | 1w | rsi-divergence-14 | trending | 16 | 25.0% | -1.0000% |
| ETHUSDT | 1w | funding-rate-extreme | trending | 3 | 100.0% | +8.0000% |
| ETHUSDT | 1w | funding-rate-extreme | ranging | 3 | 0.0% | -4.0000% |
| SOLUSDT | 1w | ema-cross-9-21 | trending | 4 | 0.0% | -4.0000% |
| SOLUSDT | 1w | rsi-divergence-14 | trending | 14 | 28.6% | -0.5714% |
| SOLUSDT | 1w | funding-rate-extreme | trending | 9 | 77.8% | +5.3333% |
| SOLUSDT | 1w | funding-rate-extreme | ranging | 11 | 54.5% | +2.5455% |

## Edge Assessment

Sensors with positive expectancy are highlighted. A sensor needs:
- Positive expectancy after fees (~0.1% round trip)
- Sufficient sample size (>30 signals minimum, >50 preferred)
- Consistency across regimes (not just trending OR ranging)

**No sensor showed reliable edge above fee threshold across sufficient sample size.**