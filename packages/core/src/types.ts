/**
 * @module types
 * @description Core domain models for the trading intelligence system.
 *
 * Defines immutable types for:
 * - Market data (Candle, Ticker, FundingRate, OpenInterest)
 * - Sensor evaluation (SensorVote, SensorStatus)
 * - Signal generation (Signal, SignalDirection)
 * - Trade execution (Trade, TradeStatus, TradeOutcome)
 * - Bayesian lifecycle (BayesianPosterior)
 */

// ========== Market Data ==========

/**
 * OHLCV candle data.
 */
export interface Candle {
  symbol: string;
  timeframe: Timeframe;
  openTime: number;       // Unix timestamp (ms)
  closeTime: number;      // Unix timestamp (ms)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Real-time ticker snapshot.
 */
export interface Ticker {
  symbol: string;
  lastPrice: number;
  bid: number;
  ask: number;
  volume24h: number;
  timestamp: number;
}

/**
 * Funding rate for perpetual futures.
 */
export interface FundingRate {
  symbol: string;
  rate: number;            // e.g., 0.0001 = 0.01%
  nextFundingTime: number; // Unix timestamp (ms)
  timestamp: number;
}

/**
 * Open interest data.
 */
export interface OpenInterest {
  symbol: string;
  value: number;           // USD value
  timestamp: number;
}

export type Timeframe = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '6h' | '12h' | '1d' | '1w';

// ========== Sensors ==========

/**
 * A sensor vote represents a hypothesis about the market.
 */
export interface SensorVote {
  sensorId: string;
  symbol: string;
  timeframe: Timeframe;
  fire: boolean;              // Does the sensor's condition trigger?
  direction?: SignalDirection; // If fire=true, which way?
  confidence?: number;         // Sensor's internal confidence (0-1), optional
  data?: Record<string, any>;  // Debug data (e.g., EMA values, volume ratio)
  timestamp: number;
}

/**
 * Sensor lifecycle status.
 */
export enum SensorStatus {
  PROBATION = 'PROBATION',   // n < 10: learning, no weight in decisions
  ACTIVE = 'ACTIVE',         // n ≥ 10, proven edge, contributes to signals
  TRUSTED = 'TRUSTED',       // n ≥ 30, sustained edge, full weight
  KILLED = 'KILLED',         // no edge or stale (no signal in 60 days)
}



// ========== Signals ==========

export enum SignalDirection {
  LONG = 'LONG',
  SHORT = 'SHORT',
}

/**
 * A trading signal produced by the brain.
 */
export interface Signal {
  id: string;
  symbol: string;
  direction: SignalDirection;
  entry: number;
  tp: number;               // Take profit
  sl: number;               // Stop loss
  timeframe: Timeframe;
  confidence: number;       // Aggregated Bayesian confidence (0-1)
  sensorVotes: SensorVote[];
  regime: MarketRegime;
  timestamp: number;
}

export enum MarketRegime {
  TRENDING = 'TRENDING',
  RANGING = 'RANGING',
  UNKNOWN = 'UNKNOWN',
}



// ========== Trades ==========

export enum TradeStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

export enum TradeOutcome {
  WIN = 'WIN',
  LOSS = 'LOSS',
  BREAKEVEN = 'BREAKEVEN',
}

/**
 * Paper trade record.
 */
export interface Trade {
  id: string;
  signalId: string;
  symbol: string;
  direction: SignalDirection;
  entry: number;
  tp: number;
  sl: number;
  size: number;             // Position size (USD)
  status: TradeStatus;
  outcome?: TradeOutcome;
  exitPrice?: number;
  pnl?: number;             // Profit/loss in USD
  pnlPercent?: number;      // P&L as % of entry
  entryTime: number;
  exitTime?: number;
  sensorVotes: string[];    // sensorIds that contributed to this trade
}

// ========== Bayesian Math ==========

/**
 * Beta distribution posterior parameters.
 */
export interface BayesianPosterior {
  alpha: number;  // Successes
  beta: number;   // Failures
}

/**
 * Credible interval for a proportion.
 */
export interface CredibleInterval {
  lower: number;
  upper: number;
  mean: number;
}
