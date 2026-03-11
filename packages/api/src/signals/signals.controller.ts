/**
 * @module signals.controller
 * @description Signals endpoint — on-demand signal generation.
 *
 * Delegates to SignalsService for actual evaluation logic.
 * Autonomous polling happens via @Cron decorators in the service.
 */

import { Controller, Get, Query } from '@nestjs/common';
import { SignalsService } from './signals.service';
import { Signal, Timeframe, SensorVote } from '@agentic-intelligence/core';

@Controller('signals')
export class SignalsController {
  constructor(private readonly signalsService: SignalsService) {}

  /**
   * GET /signals
   *
   * Generate real-time signals for a symbol (on-demand).
   *
   * @param symbol - Trading pair (e.g., BTCUSDT)
   * @param timeframe - Candle timeframe (default: 4h)
   * @param limit - Number of candles to fetch (default: 50)
   */
  @Get()
  async getSignals(
    @Query('symbol') symbol: string = 'BTCUSDT',
    @Query('timeframe') timeframe: Timeframe = '4h',
    @Query('limit') limitStr: string = '50',
  ): Promise<{ version: string; signals: Signal[]; sensorVotes: SensorVote[] }> {
    const limit = parseInt(limitStr, 10);
    return this.signalsService.generateSignalOnDemand(symbol, timeframe, limit);
  }

  /**
   * GET /signals/query
   *
   * Query current market state with computed entry/SL/TP levels.
   * ALWAYS returns data (even when no sensors fire).
   * Used by signal bot for on-demand queries.
   *
   * @param symbol - Trading pair (e.g., TAOUSDT)
   * @param timeframe - Candle timeframe (default: 4h)
   */
  @Get('query')
  async queryMarketState(
    @Query('symbol') symbol: string = 'BTCUSDT',
    @Query('timeframe') timeframe: Timeframe = '4h',
  ) {
    return this.signalsService.queryMarketState(symbol, timeframe);
  }

  /**
   * GET /signals/health
   *
   * Sensor polling health check (last poll times).
   */
  @Get('health')
  getSensorHealth() {
    return this.signalsService.getSensorHealth();
  }

  /**
   * GET /signals/log
   *
   * Recent sensor evaluation log (for audit).
   */
  @Get('log')
  getEvaluationLog(@Query('limit') limitStr: string = '20') {
    const limit = parseInt(limitStr, 10);
    return this.signalsService.getEvaluationLog(limit);
  }
}
