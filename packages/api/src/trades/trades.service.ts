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
    // Initialize with M4.3 config: $50 balance, 1% position size, 1 concurrent position
    this.engine = new PaperTradingEngine({
      initialBalance: 50,
      positionSizePercent: 1,
      maxConcurrentPositions: 1,
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
