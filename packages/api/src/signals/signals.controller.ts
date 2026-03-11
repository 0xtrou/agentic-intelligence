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
import { EmaCrossSensor, FundingRateSensor } from '@agentic-intelligence/sensors';
import { generateSignal, SensorVoteWithStatus, type RegimeGating } from '@agentic-intelligence/brain';
import { Signal, Timeframe, SensorStatus, SensorVote, MarketRegime } from '@agentic-intelligence/core';

@Controller('signals')
export class SignalsController {
  private readonly bybit: BybitRestClient;
  private readonly emaSensor: EmaCrossSensor;
  private readonly fundingSensor: FundingRateSensor;

  constructor() {
    this.bybit = new BybitRestClient({
      testnet: process.env.BYBIT_TESTNET === 'true',
      apiKey: process.env.BYBIT_API_KEY,
      apiSecret: process.env.BYBIT_API_SECRET,
    });

    // EMA cross sensor: 9-period fast, 21-period slow
    this.emaSensor = new EmaCrossSensor('ema-cross-9-21', {
      fastPeriod: 9,
      slowPeriod: 21,
    });

    // Funding rate sensor: 0.05% threshold (default)
    this.fundingSensor = new FundingRateSensor('funding-extreme', {
      threshold: 0.0005,  // 0.05% per 8h funding interval
      lookback: 3,
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
  ): Promise<{ signals: Signal[]; sensorVotes: SensorVote[] }> {
    const limit = parseInt(limitStr, 10);

    // 1. Fetch market data
    const candles = await this.bybit.getCandles(symbol, timeframe, limit);
    const fundingRate = await this.bybit.getFundingRate(symbol);

    // 2. Evaluate sensors
    const emaVote = this.emaSensor.evaluate(candles);
    const fundingVote = this.fundingSensor.evaluate([fundingRate]);

    // 3. Collect all votes with sensor status
    const votes: SensorVoteWithStatus[] = [];

    if (emaVote.fire && emaVote.direction) {
      votes.push({
        ...emaVote,
        direction: emaVote.direction,
        status: SensorStatus.ACTIVE,
      });
    }

    if (fundingVote.fire && fundingVote.direction) {
      votes.push({
        ...fundingVote,
        direction: fundingVote.direction,
        status: SensorStatus.ACTIVE,
      });
    }

    // 4. Generate signal if any sensor fired
    const signals: Signal[] = [];
    if (votes.length > 0) {
      const lastCandle = candles[candles.length - 1];

      // Configure regime gating: EMA cross only fires in TRENDING
      // Funding rate sensor fires in ALL regimes (structural, not pattern-based)
      const regimeGating: RegimeGating[] = [
        { sensorId: 'ema-cross-9-21', requiredRegimes: [MarketRegime.TRENDING] },
        { sensorId: 'funding-extreme', requiredRegimes: [] }, // No gating
      ];

      const signal = generateSignal(
        symbol,
        timeframe,
        lastCandle.close,
        votes,
        candles,  // Pass candles for regime detection
        undefined, // Use default brain config
        undefined, // Use default regime config
        regimeGating
      );

      if (signal) {
        signals.push(signal);
      }
    }

    return { signals, sensorVotes: [emaVote, fundingVote] };
  }
}
