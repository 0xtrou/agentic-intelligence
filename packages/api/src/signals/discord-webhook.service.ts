/**
 * @module discord-webhook.service
 * @description Posts formatted signal messages to Discord via webhook.
 */

import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class DiscordWebhookService {
  private readonly logger = new Logger(DiscordWebhookService.name);
  private readonly webhookUrl: string;

  constructor() {
    const url = process.env.DISCORD_WEBHOOK_URL;
    if (!url) {
      throw new Error('DISCORD_WEBHOOK_URL is required');
    }
    this.webhookUrl = url;
  }

  /**
   * Post a formatted signal embed to Discord.
   */
  async postSignal(signal: {
    symbol: string;
    direction: 'LONG' | 'SHORT';
    entry: number;
    tp: number;
    sl: number;
    timeframe: string;
    confidence: number;
    sensors: string[];
    regime: string;
    mentions?: string[];
  }): Promise<void> {
    const dirEmoji = signal.direction === 'LONG' ? '🟢' : '🔴';
    const regimeEmoji = signal.regime === 'TRENDING' ? '📈' : signal.regime === 'RANGING' ? '↔️' : '❓';
    const confBar = '█'.repeat(Math.round(signal.confidence * 10)) + '░'.repeat(10 - Math.round(signal.confidence * 10));

    const riskReward = Math.abs(signal.tp - signal.entry) / Math.abs(signal.entry - signal.sl);

    const embed = {
      title: `${dirEmoji} ${signal.direction} ${signal.symbol}`,
      color: signal.direction === 'LONG' ? 0x00ff88 : 0xff4444,
      fields: [
        { name: 'Entry', value: `\`${signal.entry}\``, inline: true },
        { name: 'Take Profit', value: `\`${signal.tp}\``, inline: true },
        { name: 'Stop Loss', value: `\`${signal.sl}\``, inline: true },
        { name: 'Timeframe', value: signal.timeframe, inline: true },
        { name: 'R:R', value: `\`${riskReward.toFixed(2)}\``, inline: true },
        { name: 'Regime', value: `${regimeEmoji} ${signal.regime}`, inline: true },
        { name: 'Confidence', value: `\`${confBar}\` ${(signal.confidence * 100).toFixed(0)}%`, inline: false },
        { name: 'Sensors', value: signal.sensors.map(s => `• ${s}`).join('\n'), inline: false },
      ],
      footer: { text: 'Agentic Intelligence • Signal Pipeline' },
      timestamp: new Date().toISOString(),
    };

    const mentionText = signal.mentions?.length
      ? signal.mentions.join(' ') + ' — new signal fired'
      : '';

    const body = JSON.stringify({
      content: mentionText || undefined,
      embeds: [embed],
      allowed_mentions: { parse: ['users'] },
    });

    const res = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Discord webhook failed: ${res.status} ${text}`);
      throw new Error(`Discord webhook failed: ${res.status}`);
    }

    this.logger.log(`Signal posted to Discord: ${signal.direction} ${signal.symbol}`);
  }
}
