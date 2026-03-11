/**
 * @module RsiDivergenceSensor
 * @description Detects RSI divergence as a reversal signal.
 *
 * **Thesis (#13 - Mispriced Risk):**
 * - **Risk:** Momentum continuation (trend keeps going)
 * - **Market's price:** Still pricing directional move (price making new high/low)
 * - **Why wrong:** Momentum is weakening (RSI not confirming = exhaustion)
 * - **Validation:** Hit rate on reversals within 8-12 bars (32-48h on 4h timeframe)
 *
 * **Regime Context (#14):**
 * - **Layer:** Meso (position exhaustion, not order flow)
 * - **Regime dependency:** TRENDING only (divergence meaningless in RANGING)
 * - **Signal meaning:** In trending regime, divergence = "trend overextended, reversal probable"
 *
 * **Edge Lifecycle (#15):**
 * - **Edge source:** Behavioral (retail chases breakouts after smart money exits)
 * - **Decay mechanism:** Becomes well-known, gets arbitraged by faster players
 * - **Kill conditions:**
 *   - Early kill at n=10: Hit rate < 40% → pause and review
 *   - Full kill at n=30: Hit rate < 55% OR Sharpe < 0.5
 *
 * **Constraints (#16):**
 * - **Data:** RSI from Bybit 4h candles (already available)
 * - **Fees:** Same as EMA (4h timeframe, can wait for good entry)
 * - **Scale:** Feasible at $50-100 (meso-layer positioning signal)
 * - **Frequency:** ~2-5 signals/week (medium frequency for evaluation)
 *
 * This sensor fires:
 *   - fire=true, direction=SHORT on bearish divergence (price new high, RSI doesn't)
 *   - fire=true, direction=LONG on bullish divergence (price new low, RSI doesn't)
 *   - fire=false when no divergence detected
 */

import type { Candle, SensorVote, SignalDirection, Timeframe } from '@agentic-intelligence/core';
import type { CandleSensor } from './Sensor';
import { calculateRsi, detectBearishDivergence, detectBullishDivergence } from './rsi';

/**
 * Configuration for RsiDivergenceSensor.
 */
export interface RsiDivergenceConfig {
  /** RSI period (default 14) */
  rsiPeriod?: number;
  /** How many bars to look back for divergence detection (default 10) */
  lookbackBars?: number;
}

/**
 * RSI divergence sensor implementation.
 *
 * Detects when price makes a new high/low but RSI doesn't confirm,
 * signaling potential momentum exhaustion and trend reversal.
 *
 * **TRENDING regime only** — divergence in ranging markets is noise.
 */
export class RsiDivergenceSensor implements CandleSensor {
  public readonly id: string;
  private readonly rsiPeriod: number;
  private readonly lookbackBars: number;

  /**
   * Create a new RsiDivergenceSensor.
   *
   * @param id - Unique identifier for this sensor instance
   * @param config - RSI configuration
   */
  constructor(id: string, config: RsiDivergenceConfig = {}) {
    this.id = id;
    this.rsiPeriod = config.rsiPeriod ?? 14;
    this.lookbackBars = config.lookbackBars ?? 10;

    if (this.rsiPeriod < 1) {
      throw new Error('RSI period must be >= 1');
    }
    if (this.lookbackBars < 3) {
      throw new Error('Lookback bars must be >= 3');
    }
  }

  /**
   * Evaluate candles and detect RSI divergence.
   *
   * Requires at least (rsiPeriod + lookbackBars + 1) candles to detect divergence.
   *
   * @param candles - Array of OHLCV candles, ordered oldest to newest
   * @returns SensorVote with divergence detection result
   */
  evaluate(candles: Candle[]): SensorVote {
    // Validate input
    if (candles.length === 0) {
      return this.createVote(candles, false);
    }

    // Extract metadata from the most recent candle
    const latestCandle = candles[candles.length - 1];
    const symbol = latestCandle.symbol;
    const timeframe = latestCandle.timeframe;
    const timestamp = latestCandle.closeTime;

    // Need enough data to calculate RSI and detect divergence
    const minCandles = this.rsiPeriod + this.lookbackBars + 1;
    if (candles.length < minCandles) {
      return this.createVote(candles, false, symbol, timeframe, timestamp);
    }

    // Calculate RSI
    const rsiValues = calculateRsi(candles, this.rsiPeriod);
    const currentRsi = rsiValues[rsiValues.length - 1];

    // Detect divergence
    const bearishDivergence = detectBearishDivergence(candles, rsiValues, this.lookbackBars);
    const bullishDivergence = detectBullishDivergence(candles, rsiValues, this.lookbackBars);

    // No divergence detected
    if (!bearishDivergence && !bullishDivergence) {
      return {
        sensorId: this.id,
        symbol,
        timeframe,
        fire: false,
        timestamp,
        data: {
          rsi: currentRsi,
          rsi_period: this.rsiPeriod,
          lookback_bars: this.lookbackBars,
        },
      };
    }

    // Divergence detected
    let direction: SignalDirection;
    let divergenceType: string;

    if (bearishDivergence) {
      direction = 'SHORT'; // Price making new highs, RSI declining → expect reversal down
      divergenceType = 'bearish';
    } else {
      direction = 'LONG'; // Price making new lows, RSI rising → expect reversal up
      divergenceType = 'bullish';
    }

    return {
      sensorId: this.id,
      symbol,
      timeframe,
      fire: true,
      direction,
      timestamp,
      data: {
        rsi: currentRsi,
        rsi_period: this.rsiPeriod,
        lookback_bars: this.lookbackBars,
        divergence_type: divergenceType,
        price: latestCandle.close,
      },
    };
  }

  /**
   * Create a default vote (helper for early returns).
   */
  private createVote(
    candles: Candle[],
    fire: boolean,
    symbol = 'UNKNOWN',
    timeframe = '1h' as Timeframe,
    timestamp = Date.now()
  ): SensorVote {
    return {
      sensorId: this.id,
      symbol,
      timeframe,
      fire,
      timestamp,
      data: {
        rsi_period: this.rsiPeriod,
        lookback_bars: this.lookbackBars,
        candle_count: candles.length,
      },
    };
  }
}
