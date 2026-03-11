/**
 * @module @agentic-intelligence/brain
 * @description Signal aggregation engine for autonomous trading.
 *
 * Consumes sensor votes, aggregates them, and generates trading signals
 * with TP/SL targets and confidence scores.
 */

export {
  generateSignal,
  aggregateSensorVotes,
  applyRegimeGating,
  calculateTP,
  calculateSL,
  calculateConfidence,
  calculateATR,
  calculateTrueRange,
  detectRegime,
  DEFAULT_BRAIN_CONFIG,
  DEFAULT_REGIME_CONFIG,
  type BrainConfig,
  type RegimeConfig,
  type RegimeGating,
  type SensorVoteWithStatus,
  type AggregationResult,
} from './brain.js';
