/**
 * @module paper-trading-engine
 * @description Virtual trading engine for simulating trades without real capital.
 *
 * This engine:
 * - Tracks virtual positions with entry, current price, unrealized P&L
 * - Monitors TP (take profit) and SL (stop loss) thresholds
 * - Auto-closes positions when TP or SL hit
 * - Records outcomes (WIN/LOSS/BREAKEVEN)
 * - Feeds outcomes to Bayesian sensor lifecycle for posterior updates
 *
 * Position sizing: configurable % of virtual balance (default $10,000)
 * Max concurrent positions: enforced limit to prevent over-exposure
 */

import {
  Signal,
  SignalDirection,
  Trade,
  TradeStatus,
  TradeOutcome,
  BayesianPosterior,
} from '@agentic-intelligence/core';
import { updatePosterior } from '@agentic-intelligence/core';

/**
 * Configuration for the paper trading engine.
 */
export interface PaperTradingConfig {
  /** Initial virtual balance in USD */
  initialBalance: number;
  /** Position size as % of balance (0-100) */
  positionSizePercent: number;
  /** Maximum number of concurrent open positions */
  maxConcurrentPositions: number;
}

/**
 * Paper trading engine state.
 */
export interface PaperTradingState {
  balance: number;
  trades: Trade[];
  sensorPosteriors: Map<string, BayesianPosterior>;
}

/**
 * Default configuration.
 */
export const DEFAULT_CONFIG: PaperTradingConfig = {
  initialBalance: 10000,
  positionSizePercent: 1, // 1% per trade
  maxConcurrentPositions: 3,
};

/**
 * Paper trading engine.
 *
 * Simulates trades, tracks positions, and updates sensor Bayesian posteriors
 * based on realized outcomes.
 */
export class PaperTradingEngine {
  private config: PaperTradingConfig;
  private state: PaperTradingState;

  constructor(config: Partial<PaperTradingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      balance: this.config.initialBalance,
      trades: [],
      sensorPosteriors: new Map(),
    };
  }

  /**
   * Get current virtual balance.
   */
  getBalance(): number {
    return this.state.balance;
  }

  /**
   * Get all trades.
   */
  getTrades(): Trade[] {
    return this.state.trades;
  }

  /**
   * Get open trades only.
   */
  getOpenTrades(): Trade[] {
    return this.state.trades.filter((t) => t.status === TradeStatus.OPEN);
  }

  /**
   * Get sensor Bayesian posterior.
   *
   * @param sensorId - Sensor identifier
   * @returns Beta(alpha, beta) posterior, or undefined if sensor not tracked yet
   */
  getSensorPosterior(sensorId: string): BayesianPosterior | undefined {
    return this.state.sensorPosteriors.get(sensorId);
  }

  /**
   * Get all sensor posteriors.
   */
  getAllSensorPosteriors(): Map<string, BayesianPosterior> {
    return new Map(this.state.sensorPosteriors);
  }

  /**
   * Open a new paper trade from a signal.
   *
   * Validates:
   * - Max concurrent positions not exceeded
   * - Sufficient balance for position size
   *
   * @param signal - Trading signal from brain
   * @returns Trade record if opened, null if rejected
   */
  openTrade(signal: Signal): Trade | null {
    // Check concurrent position limit
    const openPositions = this.getOpenTrades();
    if (openPositions.length >= this.config.maxConcurrentPositions) {
      return null;
    }

    // Calculate position size
    const positionSize = this.state.balance * (this.config.positionSizePercent / 100);

    // Check if enough balance
    if (positionSize > this.state.balance) {
      return null;
    }

    // Create trade record
    const trade: Trade = {
      id: `trade_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      signalId: signal.id,
      symbol: signal.symbol,
      direction: signal.direction,
      entry: signal.entry,
      tp: signal.tp,
      sl: signal.sl,
      size: positionSize,
      status: TradeStatus.OPEN,
      entryTime: Date.now(),
      sensorVotes: signal.sensorVotes.map((v) => v.sensorId),
    };

    this.state.trades.push(trade);
    return trade;
  }

  /**
   * Update open positions with current market price.
   *
   * Checks TP/SL conditions and auto-closes positions that hit.
   * Updates unrealized P&L for still-open positions.
   *
   * @param symbol - Symbol to update (e.g., "BTCUSDT")
   * @param currentPrice - Current market price
   * @returns Array of trades that were closed during this update
   */
  updatePositions(symbol: string, currentPrice: number): Trade[] {
    const closedTrades: Trade[] = [];

    for (const trade of this.getOpenTrades()) {
      if (trade.symbol !== symbol) continue;

      // Check if TP or SL hit
      const shouldClose = this.shouldCloseTrade(trade, currentPrice);

      if (shouldClose) {
        const closedTrade = this.closeTrade(trade.id, currentPrice);
        if (closedTrade) {
          closedTrades.push(closedTrade);
        }
      }
    }

    return closedTrades;
  }

  /**
   * Determine if a trade should be closed based on TP/SL.
   *
   * LONG: close if price >= TP or price <= SL
   * SHORT: close if price <= TP or price >= SL
   *
   * @param trade - Trade to check
   * @param currentPrice - Current market price
   * @returns True if trade should close
   */
  private shouldCloseTrade(trade: Trade, currentPrice: number): boolean {
    if (trade.direction === SignalDirection.LONG) {
      return currentPrice >= trade.tp || currentPrice <= trade.sl;
    } else {
      // SHORT
      return currentPrice <= trade.tp || currentPrice >= trade.sl;
    }
  }

  /**
   * Close a trade manually or via TP/SL.
   *
   * Calculates P&L, determines outcome (WIN/LOSS/BREAKEVEN),
   * updates balance, and updates Bayesian posteriors for all
   * sensors that contributed to this trade.
   *
   * @param tradeId - Trade ID to close
   * @param exitPrice - Exit price (default: TP or SL from trade record)
   * @returns Closed trade record, or null if trade not found
   */
  closeTrade(tradeId: string, exitPrice?: number): Trade | null {
    const trade = this.state.trades.find((t) => t.id === tradeId);
    if (!trade || trade.status === TradeStatus.CLOSED) {
      return null;
    }

    // Use provided exit price or infer from TP/SL
    const finalExitPrice = exitPrice ?? this.inferExitPrice(trade);

    // Calculate P&L
    const pnl = this.calculatePnL(trade, finalExitPrice);
    const pnlPercent = (pnl / trade.size) * 100;

    // Determine outcome
    const outcome = this.determineOutcome(pnl);

    // Update trade record
    trade.status = TradeStatus.CLOSED;
    trade.exitPrice = finalExitPrice;
    trade.exitTime = Date.now();
    trade.pnl = pnl;
    trade.pnlPercent = pnlPercent;
    trade.outcome = outcome;

    // Update balance
    this.state.balance += pnl;

    // Update Bayesian posteriors for all contributing sensors
    this.updateSensorPosteriors(trade);

    return trade;
  }

  /**
   * Infer exit price from trade TP/SL if not provided.
   *
   * This is a fallback — normally updatePositions provides exact exit price.
   */
  private inferExitPrice(trade: Trade): number {
    // Default to entry if we can't infer (should not happen)
    return trade.entry;
  }

  /**
   * Calculate profit/loss for a trade.
   *
   * LONG: (exitPrice - entryPrice) * sizeInContracts
   * SHORT: (entryPrice - exitPrice) * sizeInContracts
   *
   * Assuming 1:1 leverage, sizeInContracts ≈ size / entryPrice
   *
   * @param trade - Trade record
   * @param exitPrice - Exit price
   * @returns P&L in USD
   */
  private calculatePnL(trade: Trade, exitPrice: number): number {
    const contracts = trade.size / trade.entry;

    if (trade.direction === SignalDirection.LONG) {
      return (exitPrice - trade.entry) * contracts;
    } else {
      // SHORT
      return (trade.entry - exitPrice) * contracts;
    }
  }

  /**
   * Determine trade outcome based on P&L.
   *
   * WIN: P&L > 0.1% of position size (to account for fees)
   * LOSS: P&L < -0.1% of position size
   * BREAKEVEN: otherwise
   *
   * @param pnl - Profit/loss in USD
   * @returns Trade outcome
   */
  private determineOutcome(pnl: number): TradeOutcome {
    const threshold = 0.001; // 0.1% — account for slippage/fees

    if (pnl > threshold) {
      return TradeOutcome.WIN;
    } else if (pnl < -threshold) {
      return TradeOutcome.LOSS;
    } else {
      return TradeOutcome.BREAKEVEN;
    }
  }

  /**
   * Update Bayesian posteriors for all sensors that contributed to a trade.
   *
   * WIN → alpha += 1 for each sensor
   * LOSS → beta += 1 for each sensor
   * BREAKEVEN → no update
   *
   * @param trade - Closed trade with outcome
   */
  private updateSensorPosteriors(trade: Trade): void {
    if (!trade.outcome || trade.outcome === TradeOutcome.BREAKEVEN) {
      return;
    }

    const isWin = trade.outcome === TradeOutcome.WIN;

    for (const sensorId of trade.sensorVotes) {
      const currentPosterior = this.state.sensorPosteriors.get(sensorId) || {
        alpha: 3, // Beta(3,3) prior
        beta: 3,
      };

      const updatedPosterior = updatePosterior(currentPosterior, isWin);
      this.state.sensorPosteriors.set(sensorId, updatedPosterior);
    }
  }

  /**
   * Get unrealized P&L for an open trade.
   *
   * @param tradeId - Trade ID
   * @param currentPrice - Current market price
   * @returns Unrealized P&L in USD, or null if trade not found/closed
   */
  getUnrealizedPnL(tradeId: string, currentPrice: number): number | null {
    const trade = this.state.trades.find((t) => t.id === tradeId);
    if (!trade || trade.status === TradeStatus.CLOSED) {
      return null;
    }

    return this.calculatePnL(trade, currentPrice);
  }

  /**
   * Get total unrealized P&L across all open positions for a symbol.
   *
   * @param symbol - Symbol to calculate (e.g., "BTCUSDT")
   * @param currentPrice - Current market price
   * @returns Total unrealized P&L in USD
   */
  getTotalUnrealizedPnL(symbol: string, currentPrice: number): number {
    return this.getOpenTrades()
      .filter((t) => t.symbol === symbol)
      .reduce((sum, trade) => {
        const pnl = this.calculatePnL(trade, currentPrice);
        return sum + pnl;
      }, 0);
  }

  /**
   * Reset the engine state (for testing).
   */
  reset(): void {
    this.state = {
      balance: this.config.initialBalance,
      trades: [],
      sensorPosteriors: new Map(),
    };
  }
}
