/**
 * @module health.controller
 * @description Health check endpoint for system status monitoring.
 *
 * Returns:
 * - Service version (git tag + commit)
 * - Service uptime
 * - Exchange connection status (future)
 * - Database connection status (future)
 * - Last sensor run timestamp (future)
 */

import { Controller, Get } from '@nestjs/common';

interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  uptime: number;
  timestamp: number;
}

/** Injected at build time via BUILD_VERSION env, falls back to 'dev' */
const BUILD_VERSION = process.env.BUILD_VERSION || 'dev';

@Controller('health')
export class HealthController {
  private readonly startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * GET /health
   *
   * Returns system health status including running version.
   */
  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      version: BUILD_VERSION,
      uptime: Date.now() - this.startTime,
      timestamp: Date.now(),
    };
  }
}
