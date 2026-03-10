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
 * Detect market regime (stub for MVP).
 *
 * Always returns UNKNOWN. Full regime detection (volatility, trend strength,
 * volume profile) deferred to M3.
 *
 * @param _symbol - Trading symbol (unused in MVP)
 * @returns Always UNKNOWN
 */
export function detectRegime(_symbol: string): MarketRegime {
  return MarketRegime.UNKNOWN;
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
 * @param symbol - Trading symbol
 * @param timeframe - Signal timeframe
 * @param currentPrice - Current market price (used as entry)
 * @param votes - Sensor votes with status metadata
 * @param config - Brain configuration (TP/SL percentages, min sensor status)
 * @returns Signal if direction determined, null otherwise
 */
export function generateSignal(
  symbol: string,
  timeframe: Timeframe,
  currentPrice: number,
  votes: SensorVoteWithStatus[],
  config: BrainConfig = DEFAULT_BRAIN_CONFIG
): Signal | null {
  // Aggregate votes
  const aggregation = aggregateSensorVotes(votes, config.minSensorStatus);

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

  // Detect regime
  const regime = detectRegime(symbol);

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
