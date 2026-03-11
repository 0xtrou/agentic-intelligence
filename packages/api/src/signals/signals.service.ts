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
import { EmaCrossSensor, FundingRateSensor, RsiDivergenceSensor } from '@agentic-intelligence/sensors';
import { generateSignal, SensorVoteWithStatus, type RegimeGating } from '@agentic-intelligence/brain';
import { Signal, Timeframe, SensorStatus, SensorVote, MarketRegime, Candle } from '@agentic-intelligence/core';
import { DiscordWebhookService } from './discord-webhook.service';
import { TradesService } from '../trades/trades.service';
import { BayesianTrackerService } from '../bayesian/bayesian-tracker.service';

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
  private readonly rsiSensor: RsiDivergenceSensor;

  // Track last evaluation times for health endpoint
  private lastEmaEval: Date | null = null;
  private lastFundingEval: Date | null = null;
  private lastRsiEval: Date | null = null;

  // Evaluation history for audit (keep last 100)
  private evaluationLog: SensorEvaluationLog[] = [];

  // Track regime at entry for each trade (for exit comparison)
  private tradeRegimes: Map<string, MarketRegime> = new Map();

  constructor(
    private readonly discordWebhook: DiscordWebhookService,
    private readonly tradesService: TradesService,
    private readonly bayesianTracker: BayesianTrackerService,
  ) {
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

    this.rsiSensor = new RsiDivergenceSensor('rsi-divergence-14', {
      rsiPeriod: 14,
      lookbackBars: 10,
    });
  }

  onModuleInit() {
    this.logger.log('SignalsService initialized — autonomous polling active');
    this.logger.log(`EMA sensor: every 4h candle close`);
    this.logger.log(`RSI divergence sensor: every 4h candle close`);
    this.logger.log(`Funding sensor: every 8h funding interval`);
  }

  /**
   * Poll EMA cross sensor every 4 hours at candle close (00:00, 04:00, 08:00, 12:00, 16:00, 20:00 UTC)
   * Polls all active symbols: BTC, ETH, SOL
   */
  @Cron('0 0,4,8,12,16,20 * * *', {
    name: 'ema-cross-poll',
    timeZone: 'UTC',
  })
  async pollEmaSensor() {
    this.logger.log('[EMA Poll] Starting...');
    this.lastEmaEval = new Date();

    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

    for (const symbol of symbols) {
      try {
        const candles = await this.bybit.getCandles(symbol, '4h', 50);
        const currentPrice = candles[candles.length - 1].close;

        // Check and update open positions first
        await this.checkOpenPositions(symbol, currentPrice, candles);

        const vote = this.emaSensor.evaluate(candles);

        this.logEvaluation({
          timestamp: new Date(),
          sensorId: 'ema-cross-9-21',
          fired: vote.fire,
          direction: vote.direction,
          data: vote.data,
        });

        if (vote.fire && vote.direction) {
          this.logger.log(`[EMA Poll] ${symbol} FIRED — direction: ${vote.direction}`);
          await this.generateAndPostSignal(symbol, '4h');
        } else {
          this.logger.log(`[EMA Poll] ${symbol} — sensor did not fire`);
        }
      } catch (error: unknown) {
        this.logger.error(`[EMA Poll] ${symbol} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Poll RSI divergence sensor every 4 hours at candle close (00:00, 04:00, 08:00, 12:00, 16:00, 20:00 UTC)
   * Polls all active symbols: BTC, ETH, SOL
   */
  @Cron('0 0,4,8,12,16,20 * * *', {
    name: 'rsi-divergence-poll',
    timeZone: 'UTC',
  })
  async pollRsiSensor() {
    this.logger.log('[RSI Poll] Starting...');
    this.lastRsiEval = new Date();

    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

    for (const symbol of symbols) {
      try {
        const candles = await this.bybit.getCandles(symbol, '4h', 50);
        const currentPrice = candles[candles.length - 1].close;

        // Check and update open positions first
        await this.checkOpenPositions(symbol, currentPrice, candles);

        const vote = this.rsiSensor.evaluate(candles);

        this.logEvaluation({
          timestamp: new Date(),
          sensorId: 'rsi-divergence-14',
          fired: vote.fire,
          direction: vote.direction,
          data: vote.data,
        });

        if (vote.fire && vote.direction) {
          this.logger.log(`[RSI Poll] ${symbol} FIRED — direction: ${vote.direction}, type: ${vote.data?.divergence_type}`);
          await this.generateAndPostSignal(symbol, '4h');
        } else {
          this.logger.log(`[RSI Poll] ${symbol} — no divergence detected`);
        }
      } catch (error: unknown) {
        this.logger.error(`[RSI Poll] ${symbol} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Poll funding rate sensor every 8 hours at funding intervals (00:00, 08:00, 16:00 UTC)
   * Polls all active symbols: BTC, ETH, SOL
   */
  @Cron('0 0,8,16 * * *', {
    name: 'funding-rate-poll',
    timeZone: 'UTC',
  })
  async pollFundingSensor() {
    this.logger.log('[Funding Poll] Starting...');
    this.lastFundingEval = new Date();

    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

    for (const symbol of symbols) {
      try {
        // Fetch current price first for position monitoring
        const candles = await this.bybit.getCandles(symbol, '4h', 50);
        const currentPrice = candles[candles.length - 1].close;

        // Check and update open positions first
        await this.checkOpenPositions(symbol, currentPrice, candles);

        const fundingRate = await this.bybit.getFundingRate(symbol);
        const vote = this.fundingSensor.evaluate([fundingRate]);

        this.logEvaluation({
          timestamp: new Date(),
          sensorId: 'funding-extreme',
          fired: vote.fire,
          direction: vote.direction,
          data: { fundingRate: fundingRate.rate },
        });

        if (vote.fire && vote.direction) {
          this.logger.log(`[Funding Poll] ${symbol} FIRED — direction: ${vote.direction}, rate: ${fundingRate.rate}`);
          await this.generateAndPostSignal(symbol, '4h');
        } else {
          this.logger.log(`[Funding Poll] ${symbol} — rate ${fundingRate.rate} below threshold`);
        }
      } catch (error: unknown) {
        this.logger.error(`[Funding Poll] ${symbol} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Check and update open positions. Auto-closes positions that hit TP/SL.
   * Posts trade close embeds to Discord for closed positions.
   */
  private async checkOpenPositions(symbol: string, currentPrice: number, candles: Candle[]) {
    const engine = this.tradesService.getEngine();
    const openBefore = engine.getOpenTrades().length;
    
    // Update positions and get any that closed
    const closedTrades = engine.updatePositions(symbol, currentPrice);
    
    if (closedTrades.length > 0) {
      this.logger.log(`[Position Monitor] ${closedTrades.length} trade(s) closed`);
      
      // Detect current regime for exit comparison
      const exitRegime = this.detectRegime(candles);
      
      // Process each closed trade
      for (const trade of closedTrades) {
        const entryRegime = this.tradeRegimes.get(trade.id) || MarketRegime.UNKNOWN;
        
        // Update Bayesian tracker for each contributing sensor
        const lifecycleEvents = [];
        for (const sensorId of trade.sensorVotes) {
          const { tracker, statusChanged, oldStatus } = this.bayesianTracker.updateWithTrade(
            sensorId,
            entryRegime,
            trade
          );
          
          if (statusChanged) {
            lifecycleEvents.push({ sensorId, regime: entryRegime, oldStatus, newStatus: tracker.status, tracker });
          }
        }
        
        // Get Bayesian stats for trade close embed
        const bayesianStats = trade.sensorVotes.map(sensorId => {
          const tracker = this.bayesianTracker.getTrackerByKey(sensorId, entryRegime);
          return tracker ? { sensorId, tracker } : null;
        }).filter(s => s !== null);
        
        // Post trade close embed with Bayesian stats
        await this.discordWebhook.postTradeClose(trade, entryRegime, exitRegime, bayesianStats);
        
        // Post lifecycle events if any
        for (const event of lifecycleEvents) {
          await this.discordWebhook.postLifecycleEvent(event);
        }
        
        // Clean up regime tracking
        this.tradeRegimes.delete(trade.id);
      }
    } else if (openBefore > 0) {
      this.logger.log(`[Position Monitor] ${openBefore} position(s) still open`);
    }
  }

  /**
   * Detect current market regime from candles (for exit regime tracking).
   */
  private detectRegime(candles: Candle[]): MarketRegime {
    // Simple ATR-based regime detection (same logic as brain)
    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    
    // Calculate ATR(14)
    const period = 14;
    if (candles.length < period + 1) return MarketRegime.UNKNOWN;
    
    let atrSum = 0;
    for (let i = candles.length - period; i < candles.length; i++) {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
      atrSum += tr;
    }
    const atr = atrSum / period;
    const currentPrice = closes[closes.length - 1];
    const atrPercent = (atr / currentPrice) * 100;
    
    // Threshold: 2% ATR = trending, < 2% = ranging
    return atrPercent >= 2.0 ? MarketRegime.TRENDING : MarketRegime.RANGING;
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

      // Evaluate all sensors
      const emaVote = this.emaSensor.evaluate(candles);
      const rsiVote = this.rsiSensor.evaluate(candles);
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

      if (rsiVote.fire && rsiVote.direction) {
        votes.push({
          ...rsiVote,
          direction: rsiVote.direction,
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
        { sensorId: 'rsi-divergence-14', requiredRegimes: [MarketRegime.TRENDING] }, // Divergence only in trending
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
        
        // Open paper trade
        const engine = this.tradesService.getEngine();
        const trade = engine.openTrade(signal);
        
        if (trade) {
          this.logger.log(`[Paper Trade] Opened position — ${trade.id}`);
          // Track regime at entry for later comparison
          this.tradeRegimes.set(trade.id, signal.regime);
          
          // Post signal to Discord with full framework trace
          await this.discordWebhook.postSignal(signal, [emaVote, rsiVote, fundingVote]);
        } else {
          this.logger.warn(`[Paper Trade] Failed to open — max positions or insufficient balance`);
        }
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
    const rsiVote = this.rsiSensor.evaluate(candles);
    const fundingVote = this.fundingSensor.evaluate([fundingRate]);

    const votes: SensorVoteWithStatus[] = [];

    if (emaVote.fire && emaVote.direction) {
      votes.push({
        ...emaVote,
        direction: emaVote.direction,
        status: SensorStatus.ACTIVE,
      });
    }

    if (rsiVote.fire && rsiVote.direction) {
      votes.push({
        ...rsiVote,
        direction: rsiVote.direction,
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
        { sensorId: 'rsi-divergence-14', requiredRegimes: [MarketRegime.TRENDING] },
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

    return { version: BUILD_VERSION, signals, sensorVotes: [emaVote, rsiVote, fundingVote] };
  }

  /**
   * Get sensor health status (for /health endpoint).
   */
  getSensorHealth() {
    const engine = this.tradesService.getEngine();
    return {
      emaLastPoll: this.lastEmaEval?.toISOString() || null,
      rsiLastPoll: this.lastRsiEval?.toISOString() || null,
      fundingLastPoll: this.lastFundingEval?.toISOString() || null,
      evaluationsLogged: this.evaluationLog.length,
      paperTradingBalance: engine.getBalance(),
      openPositions: engine.getOpenTrades().length,
      totalTrades: engine.getTrades().length,
    };
  }

  /**
   * Get recent evaluation log (for audit).
   */
  getEvaluationLog(limit: number = 20): SensorEvaluationLog[] {
    return this.evaluationLog.slice(-limit);
  }

  /**
   * Get paper trading state (for /trades endpoint).
   */
  getPaperTradingState() {
    const engine = this.tradesService.getEngine();
    const trackers = this.bayesianTracker.getAllTrackers();

    return {
      balance: engine.getBalance(),
      trades: engine.getTrades(),
      openTrades: engine.getOpenTrades(),
      sensorLifecycle: trackers.map(tracker => ({
        sensorId: tracker.sensorId,
        regime: tracker.regime,
        status: tracker.status,
        posterior: tracker.posterior,
        tradeCount: tracker.tradeCount,
        mean: tracker.posterior.alpha / (tracker.posterior.alpha + tracker.posterior.beta),
        lastSignalTime: tracker.lastSignalTime,
      })),
    };
  }

  private logEvaluation(entry: SensorEvaluationLog) {
    this.evaluationLog.push(entry);
    if (this.evaluationLog.length > 100) {
      this.evaluationLog.shift(); // Keep last 100
    }
  }
}
