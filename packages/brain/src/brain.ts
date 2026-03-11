/**
 * @module brain
 * @description Signal aggregation engine for the trading intelligence system.
 *
 * The brain consumes sensor votes and produces trading signals.
 *
 * MVP logic:
 *   - If ANY active sensor votes LONG → generate LONG signal
 *   - If ANY active sensor votes SHORT → generate SHORT signal
 *   - If conflicting votes (both LONG and SHORT) → no signal
 *   - If no active votes → no signal
 *
 * TP/SL: Fixed percentage (default: TP +1.5%, SL -1%)
 * Regime: Stubbed (always UNKNOWN) — full implementation deferred to M3
 */

// Enums must be regular imports (used as runtime values)
import {
  SignalDirection,
  SensorStatus,
  MarketRegime,
} from '@agentic-intelligence/core';

// Interfaces can be type-only imports
import type {
  Signal,
  SensorVote,
  Timeframe,
} from '@agentic-intelligence/core';

import { randomUUID } from 'crypto';

/**
 * Configuration for signal generation.
 */
export interface BrainConfig {
  /** Take-profit percentage (e.g., 0.015 = 1.5%) */
  tpPercent: number;
  /** Stop-loss percentage (e.g., 0.01 = 1%) */
  slPercent: number;
  /** Minimum sensor status to contribute (default: ACTIVE) */
  minSensorStatus?: SensorStatus;
}

/**
 * Default brain configuration.
 */
export const DEFAULT_BRAIN_CONFIG: BrainConfig = {
  tpPercent: 0.015,  // 1.5%
  slPercent: 0.01,   // 1%
  minSensorStatus: SensorStatus.ACTIVE,
};

/**
 * Sensor vote with status metadata.
 */
export interface SensorVoteWithStatus extends SensorVote {
  status: SensorStatus;
}

/**
 * Result of sensor aggregation.
 */
export interface AggregationResult {
  direction: SignalDirection | null;
  activeLongVotes: SensorVoteWithStatus[];
  activeShortVotes: SensorVoteWithStatus[];
  conflicting: boolean;
}

/**
 * Regime requirements for sensor votes.
 *
 * Allows sensors to specify which market regimes they work in.
 * If a sensor has regime requirements and the current regime doesn't match,
 * the vote is filtered out.
 */
export interface RegimeGating {
  /** Sensor ID */
  sensorId: string;
  /** Required regimes for this sensor to fire (empty = no gating) */
  requiredRegimes: MarketRegime[];
}

/**
 * Apply regime gating to sensor votes.
 *
 * Filters out votes from sensors whose regime requirements don't match
 * the current market regime.
 *
 * Example: EMA cross sensor only fires in TRENDING regime.
 * If regime is RANGING, the EMA cross vote is filtered out.
 *
 * @param votes - Sensor votes with status metadata
 * @param regime - Current market regime
 * @param regimeGating - Regime requirements for each sensor
 * @returns Filtered votes that pass regime gating
 */
export function applyRegimeGating(
  votes: SensorVoteWithStatus[],
  regime: MarketRegime,
  regimeGating: RegimeGating[] = []
): SensorVoteWithStatus[] {
  // If regime is UNKNOWN, skip gating (allow all votes)
  if (regime === MarketRegime.UNKNOWN) {
    return votes;
  }

  return votes.filter((vote) => {
    const gating = regimeGating.find((g) => g.sensorId === vote.sensorId);

    // If sensor has no regime requirements, always allow
    if (!gating || gating.requiredRegimes.length === 0) {
      return true;
    }

    // Check if current regime matches any required regime
    return gating.requiredRegimes.includes(regime);
  });
}

/**
 * Aggregate sensor votes into a directional signal.
 *
 * Logic:
 *   1. Filter votes by sensor status (must be >= minSensorStatus)
 *   2. Separate LONG vs SHORT votes
 *   3. If both LONG and SHORT votes exist → conflicting, no signal
 *   4. If only LONG votes → LONG signal
 *   5. If only SHORT votes → SHORT signal
 *   6. If no votes → no signal
 *
 * @param votes - Sensor votes with status metadata
 * @param minStatus - Minimum sensor status to contribute (default: ACTIVE)
 * @returns Aggregation result with direction and contributing votes
 */
export function aggregateSensorVotes(
  votes: SensorVoteWithStatus[],
  minStatus: SensorStatus = SensorStatus.ACTIVE
): AggregationResult {
  // Filter for active sensors that fired
  const activeVotes = votes.filter(
    (v) => v.fire && isStatusEligible(v.status, minStatus)
  );

  // Separate by direction
  const longVotes = activeVotes.filter((v) => v.direction === SignalDirection.LONG);
  const shortVotes = activeVotes.filter((v) => v.direction === SignalDirection.SHORT);

  // Check for conflict
  const conflicting = longVotes.length > 0 && shortVotes.length > 0;

  // Determine direction
  let direction: SignalDirection | null = null;
  if (!conflicting) {
    if (longVotes.length > 0) {
      direction = SignalDirection.LONG;
    } else if (shortVotes.length > 0) {
      direction = SignalDirection.SHORT;
    }
  }

  return {
    direction,
    activeLongVotes: longVotes,
    activeShortVotes: shortVotes,
    conflicting,
  };
}

/**
 * Check if a sensor status meets the minimum threshold.
 *
 * Status hierarchy: PROBATION < ACTIVE < TRUSTED
 * KILLED sensors never contribute.
 *
 * @param status - Sensor status
 * @param minStatus - Minimum required status
 * @returns True if status is eligible
 */
function isStatusEligible(status: SensorStatus, minStatus: SensorStatus): boolean {
  if (status === SensorStatus.KILLED) {
    return false;
  }

  const statusRank: Record<SensorStatus, number> = {
    [SensorStatus.PROBATION]: 0,
    [SensorStatus.ACTIVE]: 1,
    [SensorStatus.TRUSTED]: 2,
    [SensorStatus.KILLED]: -1,
  };

  return statusRank[status] >= statusRank[minStatus];
}

/**
 * Calculate take-profit price.
 *
 * @param entry - Entry price
 * @param direction - Trade direction
 * @param tpPercent - Take-profit percentage (e.g., 0.015 = 1.5%)
 * @returns Take-profit price
 */
export function calculateTP(
  entry: number,
  direction: SignalDirection,
  tpPercent: number
): number {
  if (direction === SignalDirection.LONG) {
    return entry * (1 + tpPercent);
  } else {
    return entry * (1 - tpPercent);
  }
}

/**
 * Calculate stop-loss price.
 *
 * @param entry - Entry price
 * @param direction - Trade direction
 * @param slPercent - Stop-loss percentage (e.g., 0.01 = 1%)
 * @returns Stop-loss price
 */
export function calculateSL(
  entry: number,
  direction: SignalDirection,
  slPercent: number
): number {
  if (direction === SignalDirection.LONG) {
    return entry * (1 - slPercent);
  } else {
    return entry * (1 + slPercent);
  }
}

/**
 * Configuration for regime detection.
 */
export interface RegimeConfig {
  /** ATR period (default: 14) */
  atrPeriod: number;
  /** ATR threshold multiplier (default: 0.02 = 2% of price) */
  atrThreshold: number;
}

/**
 * Default regime detection configuration.
 */
export const DEFAULT_REGIME_CONFIG: RegimeConfig = {
  atrPeriod: 14,
  atrThreshold: 0.02, // 2% of current price
};

/**
 * Calculate True Range for a single candle.
 *
 * True Range = max(high - low, |high - prevClose|, |low - prevClose|)
 *
 * For the first candle (no previous close), TR = high - low.
 *
 * @param candle - Current candle
 * @param prevClose - Previous candle close (optional for first candle)
 * @returns True range value
 */
export function calculateTrueRange(candle: { high: number; low: number; close: number }, prevClose?: number): number {
  const highLow = candle.high - candle.low;

  if (prevClose === undefined) {
    return highLow;
  }

  const highPrevClose = Math.abs(candle.high - prevClose);
  const lowPrevClose = Math.abs(candle.low - prevClose);

  return Math.max(highLow, highPrevClose, lowPrevClose);
}

/**
 * Calculate Average True Range (ATR) from candle data.
 *
 * ATR is a smoothed moving average of True Range values.
 * First ATR = average of first N true ranges.
 * Subsequent ATR = ((prior ATR * (period - 1)) + current TR) / period
 *
 * @param candles - Array of candles, ordered oldest to newest (minimum: atrPeriod candles)
 * @param period - ATR period (default: 14)
 * @returns ATR value, or null if insufficient data
 */
export function calculateATR(
  candles: Array<{ high: number; low: number; close: number }>,
  period: number = 14
): number | null {
  if (candles.length < period) {
    return null;
  }

  // Calculate true ranges
  const trueRanges: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const prevClose = i > 0 ? candles[i - 1].close : undefined;
    trueRanges.push(calculateTrueRange(candles[i], prevClose));
  }

  // Calculate initial ATR (simple average of first N true ranges)
  let atr = trueRanges.slice(0, period).reduce((sum, tr) => sum + tr, 0) / period;

  // Apply smoothing for remaining candles
  for (let i = period; i < trueRanges.length; i++) {
    atr = ((atr * (period - 1)) + trueRanges[i]) / period;
  }

  return atr;
}

/**
 * Detect market regime using ATR-based volatility classification.
 *
 * Classification logic:
 *   - TRENDING: ATR > threshold (high volatility, directional movement)
 *   - RANGING: ATR ≤ threshold (low volatility, choppy, mean-reverting)
 *   - UNKNOWN: Insufficient data to calculate ATR
 *
 * The threshold is calculated as: currentPrice * config.atrThreshold
 * Default threshold = 2% of current price.
 *
 * @param candles - Recent candle data (minimum: config.atrPeriod candles)
 * @param config - Regime detection configuration
 * @returns Market regime classification
 */
export function detectRegime(
  candles: Array<{ high: number; low: number; close: number }>,
  config: RegimeConfig = DEFAULT_REGIME_CONFIG
): MarketRegime {
  const atr = calculateATR(candles, config.atrPeriod);

  if (atr === null) {
    return MarketRegime.UNKNOWN;
  }

  // Current price = most recent candle close
  const currentPrice = candles[candles.length - 1].close;
  const threshold = currentPrice * config.atrThreshold;

  return atr > threshold ? MarketRegime.TRENDING : MarketRegime.RANGING;
}

/**
 * Calculate aggregated confidence from sensor votes.
 *
 * MVP: Simple average of sensor-provided confidence values.
 * If sensors don't provide confidence, default to 0.5.
 *
 * Future: Bayesian-weighted confidence using sensor track records.
 *
 * @param votes - Contributing sensor votes
 * @returns Confidence score (0-1)
 */
export function calculateConfidence(votes: SensorVoteWithStatus[]): number {
  if (votes.length === 0) {
    return 0;
  }

  const confidenceSum = votes.reduce((sum, vote) => {
    return sum + (vote.confidence ?? 0.5);
  }, 0);

  return confidenceSum / votes.length;
}

/**
 * Generate a trading signal from sensor votes.
 *
 * Main entry point for the brain. Takes sensor votes, aggregates them,
 * and produces a Signal if conditions are met.
 *
 * Regime gating: If candles are provided, regime is detected and sensors
 * can be filtered based on their regime requirements (e.g., EMA cross only
 * fires in TRENDING regime).
 *
 * @param symbol - Trading symbol
 * @param timeframe - Signal timeframe
 * @param currentPrice - Current market price (used as entry)
 * @param votes - Sensor votes with status metadata
 * @param candles - Recent candle data for regime detection (optional)
 * @param config - Brain configuration (TP/SL percentages, min sensor status)
 * @param regimeConfig - Regime detection configuration (optional)
 * @param regimeGating - Regime requirements for each sensor (optional)
 * @returns Signal if direction determined, null otherwise
 */
export function generateSignal(
  symbol: string,
  timeframe: Timeframe,
  currentPrice: number,
  votes: SensorVoteWithStatus[],
  candles?: Array<{ high: number; low: number; close: number }>,
  config: BrainConfig = DEFAULT_BRAIN_CONFIG,
  regimeConfig?: RegimeConfig,
  regimeGating?: RegimeGating[]
): Signal | null {
  // Detect regime
  const regime = candles && candles.length > 0 ? detectRegime(candles, regimeConfig) : MarketRegime.UNKNOWN;

  // Apply regime gating if configured
  const filteredVotes = regimeGating
    ? applyRegimeGating(votes, regime, regimeGating)
    : votes;

  // Aggregate votes
  const aggregation = aggregateSensorVotes(filteredVotes, config.minSensorStatus);

  if (aggregation.direction === null) {
    // No signal: either conflicting votes or no active votes
    return null;
  }

  // Determine contributing votes
  const contributingVotes =
    aggregation.direction === SignalDirection.LONG
      ? aggregation.activeLongVotes
      : aggregation.activeShortVotes;

  // Calculate TP/SL
  const tp = calculateTP(currentPrice, aggregation.direction, config.tpPercent);
  const sl = calculateSL(currentPrice, aggregation.direction, config.slPercent);

  // Calculate confidence
  const confidence = calculateConfidence(contributingVotes);

  // Generate signal
  const signal: Signal = {
    id: randomUUID(),
    symbol,
    direction: aggregation.direction,
    entry: currentPrice,
    tp,
    sl,
    timeframe,
    confidence,
    sensorVotes: contributingVotes,
    regime,
    timestamp: Date.now(),
  };

  return signal;
}
