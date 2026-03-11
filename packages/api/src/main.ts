/**
 * @module main
 * @description Application entry point.
 *
 * Bootstraps the NestJS application and starts the HTTP server.
 * Sends Discord webhook notifications on startup and shutdown.
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

const PORT = process.env.PORT || 3000;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const BUILD_VERSION = process.env.BUILD_VERSION || 'dev';
const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Send a Discord webhook embed. Fire-and-forget with timeout.
 * Never throws — logs warnings on failure.
 */
async function sendDiscordNotification(
  embed: Record<string, unknown>,
  timeoutMs = 5000,
): Promise<void> {
  if (!DISCORD_WEBHOOK_URL) {
    console.warn('⚠️  DISCORD_WEBHOOK_URL not set — skipping Discord notification');
    return;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      console.warn(`⚠️  Discord webhook returned ${response.status}: ${response.statusText}`);
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`⚠️  Discord notification failed: ${msg}`);
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // Enable CORS for development
  app.enableCors();

  // Enable shutdown hooks so we can notify on SIGTERM/SIGINT
  app.enableShutdownHooks();

  await app.listen(PORT);

  console.log(`🧠 Agentic Intelligence API running on http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);

  // --- Startup notification ---
  const bootTime = new Date().toISOString();
  await sendDiscordNotification({
    title: '🚀 Backend Deployed',
    color: 0x3498db,
    fields: [
      { name: 'Version', value: BUILD_VERSION, inline: true },
      { name: 'Port', value: String(PORT), inline: true },
      { name: 'Environment', value: NODE_ENV, inline: true },
      { name: 'Timestamp', value: bootTime, inline: false },
    ],
    footer: { text: 'Agentic Intelligence — Autonomous Loop' },
    timestamp: bootTime,
  });

  // --- Shutdown notification ---
  const shutdownHandler = async () => {
    console.log('🛑 Shutdown signal received — notifying Discord...');
    await sendDiscordNotification(
      {
        title: '⚠️ Backend Shutting Down',
        color: 0xe67e22,
        fields: [
          { name: 'Version', value: BUILD_VERSION, inline: true },
          { name: 'Environment', value: NODE_ENV, inline: true },
          { name: 'Uptime', value: `${Math.floor(process.uptime())}s`, inline: true },
        ],
        footer: { text: 'Agentic Intelligence — Autonomous Loop' },
        timestamp: new Date().toISOString(),
      },
      3000, // shorter timeout — don't block shutdown
    );
  };

  process.on('SIGTERM', shutdownHandler);
  process.on('SIGINT', shutdownHandler);
}

bootstrap();
