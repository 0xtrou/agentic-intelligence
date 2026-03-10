/**
 * @module signals.controller
 * @description Webhook endpoint for trading signals.
 *
 * POST /signals — Receives a signal payload and posts it to Discord.
 * GET  /signals — Returns recent signals (in-memory for now).
 */

import { Controller, Post, Get, Body, Logger } from '@nestjs/common';
import { DiscordWebhookService } from './discord-webhook.service';

interface SignalPayload {
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
}

@Controller('signals')
export class SignalsController {
  private readonly logger = new Logger(SignalsController.name);
  private readonly recentSignals: (SignalPayload & { timestamp: string })[] = [];

  constructor(private readonly discord: DiscordWebhookService) {}

  /**
   * POST /signals
   *
   * Receives a signal, stores it, and posts to Discord.
   */
  @Post()
  async receiveSignal(@Body() payload: SignalPayload) {
    this.logger.log(`Signal received: ${payload.direction} ${payload.symbol}`);

    const timestamped = { ...payload, timestamp: new Date().toISOString() };
    this.recentSignals.unshift(timestamped);
    if (this.recentSignals.length > 50) this.recentSignals.pop();

    await this.discord.postSignal(payload);

    return { ok: true, signal: timestamped };
  }

  /**
   * GET /signals
   *
   * Returns recent signals (last 50, in-memory).
   */
  @Get()
  listSignals() {
    return { signals: this.recentSignals };
  }
}
