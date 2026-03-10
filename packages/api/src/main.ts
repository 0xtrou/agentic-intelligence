/**
 * @module main
 * @description Application entry point.
 *
 * Bootstraps the NestJS application and starts the HTTP server.
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

const PORT = process.env.PORT || 3000;

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // Enable CORS for development
  app.enableCors();

  await app.listen(PORT);

  console.log(`🧠 Agentic Intelligence API running on http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
}

bootstrap();
