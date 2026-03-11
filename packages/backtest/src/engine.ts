/**
 * @module engine
 * @description Core backtesting engine.
 *
 * Walks through historical candles, runs each sensor at every bar,
 * and when a signal fires, checks if TP or SL is hit first within
 * the next N candles.
 */

import type { Candle, FundingRate, SensorVote, SignalDirection } from '@agentic-intelligence/core';
import { EmaCrossSensor } from '@agentic-intelligence/sensors';
import { RsiDivergenceSensor } from '@agentic-intelligence/sensors';
import { FundingRateSensor } from '@agentic-intelligence/sensors';
import { calculateAtr, classifyRegime } from './regime';
import type {
  BacktestReport,
  BacktestTrade,
  Regime,
  RegimeBreakdown,
  SensorReport,
  SensorStats,
} from './types';

/** Backtest configuration */
export interface BacktestConfig {
  /** Take profit percentage (default 0.01 = 1%) */
  tpPercent: number;
  /** Stop loss percentage (default 0.005 = 0.5%) */
  slPercent: number;
  /** Max candles to hold before forcing exit (default 12) */
  maxHoldCandles: number;
  /** ATR regime threshold (default 0.015 = 1.5%) */
  regimeThreshold: number;
}

const DEFAULT_CONFIG: BacktestConfig = {
  tpPercent: 0.01,
  slPercent: 0.005,
  maxHoldCandles: 12,
  regimeThreshold: 0.015,
};

/**
 * Check if TP or SL is hit first within the next candles after entry.
 *
 * For LONG: TP = entry × (1 + tpPercent), SL = entry × (1 - slPercent)
 * For SHORT: TP = entry × (1 - tpPercent), SL = entry × (1 + slPercent)
 *
 * @returns The trade result, or null if neither TP nor SL hit within maxHold
 */
export function evaluateTradeOutcome(
  entryPrice: number,
  direction: SignalDirection,
  candles: Candle[],
  config: BacktestConfig
): { exitPrice: number; exitIndex: number; outcome: 'win' | 'loss'; pnlPercent: number } {
  const isLong = direction === 'LONG';
  const tp = isLong
    ? entryPrice * (1 + config.tpPercent)
    : entryPrice * (1 - config.tpPercent);
  const sl = isLong
    ? entryPrice * (1 - config.slPercent)
    : entryPrice * (1 + config.slPercent);

  for (let i = 0; i < Math.min(candles.length, config.maxHoldCandles); i++) {
    const candle = candles[i];

    if (isLong) {
      // Check SL first (conservative — assume worst case within candle)
      if (candle.low <= sl) {
        return {
          exitPrice: sl,
          exitIndex: i,
          outcome: 'loss',
          pnlPercent: -config.slPercent * 100,
        };
      }
      if (candle.high >= tp) {
        return {
          exitPrice: tp,
          exitIndex: i,
          outcome: 'win',
          pnlPercent: config.tpPercent * 100,
        };
      }
    } else {
      // SHORT: check SL first (price going up = loss)
      if (candle.high >= sl) {
        return {
          exitPrice: sl,
          exitIndex: i,
          outcome: 'loss',
          pnlPercent: -config.slPercent * 100,
        };
      }
      if (candle.low <= tp) {
        return {
          exitPrice: tp,
          exitIndex: i,
          outcome: 'win',
          pnlPercent: config.tpPercent * 100,
        };
      }
    }
  }

  // Neither TP nor SL hit — exit at close of last candle
  const lastCandle = candles[Math.min(candles.length, config.maxHoldCandles) - 1];
  const exitPrice = lastCandle.close;
  const pnlPercent = isLong
    ? ((exitPrice - entryPrice) / entryPrice) * 100
    : ((entryPrice - exitPrice) / entryPrice) * 100;

  return {
    exitPrice,
    exitIndex: Math.min(candles.length, config.maxHoldCandles) - 1,
    outcome: pnlPercent >= 0 ? 'win' : 'loss',
    pnlPercent,
  };
}

/**
 * Calculate statistics from a list of trades.
 */
function calculateStats(sensorId: string, trades: BacktestTrade[]): SensorStats {
  const wins = trades.filter((t) => t.outcome === 'win');
  const losses = trades.filter((t) => t.outcome === 'loss');
  const winRate = trades.length > 0 ? wins.length / trades.length : 0;
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnlPercent, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnlPercent, 0) / losses.length) : 0;
  const expectancy = winRate * avgWin - (1 - winRate) * avgLoss;

  return {
    sensorId,
    totalSignals: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: Math.round(winRate * 10000) / 10000,
    avgWinPercent: Math.round(avgWin * 10000) / 10000,
    avgLossPercent: Math.round(avgLoss * 10000) / 10000,
    expectancy: Math.round(expectancy * 10000) / 10000,
    trades,
  };
}

/**
 * Calculate regime breakdown for a list of trades.
 */
function calculateRegimeBreakdown(trades: BacktestTrade[]): RegimeBreakdown[] {
  const regimes: Regime[] = ['trending', 'ranging'];
  return regimes.map((regime) => {
    const regimeTrades = trades.filter((t) => t.regime === regime);
    const wins = regimeTrades.filter((t) => t.outcome === 'win');
    const losses = regimeTrades.filter((t) => t.outcome === 'loss');
    const winRate = regimeTrades.length > 0 ? wins.length / regimeTrades.length : 0;
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnlPercent, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnlPercent, 0) / losses.length) : 0;
    const expectancy = winRate * avgWin - (1 - winRate) * avgLoss;

    return {
      regime,
      totalSignals: regimeTrades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: Math.round(winRate * 10000) / 10000,
      expectancy: Math.round(expectancy * 10000) / 10000,
    };
  });
}

/**
 * Run the backtest for EMA cross and RSI divergence sensors on candle data.
 */
function backtestCandleSensors(
  candles: Candle[],
  atrValues: number[],
  config: BacktestConfig
): Map<string, BacktestTrade[]> {
  const emaSensor = new EmaCrossSensor('ema-cross-9-21', { fastPeriod: 9, slowPeriod: 21 });
  const rsiSensor = new RsiDivergenceSensor('rsi-divergence-14', { rsiPeriod: 14, lookbackBars: 10 });

  const tradesMap = new Map<string, BacktestTrade[]>();
  tradesMap.set(emaSensor.id, []);
  tradesMap.set(rsiSensor.id, []);

  // We need enough lookback for sensors. Start from index where both sensors have enough data.
  // EMA needs slowPeriod + 1 = 22 candles
  // RSI needs rsiPeriod + lookbackBars + 1 = 25 candles
  // ATR needs 15 candles
  const startIndex = 25;

  for (let i = startIndex; i < candles.length - config.maxHoldCandles; i++) {
    const windowCandles = candles.slice(0, i + 1);
    const regime = classifyRegime(candles, atrValues, i, config.regimeThreshold);

    // Evaluate each sensor
    const sensors: Array<{ sensor: { id: string; evaluate: (c: Candle[]) => SensorVote }; id: string }> = [
      { sensor: emaSensor, id: emaSensor.id },
      { sensor: rsiSensor, id: rsiSensor.id },
    ];

    for (const { sensor, id } of sensors) {
      const vote = sensor.evaluate(windowCandles);

      if (vote.fire && vote.direction) {
        const entryPrice = candles[i].close;
        const futureCandles = candles.slice(i + 1, i + 1 + config.maxHoldCandles);

        if (futureCandles.length === 0) continue;

        const result = evaluateTradeOutcome(entryPrice, vote.direction, futureCandles, config);

        const trade: BacktestTrade = {
          sensorId: id,
          direction: vote.direction,
          entryTime: candles[i].closeTime,
          entryPrice,
          exitPrice: result.exitPrice,
          exitTime: futureCandles[result.exitIndex].closeTime,
          outcome: result.outcome,
          pnlPercent: result.pnlPercent,
          regime,
          candlesHeld: result.exitIndex + 1,
        };

        tradesMap.get(id)!.push(trade);
      }
    }
  }

  return tradesMap;
}

/**
 * Run the backtest for the funding rate sensor.
 * Maps funding signals to the nearest 4h candle for outcome evaluation.
 */
function backtestFundingSensor(
  candles: Candle[],
  fundingRates: FundingRate[],
  atrValues: number[],
  config: BacktestConfig
): BacktestTrade[] {
  if (fundingRates.length === 0) {
    console.log('No funding rate data available — skipping funding sensor backtest');
    return [];
  }

  const fundingSensor = new FundingRateSensor('funding-rate-extreme', {
    threshold: 0.0005,
    lookback: 3,
  });

  const trades: BacktestTrade[] = [];

  // Walk through funding rates with a sliding window of 3
  for (let i = 2; i < fundingRates.length; i++) {
    const window = fundingRates.slice(i - 2, i + 1);
    const vote = fundingSensor.evaluate(window);

    if (!vote.fire || !vote.direction) continue;

    // Find the nearest candle after this funding timestamp
    const fundingTime = fundingRates[i].timestamp;
    const candleIndex = candles.findIndex((c) => c.openTime >= fundingTime);

    if (candleIndex < 0 || candleIndex >= candles.length - config.maxHoldCandles) continue;

    const entryPrice = candles[candleIndex].close;
    const futureCandles = candles.slice(candleIndex + 1, candleIndex + 1 + config.maxHoldCandles);
    const regime = classifyRegime(candles, atrValues, candleIndex, config.regimeThreshold);

    if (futureCandles.length === 0) continue;

    const result = evaluateTradeOutcome(entryPrice, vote.direction, futureCandles, config);

    trades.push({
      sensorId: 'funding-rate-extreme',
      direction: vote.direction,
      entryTime: candles[candleIndex].closeTime,
      entryPrice,
      exitPrice: result.exitPrice,
      exitTime: futureCandles[result.exitIndex].closeTime,
      outcome: result.outcome,
      pnlPercent: result.pnlPercent,
      regime,
      candlesHeld: result.exitIndex + 1,
    });
  }

  return trades;
}

/**
 * Run the full backtest and generate a report.
 */
export function runBacktest(
  candles: Candle[],
  fundingRates: FundingRate[],
  config: Partial<BacktestConfig> = {}
): BacktestReport {
  const fullConfig: BacktestConfig = { ...DEFAULT_CONFIG, ...config };

  console.log(`Running backtest on ${candles.length} candles...`);
  console.log(`Config: TP=${fullConfig.tpPercent * 100}%, SL=${fullConfig.slPercent * 100}%, MaxHold=${fullConfig.maxHoldCandles} candles`);

  // Pre-calculate ATR for regime classification
  const atrValues = calculateAtr(candles);

  // Run candle-based sensors
  const candleTrades = backtestCandleSensors(candles, atrValues, fullConfig);

  // Run funding rate sensor
  const fundingTrades = backtestFundingSensor(candles, fundingRates, atrValues, fullConfig);

  // Build sensor reports
  const sensorReports: SensorReport[] = [];

  for (const [sensorId, trades] of candleTrades) {
    sensorReports.push({
      sensorId,
      stats: calculateStats(sensorId, trades),
      regimeBreakdown: calculateRegimeBreakdown(trades),
    });
  }

  sensorReports.push({
    sensorId: 'funding-rate-extreme',
    stats: calculateStats('funding-rate-extreme', fundingTrades),
    regimeBreakdown: calculateRegimeBreakdown(fundingTrades),
  });

  // Portfolio-level stats
  const allTrades = [...Array.from(candleTrades.values()).flat(), ...fundingTrades];
  const allWins = allTrades.filter((t) => t.outcome === 'win');
  const allLosses = allTrades.filter((t) => t.outcome === 'loss');
  const overallWinRate = allTrades.length > 0 ? allWins.length / allTrades.length : 0;
  const avgWin = allWins.length > 0 ? allWins.reduce((s, t) => s + t.pnlPercent, 0) / allWins.length : 0;
  const avgLoss = allLosses.length > 0 ? Math.abs(allLosses.reduce((s, t) => s + t.pnlPercent, 0) / allLosses.length) : 0;
  const overallExpectancy = overallWinRate * avgWin - (1 - overallWinRate) * avgLoss;

  return {
    metadata: {
      symbol: candles[0]?.symbol ?? 'BTCUSDT',
      timeframe: candles[0]?.timeframe ?? '4h',
      periodDays: candles.length > 0
        ? Math.round((candles[candles.length - 1].closeTime - candles[0].openTime) / (24 * 60 * 60 * 1000))
        : 0,
      startTime: candles[0]?.openTime ?? 0,
      endTime: candles[candles.length - 1]?.closeTime ?? 0,
      totalCandles: candles.length,
      tpPercent: fullConfig.tpPercent,
      slPercent: fullConfig.slPercent,
      maxHoldCandles: fullConfig.maxHoldCandles,
      regimeThreshold: fullConfig.regimeThreshold,
      generatedAt: new Date().toISOString(),
    },
    sensors: sensorReports,
    portfolio: {
      totalSignals: allTrades.length,
      totalWins: allWins.length,
      totalLosses: allLosses.length,
      overallWinRate: Math.round(overallWinRate * 10000) / 10000,
      overallExpectancy: Math.round(overallExpectancy * 10000) / 10000,
    },
  };
}
