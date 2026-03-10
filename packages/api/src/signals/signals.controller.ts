/**
 * @module signals.controller
 * @description Signals endpoint — real-time signal generation from market data.
 *
 * End-to-end flow:
 * 1. Fetch candles from Bybit
 * 2. Evaluate with EMA cross sensor
 * 3. Aggregate sensor votes in brain
 * 4. Return generated signals
 */

import { Controller, Get, Query } from '@nestjs/common';
import { BybitRestClient } from '@agentic-intelligence/exchange';
import { EmaCrossSensor } from '@agentic-intelligence/sensors';
import { generateSignal, SensorVoteWithStatus } from '@agentic-intelligence/brain';
import { Signal, Timeframe, SensorStatus } from '@agentic-intelligence/core';

@Controller('signals')
export class SignalsController {
  private readonly bybit: BybitRestClient;
  private readonly sensor: EmaCrossSensor;

  constructor() {
    this.bybit = new BybitRestClient({
      testnet: process.env.BYBIT_TESTNET === 'true',
      apiKey: process.env.BYBIT_API_KEY,
      apiSecret: process.env.BYBIT_API_SECRET,
    });

    // EMA cross sensor: 9-period fast, 21-period slow
    this.sensor = new EmaCrossSensor('ema-cross-9-21', {
      fastPeriod: 9,
      slowPeriod: 21,
    });
  }

  /**
   * GET /signals
   *
   * Generate real-time signals for a symbol.
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
  ): Promise<{ signals: Signal[]; sensorVote: any }> {
    const limit = parseInt(limitStr, 10);

    // 1. Fetch candles from Bybit
    const candles = await this.bybit.getCandles(symbol, timeframe, limit);

    // 2. Evaluate with sensor
    const vote = this.sensor.evaluate(candles);

    // 3. Generate signal if sensor fired
    const signals: Signal[] = [];
    if (vote.fire && vote.direction) {
      const lastCandle = candles[candles.length - 1];
      
      // Attach sensor status (assume ACTIVE for now — full lifecycle in M3)
      const voteWithStatus: SensorVoteWithStatus = {
        ...vote,
        direction: vote.direction,
        status: SensorStatus.ACTIVE,
      };

      const signal = generateSignal(
        vote.symbol,
        vote.timeframe,
        lastCandle.close,
        [voteWithStatus]
      );
      
      if (signal) {
        signals.push(signal);
      }
    }

    return { signals, sensorVote: vote };
  }
}
