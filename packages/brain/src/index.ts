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
  calculateTP,
  calculateSL,
  calculateConfidence,
  detectRegime,
  DEFAULT_BRAIN_CONFIG,
  type BrainConfig,
  type SensorVoteWithStatus,
  type AggregationResult,
} from './brain.js';
