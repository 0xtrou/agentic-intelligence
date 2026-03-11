/**
 * @module full-loop.spec
 * @description BTCUSDT full-loop integration tests covering the complete signal pipeline:
 *
 * Sensor evaluation → Brain aggregation → Signal generation → Paper trade execution →
 * TP/SL resolution → Bayesian posterior update
 *
 * Mocked: Bybit REST client (candle data, funding rates, price feeds)
 * Real: EmaCrossSensor, FundingRateSensor, Brain (generateSignal, detectRegime,
 *       applyRegimeGating), PaperTradingEngine, Bayesian posterior updates
 *
 * Test cases:
 * 1. LONG signal → TP hit → WIN → alpha incremented
 * 2. SHORT signal → SL hit → LOSS → beta incremented
 * 3. Conflicting sensors → no signal generated
 * 4. Regime gating blocks EMA cross in RANGING market
 *
 * All tests use BTCUSDT. Traces to validation gates #13 (mispriced risk),
 * #14 (regime context), #15 (edge lifecycle / Bayesian tracking).
 */

import { describe, it, expect } from 'vitest';
import { EmaCrossSensor } from '@agentic-intelligence/sensors';
import { FundingRateSensor } from '@agentic-intelligence/sensors';
import {
  generateSignal,
  applyRegimeGating,
  detectRegime,
  type SensorVoteWithStatus,
  type RegimeGating,
} from '@agentic-intelligence/brain';
import { PaperTradingEngine } from '@agentic-intelligence/paper-trading';
import {
  type Candle,
  type FundingRate,
  type Timeframe,
  SignalDirection,
  SensorStatus,
  MarketRegime,
  TradeOutcome,
} from '@agentic-intelligence/core';

// ---------------------------------------------------------------------------
// Helpers — build mock market data
// ---------------------------------------------------------------------------

const SYMBOL = 'BTCUSDT';
const TIMEFRAME: Timeframe = '4h';
const BASE_TIME = 1_700_000_000_000; // Arbitrary epoch for test stability
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

/**
 * Build a candle array from a sequence of close prices.
 *
 * High/low are derived from close ± spread to keep things simple while
 * still providing valid OHLCV data for ATR / regime detection.
 */
function buildCandles(
  closes: number[],
  opts: { spread?: number; baseVolume?: number } = {},
): Candle[] {
  const spread = opts.spread ?? 50;
  const baseVolume = opts.baseVolume ?? 100;

  return closes.map((close, i) => ({
    symbol: SYMBOL,
    timeframe: TIMEFRAME,
    openTime: BASE_TIME + i * FOUR_HOURS_MS,
    closeTime: BASE_TIME + (i + 1) * FOUR_HOURS_MS,
    open: close - 10,
    high: close + spread,
    low: close - spread,
    close,
    volume: baseVolume + i,
  }));
}

/**
 * Build funding rate snapshots from an array of rates.
 */
function buildFundingRates(rates: number[]): FundingRate[] {
  return rates.map((rate, i) => ({
    symbol: SYMBOL,
    rate,
    nextFundingTime: BASE_TIME + (i + 1) * 8 * 60 * 60 * 1000,
    timestamp: BASE_TIME + i * 8 * 60 * 60 * 1000,
  }));
}

/**
 * Standard regime gating: EMA fires in TRENDING only, funding fires in ALL regimes.
 */
const REGIME_GATING: RegimeGating[] = [
  { sensorId: 'ema-cross-9-21', requiredRegimes: [MarketRegime.TRENDING] },
  { sensorId: 'funding-extreme', requiredRegimes: [] },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BTCUSDT full-loop integration', () => {
  // Shared sensor instances (stateless, safe to reuse)
  const emaSensor = new EmaCrossSensor('ema-cross-9-21', {
    fastPeriod: 9,
    slowPeriod: 21,
  });
  const fundingSensor = new FundingRateSensor('funding-extreme', {
    threshold: 0.0005,
    lookback: 3,
  });

  // -------------------------------------------------------------------------
  // Test 1: LONG signal → TP hit → WIN → posterior alpha incremented
  // -------------------------------------------------------------------------
  it('LONG signal → TP hit → WIN → posterior update', () => {
    // Build candles that produce a bullish EMA cross:
    // 21 candles trending down (slow EMA high), then 2 candles shooting up
    // so fast EMA crosses above slow EMA on the last candle.
    const downtrend = Array.from({ length: 20 }, (_, i) => 100_000 - i * 100);
    // Prices: 100000, 99900, 99800, ... , 98100
    // Now add a sharp uptick so the 9-period EMA crosses above 21-period EMA
    const uptick = [99500, 100500, 101500];
    const closes = [...downtrend, ...uptick];

    // Use wide spread so ATR stays high → TRENDING regime
    const candles = buildCandles(closes, { spread: 1500 });

    // Neutral funding (within threshold band)
    const fundingRates = buildFundingRates([0.0001, 0.0001, 0.0001]);

    // --- Evaluate sensors ---
    const emaVote = emaSensor.evaluate(candles);
    const fundingVote = fundingSensor.evaluate(fundingRates);

    // EMA should fire LONG (bullish cross)
    expect(emaVote.fire).toBe(true);
    expect(emaVote.direction).toBe(SignalDirection.LONG);

    // Funding should NOT fire (neutral)
    expect(fundingVote.fire).toBe(false);

    // --- Build votes for brain ---
    const votes: SensorVoteWithStatus[] = [];
    if (emaVote.fire && emaVote.direction) {
      votes.push({ ...emaVote, status: SensorStatus.ACTIVE });
    }

    // --- Generate signal ---
    const currentPrice = candles[candles.length - 1].close;
    const signal = generateSignal(
      SYMBOL,
      TIMEFRAME,
      currentPrice,
      votes,
      candles,
      undefined,
      undefined,
      REGIME_GATING,
    );

    expect(signal).not.toBeNull();
    expect(signal!.direction).toBe(SignalDirection.LONG);
    expect(signal!.entry).toBe(currentPrice);
    expect(signal!.tp).toBeGreaterThan(currentPrice);
    expect(signal!.sl).toBeLessThan(currentPrice);

    // --- Paper trade ---
    const engine = new PaperTradingEngine({ initialBalance: 10_000 });
    const trade = engine.openTrade(signal!);
    expect(trade).not.toBeNull();
    expect(trade!.direction).toBe(SignalDirection.LONG);

    // Simulate price hitting TP
    const tpPrice = signal!.tp + 1; // Just past TP
    const closedTrades = engine.updatePositions(SYMBOL, tpPrice);

    expect(closedTrades).toHaveLength(1);
    expect(closedTrades[0].outcome).toBe(TradeOutcome.WIN);
    expect(closedTrades[0].pnl).toBeGreaterThan(0);

    // --- Verify posterior update ---
    const posterior = engine.getSensorPosterior('ema-cross-9-21');
    expect(posterior).toBeDefined();
    // Prior is Beta(3,3). After 1 WIN → alpha=4, beta=3
    expect(posterior!.alpha).toBe(4);
    expect(posterior!.beta).toBe(3);
  });

  // -------------------------------------------------------------------------
  // Test 2: SHORT signal → SL hit → LOSS → posterior beta incremented
  // -------------------------------------------------------------------------
  it('SHORT signal → SL hit → LOSS → posterior update', () => {
    // Build candles that produce a bearish EMA cross:
    // 20 candles trending up, then sharp drop so fast EMA crosses below slow.
    const uptrend = Array.from({ length: 20 }, (_, i) => 95_000 + i * 100);
    // Prices: 95000, 95100, ..., 96900
    const downtick = [96000, 95000, 94000];
    const closes = [...uptrend, ...downtick];

    // Wide spread → TRENDING regime
    const candles = buildCandles(closes, { spread: 1500 });

    // Extreme positive funding → shorts crowded? No — extreme positive means
    // longs are crowded, funding sensor fires SHORT (mean-revert).
    // For this test we want funding to ALSO say SHORT to reinforce the bearish EMA.
    // Extreme positive funding (accelerating) → sensor fires SHORT
    const fundingRates = buildFundingRates([0.0006, 0.0008, 0.0010]);

    // --- Evaluate sensors ---
    const emaVote = emaSensor.evaluate(candles);
    const fundingVote = fundingSensor.evaluate(fundingRates);

    // EMA should fire SHORT (bearish cross)
    expect(emaVote.fire).toBe(true);
    expect(emaVote.direction).toBe(SignalDirection.SHORT);

    // Funding should fire SHORT (longs crowded, mean-revert)
    expect(fundingVote.fire).toBe(true);
    expect(fundingVote.direction).toBe(SignalDirection.SHORT);

    // --- Build votes ---
    const votes: SensorVoteWithStatus[] = [];
    if (emaVote.fire && emaVote.direction) {
      votes.push({ ...emaVote, status: SensorStatus.ACTIVE });
    }
    if (fundingVote.fire && fundingVote.direction) {
      votes.push({ ...fundingVote, status: SensorStatus.ACTIVE });
    }

    // --- Generate signal ---
    const currentPrice = candles[candles.length - 1].close;
    const signal = generateSignal(
      SYMBOL,
      TIMEFRAME,
      currentPrice,
      votes,
      candles,
      undefined,
      undefined,
      REGIME_GATING,
    );

    expect(signal).not.toBeNull();
    expect(signal!.direction).toBe(SignalDirection.SHORT);

    // --- Paper trade ---
    const engine = new PaperTradingEngine({ initialBalance: 10_000 });
    const trade = engine.openTrade(signal!);
    expect(trade).not.toBeNull();

    // Simulate price moving against us (up) → hits SL
    const slPrice = signal!.sl + 1; // Just past SL (for SHORT, SL is above entry)
    const closedTrades = engine.updatePositions(SYMBOL, slPrice);

    expect(closedTrades).toHaveLength(1);
    expect(closedTrades[0].outcome).toBe(TradeOutcome.LOSS);
    expect(closedTrades[0].pnl).toBeLessThan(0);

    // --- Verify posterior update ---
    // Both sensors contributed, both should get beta incremented
    const emaPosterior = engine.getSensorPosterior('ema-cross-9-21');
    const fundingPosterior = engine.getSensorPosterior('funding-extreme');

    expect(emaPosterior).toBeDefined();
    expect(fundingPosterior).toBeDefined();

    // Prior Beta(3,3). After 1 LOSS → alpha=3, beta=4
    expect(emaPosterior!.alpha).toBe(3);
    expect(emaPosterior!.beta).toBe(4);
    expect(fundingPosterior!.alpha).toBe(3);
    expect(fundingPosterior!.beta).toBe(4);
  });

  // -------------------------------------------------------------------------
  // Test 3: Conflicting sensors → no signal
  // -------------------------------------------------------------------------
  it('conflicting sensors → no signal generated', () => {
    // Build candles with a bullish EMA cross
    const downtrend = Array.from({ length: 20 }, (_, i) => 100_000 - i * 100);
    const uptick = [99500, 100500, 101500];
    const closes = [...downtrend, ...uptick];
    const candles = buildCandles(closes, { spread: 1500 });

    // Extreme negative funding (accelerating) → funding sensor fires LONG (shorts crowded)
    // Wait — we need CONFLICT: EMA says LONG, funding says SHORT.
    // Extreme positive funding (longs crowded, accelerating) → fires SHORT
    const fundingRates = buildFundingRates([0.0006, 0.0008, 0.0010]);

    const emaVote = emaSensor.evaluate(candles);
    const fundingVote = fundingSensor.evaluate(fundingRates);

    // Verify the conflict setup
    expect(emaVote.fire).toBe(true);
    expect(emaVote.direction).toBe(SignalDirection.LONG);
    expect(fundingVote.fire).toBe(true);
    expect(fundingVote.direction).toBe(SignalDirection.SHORT);

    // Build votes — both fire with opposing directions
    const votes: SensorVoteWithStatus[] = [
      { ...emaVote, status: SensorStatus.ACTIVE },
      { ...fundingVote, status: SensorStatus.ACTIVE },
    ];

    const currentPrice = candles[candles.length - 1].close;
    const signal = generateSignal(
      SYMBOL,
      TIMEFRAME,
      currentPrice,
      votes,
      candles,
      undefined,
      undefined,
      REGIME_GATING,
    );

    // Brain should return null — conflicting LONG vs SHORT votes
    expect(signal).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Test 4: Regime gating blocks EMA cross in RANGING market
  // -------------------------------------------------------------------------
  it('regime gating blocks EMA cross in RANGING market', () => {
    // Build candles with a bullish EMA cross BUT very low volatility (tight spread)
    // so ATR is low → RANGING regime.
    // ATR threshold = price * 0.02 = ~2000 for BTC at ~100k
    // With spread=5, high-low per candle ≈ 10, ATR ≈ 10, well below 2000 → RANGING
    const downtrend = Array.from({ length: 20 }, (_, i) => 100_000 - i * 2);
    // Very small moves: 100000, 99998, 99996, ..., 99962
    // Then uptick large enough for EMA cross but with tight candles
    const uptick = [99980, 100020, 100060];
    const closes = [...downtrend, ...uptick];

    // Tiny spread → low ATR → RANGING
    const candles = buildCandles(closes, { spread: 5 });

    const emaVote = emaSensor.evaluate(candles);

    // EMA should fire LONG
    expect(emaVote.fire).toBe(true);
    expect(emaVote.direction).toBe(SignalDirection.LONG);

    // Build vote
    const votes: SensorVoteWithStatus[] = [
      { ...emaVote, status: SensorStatus.ACTIVE },
    ];

    const currentPrice = candles[candles.length - 1].close;

    // Generate signal WITH regime gating
    const signal = generateSignal(
      SYMBOL,
      TIMEFRAME,
      currentPrice,
      votes,
      candles,
      undefined,
      undefined,
      REGIME_GATING,
    );

    // Signal should be null — EMA is gated to TRENDING only, but market is RANGING
    expect(signal).toBeNull();

    // Verify regime detection directly
    const regime = detectRegime(candles);
    expect(regime).toBe(MarketRegime.RANGING);

    // Verify that applyRegimeGating actually filters the vote out
    const filtered = applyRegimeGating(votes, MarketRegime.RANGING, REGIME_GATING);
    expect(filtered).toHaveLength(0);
  });
});
