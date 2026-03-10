/**
 * @module health.controller
 * @description Health check endpoint for system status monitoring.
 *
 * Returns:
 * - Service uptime
 * - Exchange connection status (future)
 * - Database connection status (future)
 * - Last sensor run timestamp (future)
 */

import { Controller, Get } from '@nestjs/common';

interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  uptime: number;
  timestamp: number;
}

@Controller('health')
export class HealthController {
  private readonly startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * GET /health
   *
   * Returns system health status.
   */
  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      uptime: Date.now() - this.startTime,
      timestamp: Date.now(),
    };
  }
}
