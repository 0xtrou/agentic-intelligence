/**
 * @module trades.controller
 * @description HTTP endpoints for paper trades.
 *
 * Endpoints:
 * - GET /trades — get all trades
 * - GET /trades/open — get open trades only
 */

import { Controller, Get } from '@nestjs/common';
import { TradesService } from './trades.service';
import { Trade } from '@agentic-intelligence/core';

@Controller('trades')
export class TradesController {
  constructor(private readonly tradesService: TradesService) {}

  /**
   * Get all trades.
   *
   * Returns both open and closed trades with full history.
   *
   * @returns Array of all trades
   */
  @Get()
  getAllTrades(): Trade[] {
    return this.tradesService.getAllTrades();
  }

  /**
   * Get open trades only.
   *
   * Returns only trades with status=OPEN, useful for monitoring
   * current positions.
   *
   * @returns Array of open trades
   */
  @Get('open')
  getOpenTrades(): Trade[] {
    return this.tradesService.getOpenTrades();
  }
}
