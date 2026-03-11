#!/usr/bin/env node
/**
 * @module signal-feed
 * @description Autonomous signal feed — generates mock signals every 5 minutes
 * and posts to Discord via webhook. No AI tokens used.
 *
 * Usage: DISCORD_WEBHOOK_URL=... node signal-feed.js
 *        DISCORD_WEBHOOK_URL=... INTERVAL_MS=300000 node signal-feed.js
 */

const { execSync } = require('child_process');
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// Git-based version: <tag>.<short-hash>
function getVersion() {
  try {
    const tag = execSync('git describe --tags --abbrev=0', { cwd: __dirname + '/..', encoding: 'utf8' }).trim();
    const hash = execSync('git rev-parse --short HEAD', { cwd: __dirname + '/..', encoding: 'utf8' }).trim();
    return `${tag}.${hash}`;
  } catch {
    return 'unknown';
  }
}
const VERSION = getVersion();
const INTERVAL_MS = parseInt(process.env.INTERVAL_MS || '300000', 10); // 5 min default
const SISYPHUS_ID = '1480920403965771926';
const ANIMUS_ID = '1480919685456330932';

if (!WEBHOOK_URL) {
  console.error('DISCORD_WEBHOOK_URL is required');
  process.exit(1);
}

// --- Live price fetch ---
async function fetchBTCPrice() {
  try {
    const res = await fetch('https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT');
    const data = await res.json();
    const ticker = data.result.list[0];
    return {
      price: parseFloat(ticker.lastPrice),
      high24h: parseFloat(ticker.highPrice24h),
      low24h: parseFloat(ticker.lowPrice24h),
      volume24h: parseFloat(ticker.volume24h),
    };
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Price fetch failed:`, err.message);
    return null;
  }
}

// --- State ---
let trend = Math.random() > 0.5 ? 1 : -1;
let trendStrength = 0.3 + Math.random() * 0.7;

const SENSORS = [
  { name: 'EMA Cross (21/55)', weight: 0.3 },
  { name: 'Volume Spike Filter', weight: 0.15 },
  { name: 'Funding Rate Bias', weight: 0.2 },
  { name: 'OI Delta Divergence', weight: 0.2 },
  { name: 'RSI Momentum', weight: 0.15 },
];

const TIMEFRAMES = ['4h', '6h', '12h', '1d'];
const REGIMES = ['TRENDING', 'RANGING'];

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

async function generateSignal() {
  const market = await fetchBTCPrice();
  if (!market) return null;

  // Occasionally flip simulated trend bias
  if (Math.random() < 0.15) {
    trend *= -1;
    trendStrength = 0.3 + Math.random() * 0.7;
  }

  const direction = trend > 0 ? 'LONG' : 'SHORT';
  const entry = market.price;

  const riskPct = 0.01 + Math.random() * 0.02; // 1-3% risk
  const rrRatio = 1.2 + Math.random() * 2.3; // 1.2 - 3.5 R:R

  const sl = direction === 'LONG'
    ? Math.round((entry * (1 - riskPct)) * 100) / 100
    : Math.round((entry * (1 + riskPct)) * 100) / 100;

  const tp = direction === 'LONG'
    ? Math.round((entry + (entry - sl) * rrRatio) * 100) / 100
    : Math.round((entry - (sl - entry) * rrRatio) * 100) / 100;

  // Pick 2-4 sensors that "fired"
  const shuffled = [...SENSORS].sort(() => Math.random() - 0.5);
  const activeSensors = shuffled.slice(0, 2 + Math.floor(Math.random() * 3));
  const confidence = clamp(
    activeSensors.reduce((s, se) => s + se.weight, 0) + (Math.random() * 0.2 - 0.1),
    0.35, 0.95
  );

  const timeframe = randomFrom(TIMEFRAMES);
  const regime = trendStrength > 0.5 ? 'TRENDING' : 'RANGING';

  return {
    symbol: 'BTCUSDT',
    direction,
    entry,
    tp,
    sl,
    timeframe,
    confidence: Math.round(confidence * 100) / 100,
    sensors: activeSensors.map(s => s.name),
    regime,
  };
}

function formatEmbed(signal) {
  const dirEmoji = signal.direction === 'LONG' ? '🟢' : '🔴';
  const regimeEmoji = signal.regime === 'TRENDING' ? '📈' : signal.regime === 'RANGING' ? '↔️' : '❓';
  const confBar = '█'.repeat(Math.round(signal.confidence * 10)) + '░'.repeat(10 - Math.round(signal.confidence * 10));
  const rr = Math.abs(signal.tp - signal.entry) / Math.abs(signal.entry - signal.sl);

  return {
    content: `<@${SISYPHUS_ID}> <@${ANIMUS_ID}> — new signal fired`,
    embeds: [{
      title: `${dirEmoji} ${signal.direction} ${signal.symbol}`,
      color: signal.direction === 'LONG' ? 0x00ff88 : 0xff4444,
      fields: [
        { name: 'Entry', value: `\`${signal.entry}\``, inline: true },
        { name: 'Take Profit', value: `\`${signal.tp}\``, inline: true },
        { name: 'Stop Loss', value: `\`${signal.sl}\``, inline: true },
        { name: 'Timeframe', value: signal.timeframe, inline: true },
        { name: 'R:R', value: `\`${rr.toFixed(2)}\``, inline: true },
        { name: 'Regime', value: `${regimeEmoji} ${signal.regime}`, inline: true },
        { name: 'Confidence', value: `\`${confBar}\` ${(signal.confidence * 100).toFixed(0)}%`, inline: false },
        { name: 'Sensors', value: signal.sensors.map(s => `• ${s}`).join('\n'), inline: false },
        { name: '🕐 Time', value: `<t:${Math.floor(Date.now() / 1000)}:F> (<t:${Math.floor(Date.now() / 1000)}:R>)`, inline: false },
      ],
      footer: { text: `Agentic Intelligence ${VERSION} • Signal Pipeline` },
      timestamp: new Date().toISOString(),
    }],
    allowed_mentions: { parse: ['users'] },
  };
}

const MIN_CONFIDENCE = 0.60; // Don't post below 60%

async function postSignal() {
  const signal = await generateSignal();
  if (!signal) {
    console.error(`[${new Date().toISOString()}] Skipped — no market data`);
    return;
  }
  if (signal.confidence < MIN_CONFIDENCE) {
    console.log(`[${new Date().toISOString()}] Skipped: ${signal.direction} ${signal.symbol} — confidence ${(signal.confidence * 100).toFixed(0)}% < ${MIN_CONFIDENCE * 100}% threshold`);
    return;
  }
  const body = formatEmbed(signal);

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      console.log(`[${new Date().toISOString()}] Posted: ${signal.direction} ${signal.symbol} @ ${signal.entry} (${signal.confidence * 100}%)`);
    } else {
      const text = await res.text();
      console.error(`[${new Date().toISOString()}] Webhook error ${res.status}: ${text}`);
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Fetch error:`, err.message);
  }
}

// Fire immediately, then every INTERVAL_MS
console.log(`Signal feed started. Interval: ${INTERVAL_MS / 1000}s`);
postSignal();
setInterval(postSignal, INTERVAL_MS);
