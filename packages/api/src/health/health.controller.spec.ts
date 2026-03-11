/**
 * @file health.controller.spec.ts
 * @description Tests for health check endpoint.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(() => {
    controller = new HealthController();
  });

  it('should return status ok', () => {
    const response = controller.check();
    expect(response.status).toBe('ok');
  });

  it('should return version string', () => {
    const response = controller.check();
    expect(typeof response.version).toBe('string');
    expect(response.version.length).toBeGreaterThan(0);
  });

  it('should return uptime', () => {
    const response = controller.check();
    expect(response.uptime).toBeGreaterThanOrEqual(0);
  });

  it('should return current timestamp', () => {
    const before = Date.now();
    const response = controller.check();
    const after = Date.now();

    expect(response.timestamp).toBeGreaterThanOrEqual(before);
    expect(response.timestamp).toBeLessThanOrEqual(after);
  });

  it('should increment uptime on subsequent calls', async () => {
    const first = controller.check();
    
    // Wait 10ms
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const second = controller.check();

    expect(second.uptime).toBeGreaterThan(first.uptime);
  });
});
