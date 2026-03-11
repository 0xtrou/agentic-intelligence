/**
 * @module run-expanded
 * @description Expanded backtest runner for 1D and 1W timeframes across BTC, ETH, SOL.
 *
 * Methodology (same sensors as 4h):
 *   - EMA cross 9/21
 *   - RSI divergence (14)
 *   - Funding rate (±0.05%)
 *
 * TP/SL scaled by timeframe:
 *   - 1D: TP +3%, SL -1.5%
 *   - 1W: TP +8%, SL -4%
 *
 * Max hold: 12 candles after signal
 * Regime: ATR(14) > 1.5% of price = trending, else ranging
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fetchCandles } from './fetchCandles';
import { fetchFundingRates } from './fetchFunding';
import { runBacktest } from './engine';
import type { BacktestReport } from './types';
import type { Timeframe } from '@agentic-intelligence/core';

interface RunConfig {
  symbol: string;
  timeframe: Timeframe;
  days: number;
  tpPercent: number;
  slPercent: number;
  outputFile: string;
}

const CONFIGS: RunConfig[] = [
  // 1D timeframe — 365 days of daily candles
  { symbol: 'BTCUSDT', timeframe: '1d', days: 365, tpPercent: 0.03, slPercent: 0.015, outputFile: 'btcusdt-1d.json' },
  { symbol: 'ETHUSDT', timeframe: '1d', days: 365, tpPercent: 0.03, slPercent: 0.015, outputFile: 'ethusdt-1d.json' },
  { symbol: 'SOLUSDT', timeframe: '1d', days: 365, tpPercent: 0.03, slPercent: 0.015, outputFile: 'solusdt-1d.json' },
  // 1W timeframe — 730 days (2 years) to get enough weekly candles
  { symbol: 'BTCUSDT', timeframe: '1w', days: 730, tpPercent: 0.08, slPercent: 0.04, outputFile: 'btcusdt-1w.json' },
  { symbol: 'ETHUSDT', timeframe: '1w', days: 730, tpPercent: 0.08, slPercent: 0.04, outputFile: 'ethusdt-1w.json' },
  { symbol: 'SOLUSDT', timeframe: '1w', days: 730, tpPercent: 0.08, slPercent: 0.04, outputFile: 'solusdt-1w.json' },
];

async function main(): Promise<void> {
  const resultsDir = join(__dirname, '..', 'results');
  mkdirSync(resultsDir, { recursive: true });

  const allReports: Array<{ config: RunConfig; report: BacktestReport }> = [];

  for (const cfg of CONFIGS) {
    console.log('\n' + '='.repeat(60));
    console.log(`${cfg.symbol} | ${cfg.timeframe} | ${cfg.days} days | TP=${cfg.tpPercent * 100}% SL=${cfg.slPercent * 100}%`);
    console.log('='.repeat(60));

    try {
      // Fetch candle data
      const candles = await fetchCandles(cfg.symbol, cfg.timeframe, cfg.days);

      // Fetch funding rates for the same period
      const fundingRates = await fetchFundingRates(cfg.symbol, cfg.days);

      // Run backtest with timeframe-specific TP/SL
      const report = runBacktest(candles, fundingRates, {
        tpPercent: cfg.tpPercent,
        slPercent: cfg.slPercent,
        maxHoldCandles: 12,
        regimeThreshold: 0.015,
      });

      // Override metadata timeframe (engine uses candle's timeframe, which is correct)
      allReports.push({ config: cfg, report });

      // Write clean JSON (no individual trades)
      const cleanReport = {
        ...report,
        sensors: report.sensors.map((s) => ({
          ...s,
          stats: { ...s.stats, trades: undefined },
        })),
      };

      const outputPath = join(resultsDir, cfg.outputFile);
      writeFileSync(outputPath, JSON.stringify(cleanReport, null, 2));
      console.log(`\nWritten: ${outputPath}`);

      // Print quick summary
      for (const sensor of report.sensors) {
        console.log(`  ${sensor.sensorId}: ${sensor.stats.totalSignals} signals, WR=${(sensor.stats.winRate * 100).toFixed(1)}%, E=${sensor.stats.expectancy >= 0 ? '+' : ''}${sensor.stats.expectancy.toFixed(4)}%`);
      }
      console.log(`  PORTFOLIO: ${report.portfolio.totalSignals} signals, WR=${(report.portfolio.overallWinRate * 100).toFixed(1)}%, E=${report.portfolio.overallExpectancy >= 0 ? '+' : ''}${report.portfolio.overallExpectancy.toFixed(4)}%`);
    } catch (err) {
      console.error(`ERROR running ${cfg.symbol} ${cfg.timeframe}:`, err);
    }
  }

  // Generate SUMMARY.md
  generateSummary(allReports, resultsDir);
}

function generateSummary(
  allReports: Array<{ config: RunConfig; report: BacktestReport }>,
  resultsDir: string
): void {
  const lines: string[] = [
    '# M4.6 Expanded Backtest Results',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Configuration',
    '',
    '| Timeframe | TP | SL | Max Hold | Regime Threshold |',
    '|-----------|----|----|----------|------------------|',
    '| 1D | +3% | -1.5% | 12 candles | ATR(14) > 1.5% |',
    '| 1W | +8% | -4% | 12 candles | ATR(14) > 1.5% |',
    '',
    '## Overall Results',
    '',
    '| Symbol | TF | Candles | EMA Signals | EMA WR | EMA Exp | RSI Signals | RSI WR | RSI Exp | Fund Signals | Fund WR | Fund Exp | Total Signals | Overall WR | Overall Exp |',
    '|--------|-----|---------|-------------|--------|---------|-------------|--------|---------|--------------|---------|---------|---------------|------------|-------------|',
  ];

  for (const { config, report } of allReports) {
    const ema = report.sensors.find((s) => s.sensorId === 'ema-cross-9-21');
    const rsi = report.sensors.find((s) => s.sensorId === 'rsi-divergence-14');
    const fund = report.sensors.find((s) => s.sensorId === 'funding-rate-extreme');

    const fmtSensor = (s: typeof ema) => {
      if (!s || s.stats.totalSignals === 0) return { signals: '0', wr: 'N/A', exp: 'N/A' };
      return {
        signals: String(s.stats.totalSignals),
        wr: `${(s.stats.winRate * 100).toFixed(1)}%`,
        exp: `${s.stats.expectancy >= 0 ? '+' : ''}${s.stats.expectancy.toFixed(4)}%`,
      };
    };

    const e = fmtSensor(ema);
    const r = fmtSensor(rsi);
    const f = fmtSensor(fund);

    lines.push(
      `| ${config.symbol} | ${config.timeframe} | ${report.metadata.totalCandles} | ${e.signals} | ${e.wr} | ${e.exp} | ${r.signals} | ${r.wr} | ${r.exp} | ${f.signals} | ${f.wr} | ${f.exp} | ${report.portfolio.totalSignals} | ${(report.portfolio.overallWinRate * 100).toFixed(1)}% | ${report.portfolio.overallExpectancy >= 0 ? '+' : ''}${report.portfolio.overallExpectancy.toFixed(4)}% |`
    );
  }

  // Regime breakdown
  lines.push('', '## Regime Breakdown', '');
  lines.push('| Symbol | TF | Sensor | Regime | Signals | WR | Expectancy |');
  lines.push('|--------|-----|--------|--------|---------|-----|------------|');

  for (const { config, report } of allReports) {
    for (const sensor of report.sensors) {
      for (const rb of sensor.regimeBreakdown) {
        if (rb.totalSignals > 0) {
          lines.push(
            `| ${config.symbol} | ${config.timeframe} | ${sensor.sensorId} | ${rb.regime} | ${rb.totalSignals} | ${(rb.winRate * 100).toFixed(1)}% | ${rb.expectancy >= 0 ? '+' : ''}${rb.expectancy.toFixed(4)}% |`
          );
        }
      }
    }
  }

  // Edge assessment
  lines.push('', '## Edge Assessment', '');
  lines.push('Sensors with positive expectancy are highlighted. A sensor needs:');
  lines.push('- Positive expectancy after fees (~0.1% round trip)');
  lines.push('- Sufficient sample size (>30 signals minimum, >50 preferred)');
  lines.push('- Consistency across regimes (not just trending OR ranging)');
  lines.push('');

  let hasEdge = false;
  for (const { config, report } of allReports) {
    for (const sensor of report.sensors) {
      if (sensor.stats.expectancy > 0.1 && sensor.stats.totalSignals >= 30) {
        lines.push(`- **${config.symbol} ${config.timeframe} ${sensor.sensorId}**: Expectancy ${sensor.stats.expectancy.toFixed(4)}% on ${sensor.stats.totalSignals} signals — POTENTIAL EDGE (needs fee adjustment)`);
        hasEdge = true;
      }
    }
  }

  if (!hasEdge) {
    lines.push('**No sensor showed reliable edge above fee threshold across sufficient sample size.**');
  }

  const summaryPath = join(resultsDir, 'SUMMARY.md');
  writeFileSync(summaryPath, lines.join('\n'));
  console.log(`\nSummary written to: ${summaryPath}`);
}

main().catch((err) => {
  console.error('Expanded backtest failed:', err);
  process.exit(1);
});
