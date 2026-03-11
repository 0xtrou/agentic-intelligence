/**
 * @module discord-webhook.service
 * @description Posts signals to Discord with framework validation trace.
 *
 * Every signal shows:
 * - Direction, entry/TP/SL, R:R
 * - Detected regime (not assumed)
 * - Which sensors fired (with data) and which were silent (with reason)
 * - Framework trace: mispriced risk, thesis, kill condition
 * - Version + sequence number
 *
 * Traces to: #16 (operational visibility), #13 (every signal must name its mispriced risk)
 */

import { Injectable, Logger } from '@nestjs/common';
import { Signal, SignalDirection, SensorVote } from '@agentic-intelligence/core';

const BUILD_VERSION = process.env.BUILD_VERSION || 'dev';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

interface DiscordEmbed {
  title: string;
  description?: string;
  color: number;
  fields: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
  timestamp?: string;
}

interface DiscordWebhookPayload {
  content?: string;
  embeds: DiscordEmbed[];
}

@Injectable()
export class DiscordWebhookService {
  private readonly logger = new Logger(DiscordWebhookService.name);
  private signalSequence = 0;
  private lastPostTime = 0;
  private readonly RATE_LIMIT_MS = 60 * 1000; // 1 minute

  /**
   * Post a signal to Discord with full framework trace.
   */
  async postSignal(signal: Signal, sensorVotes: SensorVote[]): Promise<void> {
    if (!DISCORD_WEBHOOK_URL) {
      this.logger.warn('[Discord] DISCORD_WEBHOOK_URL not configured — skipping post');
      return;
    }

    // Rate limiting: max 1 signal per minute
    const now = Date.now();
    if (now - this.lastPostTime < this.RATE_LIMIT_MS) {
      this.logger.warn(`[Discord] Rate limited — skipping signal (last post ${Math.floor((now - this.lastPostTime) / 1000)}s ago)`);
      return;
    }

    this.signalSequence++;
    this.lastPostTime = now;

    try {
      const embed = this.buildSignalEmbed(signal, sensorVotes);
      const payload: DiscordWebhookPayload = {
        content: `🎯 **PAPER TRADE** — Signal #${this.signalSequence}`,
        embeds: [embed],
      };

      const response = await fetch(DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Discord API returned ${response.status}: ${response.statusText}`);
      }

      this.logger.log(`[Discord] Posted signal #${this.signalSequence} — ${signal.direction} ${signal.symbol}`);
    } catch (error: unknown) {
      this.logger.error(`[Discord] Failed to post signal: ${error instanceof Error ? error.message : String(error)}`);
      // Graceful degradation — don't crash the service
    }
  }

  private buildSignalEmbed(signal: Signal, allVotes: SensorVote[]): DiscordEmbed {
    const color = signal.direction === SignalDirection.LONG ? 0x00ff00 : 0xff0000; // Green for LONG, Red for SHORT
    const riskReward = this.calculateRR(signal);

    // Separate fired sensors from silent ones
    const firedSensors = signal.sensorVotes.map(v => v.sensorId);
    const silentSensors = allVotes.filter(v => !v.fire);

    const fields = [
      {
        name: '📊 Signal',
        value: `**${signal.direction}** ${signal.symbol} @ **$${signal.entry.toLocaleString()}**`,
        inline: false,
      },
      {
        name: '🎯 Targets',
        value: `TP: $${signal.tp.toLocaleString()}\nSL: $${signal.sl.toLocaleString()}\n**R:R ${riskReward.toFixed(2)}**`,
        inline: true,
      },
      {
        name: '🌊 Regime',
        value: `**${signal.regime}**\n${this.explainRegime(signal.regime)}`,
        inline: true,
      },
      {
        name: '✅ Sensors Fired',
        value: this.formatFiredSensors(signal.sensorVotes),
        inline: false,
      },
    ];

    // Add silent sensors if any
    if (silentSensors.length > 0) {
      fields.push({
        name: '🔇 Silent Sensors',
        value: this.formatSilentSensors(silentSensors),
        inline: false,
      });
    }

    // Framework trace
    fields.push({
      name: '🧪 Framework Trace',
      value: this.buildFrameworkTrace(signal),
      inline: false,
    });

    return {
      title: `${signal.direction === SignalDirection.LONG ? '📈' : '📉'} ${signal.symbol} — ${signal.timeframe}`,
      color,
      fields,
      footer: {
        text: `v${BUILD_VERSION} • Confidence: ${(signal.confidence * 100).toFixed(0)}% • #${this.signalSequence}`,
      },
      timestamp: new Date(signal.timestamp).toISOString(),
    };
  }

  private calculateRR(signal: Signal): number {
    const risk = Math.abs(signal.entry - signal.sl);
    const reward = Math.abs(signal.tp - signal.entry);
    return reward / risk;
  }

  private explainRegime(regime: string): string {
    const explanations: Record<string, string> = {
      TRENDING: 'High ATR → momentum continuation expected',
      RANGING: 'Low ATR → mean-reversion expected',
      UNKNOWN: 'Regime unclear → proceed with caution',
    };
    return explanations[regime] || '';
  }

  private formatFiredSensors(votes: SensorVote[]): string {
    return votes
      .map(v => {
        const emoji = v.sensorId.includes('ema') ? '📐' : '💸';
        const data = v.data ? ` (${this.summarizeData(v.data)})` : '';
        return `${emoji} **${v.sensorId}**${data}`;
      })
      .join('\n') || 'None';
  }

  private formatSilentSensors(votes: SensorVote[]): string {
    return votes
      .map(v => {
        const reason = v.data?.reason || 'condition not met';
        return `• ${v.sensorId}: ${reason}`;
      })
      .join('\n') || 'All sensors active';
  }

  private summarizeData(data: Record<string, any>): string {
    // Summarize sensor data for display
    if (data.ema_fast && data.ema_slow) {
      return `EMA ${Math.round(data.ema_fast)}/${Math.round(data.ema_slow)}`;
    }
    if (data.funding_rate !== undefined) {
      return `FR ${(data.funding_rate * 100).toFixed(3)}%`;
    }
    return Object.keys(data).slice(0, 2).join(', ');
  }

  private buildFrameworkTrace(signal: Signal): string {
    // Map sensor IDs to framework validations (gates #13-16)
    const traces: string[] = [];

    signal.sensorVotes.forEach(vote => {
      if (vote.sensorId.includes('ema')) {
        traces.push(
          `**EMA Cross (#13)**\n` +
          `• Risk: Market underprices momentum continuation\n` +
          `• Thesis: Fast EMA crossed slow → trend shift\n` +
          `• Kill: If win rate ≤ 50% after 20 trades (#15)`
        );
      }

      if (vote.sensorId.includes('funding')) {
        traces.push(
          `**Funding Extreme (#13)**\n` +
          `• Risk: Crowded position must unwind\n` +
          `• Thesis: Funding ${vote.data?.funding_rate > 0 ? 'longs' : 'shorts'} squeezed\n` +
          `• Kill: If win rate ≤ 50% after 20 trades (#15)`
        );
      }
    });

    if (signal.regime !== 'UNKNOWN') {
      traces.push(`**Regime Context (#14):** ${signal.regime}`);
    }

    traces.push(`**Constraints (#16):** 1% position size, REST polling feasible`);

    return traces.join('\n\n');
  }
}
