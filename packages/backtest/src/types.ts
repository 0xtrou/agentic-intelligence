/**
 * @module backtest/types
 * @description Types for the backtesting engine.
 */

import type { SignalDirection } from '@agentic-intelligence/core';

/** Regime classification */
export type Regime = 'trending' | 'ranging';

/** A single backtest trade result */
export interface BacktestTrade {
  sensorId: string;
  direction: SignalDirection;
  entryTime: number;
  entryPrice: number;
  exitPrice: number;
  exitTime: number;
  outcome: 'win' | 'loss';
  pnlPercent: number;
  regime: Regime;
  candlesHeld: number;
}

/** Per-sensor statistics */
export interface SensorStats {
  sensorId: string;
  totalSignals: number;
  wins: number;
  losses: number;
  winRate: number;
  avgWinPercent: number;
  avgLossPercent: number;
  expectancy: number;
  trades: BacktestTrade[];
}

/** Regime breakdown for a sensor */
export interface RegimeBreakdown {
  regime: Regime;
  totalSignals: number;
  wins: number;
  losses: number;
  winRate: number;
  expectancy: number;
}

/** Per-sensor report entry */
export interface SensorReport {
  sensorId: string;
  stats: SensorStats;
  regimeBreakdown: RegimeBreakdown[];
}

/** Full backtest report */
export interface BacktestReport {
  metadata: {
    symbol: string;
    timeframe: string;
    periodDays: number;
    startTime: number;
    endTime: number;
    totalCandles: number;
    tpPercent: number;
    slPercent: number;
    maxHoldCandles: number;
    regimeThreshold: number;
    generatedAt: string;
  };
  sensors: SensorReport[];
  portfolio: {
    totalSignals: number;
    totalWins: number;
    totalLosses: number;
    overallWinRate: number;
    overallExpectancy: number;
  };
}
