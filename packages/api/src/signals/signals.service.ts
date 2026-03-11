/**
 * @module signals.service
 * @description Autonomous sensor polling and signal generation service.
 *
 * Responsibilities:
 * - Poll market data on schedule (4h for EMA, 8h for funding)
 * - Evaluate sensors autonomously
 * - Generate signals when votes pass aggregation
 * - Post signals to Discord (when webhook configured)
 * - Log all evaluations for audit
 *
 * Traces to: #15 (edge must be validated continuously), #16 (REST polling feasible at scale)
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BybitRestClient } from '@agentic-intelligence/exchange';
import { EmaCrossSensor, FundingRateSensor } from '@agentic-intelligence/sensors';
import { generateSignal, SensorVoteWithStatus, type RegimeGating } from '@agentic-intelligence/brain';
import { Signal, Timeframe, SensorStatus, SensorVote, MarketRegime } from '@agentic-intelligence/core';
import { DiscordWebhookService } from './discord-webhook.service';

const BUILD_VERSION = process.env.BUILD_VERSION || 'dev';

export interface SensorEvaluationLog {
  timestamp: Date;
  sensorId: string;
  fired: boolean;
  direction?: string;
  data?: any;
}

@Injectable()
export class SignalsService implements OnModuleInit {
  private readonly logger = new Logger(SignalsService.name);
  private readonly bybit: BybitRestClient;
  private readonly emaSensor: EmaCrossSensor;
  private readonly fundingSensor: FundingRateSensor;

  // Track last evaluation times for health endpoint
  private lastEmaEval: Date | null = null;
  private lastFundingEval: Date | null = null;

  // Evaluation history for audit (keep last 100)
  private evaluationLog: SensorEvaluationLog[] = [];

  constructor(private readonly discordWebhook: DiscordWebhookService) {
    this.bybit = new BybitRestClient({
      testnet: process.env.BYBIT_TESTNET === 'true',
      apiKey: process.env.BYBIT_API_KEY,
      apiSecret: process.env.BYBIT_API_SECRET,
    });

    this.emaSensor = new EmaCrossSensor('ema-cross-9-21', {
      fastPeriod: 9,
      slowPeriod: 21,
    });

    this.fundingSensor = new FundingRateSensor('funding-extreme', {
      threshold: 0.0005,
      lookback: 3,
    });
  }

  onModuleInit() {
    this.logger.log('SignalsService initialized — autonomous polling active');
    this.logger.log(`EMA sensor: every 4h candle close`);
    this.logger.log(`Funding sensor: every 8h funding interval`);
  }

  /**
   * Poll EMA cross sensor every 4 hours at candle close (00:00, 04:00, 08:00, 12:00, 16:00, 20:00 UTC)
   */
  @Cron('0 0,4,8,12,16,20 * * *', {
    name: 'ema-cross-poll',
    timeZone: 'UTC',
  })
  async pollEmaSensor() {
    this.logger.log('[EMA Poll] Starting...');
    this.lastEmaEval = new Date();

    try {
      const candles = await this.bybit.getCandles('BTCUSDT', '4h', 50);
      const vote = this.emaSensor.evaluate(candles);

      this.logEvaluation({
        timestamp: new Date(),
        sensorId: 'ema-cross-9-21',
        fired: vote.fire,
        direction: vote.direction,
        data: vote.data,
      });

      if (vote.fire && vote.direction) {
        this.logger.log(`[EMA Poll] FIRED — direction: ${vote.direction}`);
        await this.generateAndPostSignal('BTCUSDT', '4h');
      } else {
        this.logger.log('[EMA Poll] No signal — sensor did not fire');
      }
    } catch (error: unknown) {
      this.logger.error(`[EMA Poll] Failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Poll funding rate sensor every 8 hours at funding intervals (00:00, 08:00, 16:00 UTC)
   */
  @Cron('0 0,8,16 * * *', {
    name: 'funding-rate-poll',
    timeZone: 'UTC',
  })
  async pollFundingSensor() {
    this.logger.log('[Funding Poll] Starting...');
    this.lastFundingEval = new Date();

    try {
      const fundingRate = await this.bybit.getFundingRate('BTCUSDT');
      const vote = this.fundingSensor.evaluate([fundingRate]);

      this.logEvaluation({
        timestamp: new Date(),
        sensorId: 'funding-extreme',
        fired: vote.fire,
        direction: vote.direction,
        data: { fundingRate: fundingRate.rate },
      });

      if (vote.fire && vote.direction) {
        this.logger.log(`[Funding Poll] FIRED — direction: ${vote.direction}, rate: ${fundingRate.rate}`);
        await this.generateAndPostSignal('BTCUSDT', '4h');
      } else {
        this.logger.log(`[Funding Poll] No signal — rate ${fundingRate.rate} below threshold`);
      }
    } catch (error: unknown) {
      this.logger.error(`[Funding Poll] Failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate signal from all sensors and post to Discord (if configured).
   * Called when a sensor fires.
   */
  private async generateAndPostSignal(symbol: string, timeframe: Timeframe) {
    try {
      // Fetch current market data
      const candles = await this.bybit.getCandles(symbol, timeframe, 50);
      const fundingRate = await this.bybit.getFundingRate(symbol);

      // Evaluate both sensors
      const emaVote = this.emaSensor.evaluate(candles);
      const fundingVote = this.fundingSensor.evaluate([fundingRate]);

      // Collect votes with status
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

      if (votes.length === 0) {
        this.logger.warn('[Signal Generation] No sensors fired — aborting');
        return;
      }

      // Configure regime gating
      const regimeGating: RegimeGating[] = [
        { sensorId: 'ema-cross-9-21', requiredRegimes: [MarketRegime.TRENDING] },
        { sensorId: 'funding-extreme', requiredRegimes: [] }, // No gating
      ];

      const signal = generateSignal(
        symbol,
        timeframe,
        candles[candles.length - 1].close,
        votes,
        candles,
        undefined,
        undefined,
        regimeGating
      );

      if (signal) {
        this.logger.log(`[Signal Generated] ${signal.direction} ${symbol} @ ${signal.entry}`);
        // Post to Discord with full framework trace
        await this.discordWebhook.postSignal(signal, [emaVote, fundingVote]);
      } else {
        this.logger.warn('[Signal Generation] Brain rejected — no signal generated');
      }
    } catch (error: unknown) {
      this.logger.error(`[Signal Generation] Failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * On-demand signal generation (for API endpoint compatibility).
   * Same logic as autonomous polling, but triggered by HTTP request.
   */
  async generateSignalOnDemand(
    symbol: string = 'BTCUSDT',
    timeframe: Timeframe = '4h',
    limit: number = 50,
  ): Promise<{ version: string; signals: Signal[]; sensorVotes: SensorVote[] }> {
    const candles = await this.bybit.getCandles(symbol, timeframe, limit);
    const fundingRate = await this.bybit.getFundingRate(symbol);

    const emaVote = this.emaSensor.evaluate(candles);
    const fundingVote = this.fundingSensor.evaluate([fundingRate]);

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

    const signals: Signal[] = [];
    if (votes.length > 0) {
      const lastCandle = candles[candles.length - 1];

      const regimeGating: RegimeGating[] = [
        { sensorId: 'ema-cross-9-21', requiredRegimes: [MarketRegime.TRENDING] },
        { sensorId: 'funding-extreme', requiredRegimes: [] },
      ];

      const signal = generateSignal(
        symbol,
        timeframe,
        lastCandle.close,
        votes,
        candles,
        undefined,
        undefined,
        regimeGating
      );

      if (signal) {
        signals.push(signal);
      }
    }

    return { version: BUILD_VERSION, signals, sensorVotes: [emaVote, fundingVote] };
  }

  /**
   * Get sensor health status (for /health endpoint).
   */
  getSensorHealth() {
    return {
      emaLastPoll: this.lastEmaEval?.toISOString() || null,
      fundingLastPoll: this.lastFundingEval?.toISOString() || null,
      evaluationsLogged: this.evaluationLog.length,
    };
  }

  /**
   * Get recent evaluation log (for audit).
   */
  getEvaluationLog(limit: number = 20): SensorEvaluationLog[] {
    return this.evaluationLog.slice(-limit);
  }

  private logEvaluation(entry: SensorEvaluationLog) {
    this.evaluationLog.push(entry);
    if (this.evaluationLog.length > 100) {
      this.evaluationLog.shift(); // Keep last 100
    }
  }
}
