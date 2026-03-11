/**
 * @module trades.service
 * @description Service for managing paper trades.
 *
 * Wraps the PaperTradingEngine and provides access to trades.
 * This is a singleton service that maintains the global paper trading state.
 */

import { Injectable } from '@nestjs/common';
import { PaperTradingEngine } from '@agentic-intelligence/paper-trading';
import { Trade } from '@agentic-intelligence/core';

@Injectable()
export class TradesService {
  private engine: PaperTradingEngine;

  constructor() {
    // Initialize with default config
    this.engine = new PaperTradingEngine({
      initialBalance: 10000,
      positionSizePercent: 1,
      maxConcurrentPositions: 3,
    });
  }

  /**
   * Get the paper trading engine instance.
   *
   * Allows other services (e.g., SignalsService) to interact
   * with the engine directly.
   */
  getEngine(): PaperTradingEngine {
    return this.engine;
  }

  /**
   * Get all trades (open + closed).
   */
  getAllTrades(): Trade[] {
    return this.engine.getTrades();
  }

  /**
   * Get open trades only.
   */
  getOpenTrades(): Trade[] {
    return this.engine.getOpenTrades();
  }
}
