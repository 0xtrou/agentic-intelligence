/**
 * @module run
 * @description CLI entry point for running the backtest.
 *
 * Usage: node dist/run.js
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fetchCandles } from './fetchCandles';
import { fetchFundingRates } from './fetchFunding';
import { runBacktest } from './engine';
import type { BacktestReport } from './types';

async function main(): Promise<void> {
  const symbol = 'BTCUSDT';
  const days = 90;

  console.log('='.repeat(60));
  console.log('M4.6 Independent Signal Review — Backtest');
  console.log(`Symbol: ${symbol} | Timeframe: 4h | Period: ${days} days`);
  console.log('='.repeat(60));
  console.log();

  // Fetch data
  const candles = await fetchCandles(symbol, '4h', days);
  const fundingRates = await fetchFundingRates(symbol, days);

  console.log();

  // Run backtest
  const report = runBacktest(candles, fundingRates);

  // Print summary
  printSummary(report);

  // Write JSON report
  const outputPath = join(__dirname, '..', 'results', 'btcusdt-90d.json');
  mkdirSync(dirname(outputPath), { recursive: true });

  // Write report without individual trades for cleaner output
  const cleanReport = {
    ...report,
    sensors: report.sensors.map((s) => ({
      ...s,
      stats: { ...s.stats, trades: undefined },
    })),
  };

  writeFileSync(outputPath, JSON.stringify(cleanReport, null, 2));
  console.log(`\nReport written to: ${outputPath}`);

  // Also write full report with trades
  const fullOutputPath = join(__dirname, '..', 'results', 'btcusdt-90d-full.json');
  writeFileSync(fullOutputPath, JSON.stringify(report, null, 2));
  console.log(`Full report written to: ${fullOutputPath}`);
}

function printSummary(report: BacktestReport): void {
  console.log('\n' + '='.repeat(60));
  console.log('BACKTEST RESULTS');
  console.log('='.repeat(60));
  console.log(`Period: ${report.metadata.periodDays} days | Candles: ${report.metadata.totalCandles}`);
  console.log(`TP: +${report.metadata.tpPercent * 100}% | SL: -${report.metadata.slPercent * 100}% | Max Hold: ${report.metadata.maxHoldCandles} candles`);
  console.log();

  for (const sensor of report.sensors) {
    console.log(`--- ${sensor.sensorId} ---`);
    console.log(`  Signals: ${sensor.stats.totalSignals} | Wins: ${sensor.stats.wins} | Losses: ${sensor.stats.losses}`);
    console.log(`  Win Rate: ${(sensor.stats.winRate * 100).toFixed(2)}%`);
    console.log(`  Avg Win: +${sensor.stats.avgWinPercent.toFixed(4)}% | Avg Loss: -${sensor.stats.avgLossPercent.toFixed(4)}%`);
    console.log(`  Expectancy: ${sensor.stats.expectancy >= 0 ? '+' : ''}${sensor.stats.expectancy.toFixed(4)}%`);
    console.log();
    for (const rb of sensor.regimeBreakdown) {
      if (rb.totalSignals > 0) {
        console.log(`  [${rb.regime.toUpperCase()}] Signals: ${rb.totalSignals} | Win Rate: ${(rb.winRate * 100).toFixed(2)}% | Expectancy: ${rb.expectancy >= 0 ? '+' : ''}${rb.expectancy.toFixed(4)}%`);
      }
    }
    console.log();
  }

  console.log('--- PORTFOLIO ---');
  console.log(`  Total Signals: ${report.portfolio.totalSignals}`);
  console.log(`  Overall Win Rate: ${(report.portfolio.overallWinRate * 100).toFixed(2)}%`);
  console.log(`  Overall Expectancy: ${report.portfolio.overallExpectancy >= 0 ? '+' : ''}${report.portfolio.overallExpectancy.toFixed(4)}%`);
}

main().catch((err) => {
  console.error('Backtest failed:', err);
  process.exit(1);
});
