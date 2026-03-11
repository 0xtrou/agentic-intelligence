/**
 * @module @agentic-intelligence/backtest
 * @description Independent signal review and backtesting engine.
 *
 * Validates whether sensors actually predict price movement by running
 * them against historical data and measuring TP/SL hit rates.
 */

export * from './types';
export * from './engine';
export * from './regime';
export * from './fetchCandles';
export * from './fetchFunding';
