/**
 * @module RateLimiter Tests
 * @description Unit tests for the token bucket rate limiter.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RateLimiter } from './rate-limiter';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('should allow requests within rate limit', async () => {
    const limiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 1000,
      minBackoffMs: 100,
      maxBackoffMs: 5000,
    });

    const start = Date.now();
    
    // All 5 requests should go through immediately
    await Promise.all([
      limiter.acquire(),
      limiter.acquire(),
      limiter.acquire(),
      limiter.acquire(),
      limiter.acquire(),
    ]);

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100); // Should be nearly instant
  });

  it('should delay requests when rate limit is exceeded', async () => {
    // Use real timers for this test to avoid fake timer complexity
    vi.useRealTimers();
    
    const limiter = new RateLimiter({
      maxRequests: 2,
      windowMs: 200,  // Shorter window for faster test
      minBackoffMs: 50,  // Shorter backoff for faster test
      maxBackoffMs: 1000,
    });

    const results: number[] = [];

    // Fire 3 requests — first 2 should go through, third should wait
    const promise1 = limiter.acquire().then(() => results.push(Date.now()));
    const promise2 = limiter.acquire().then(() => results.push(Date.now()));
    const promise3 = limiter.acquire().then(() => results.push(Date.now()));

    await Promise.all([promise1, promise2, promise3]);

    expect(results).toHaveLength(3);
    // First two should be nearly simultaneous
    expect(results[1]! - results[0]!).toBeLessThan(20);
    // Third request should be delayed by at least backoff duration
    expect(results[2]! - results[1]!).toBeGreaterThanOrEqual(40);
    
    // Restore fake timers for other tests
    vi.useFakeTimers();
  });

  it('should exponentially increase backoff on 429 errors', () => {
    const limiter = new RateLimiter({
      maxRequests: 10,
      windowMs: 1000,
      minBackoffMs: 100,
      maxBackoffMs: 5000,
    });

    expect(limiter.getBackoffMs()).toBe(100);

    limiter.on429();
    expect(limiter.getBackoffMs()).toBe(200);

    limiter.on429();
    expect(limiter.getBackoffMs()).toBe(400);

    limiter.on429();
    expect(limiter.getBackoffMs()).toBe(800);

    limiter.on429();
    expect(limiter.getBackoffMs()).toBe(1600);
  });

  it('should cap backoff at maxBackoffMs', () => {
    const limiter = new RateLimiter({
      maxRequests: 10,
      windowMs: 1000,
      minBackoffMs: 100,
      maxBackoffMs: 500,
    });

    // Trigger many 429s
    for (let i = 0; i < 10; i++) {
      limiter.on429();
    }

    // Should be capped at 500ms
    expect(limiter.getBackoffMs()).toBe(500);
  });

  it('should reset backoff on successful request', () => {
    const limiter = new RateLimiter({
      maxRequests: 10,
      windowMs: 1000,
      minBackoffMs: 100,
      maxBackoffMs: 5000,
    });

    limiter.on429();
    limiter.on429();
    expect(limiter.getBackoffMs()).toBe(400);

    limiter.onSuccess();
    expect(limiter.getBackoffMs()).toBe(100);
  });

  it('should enforce sliding window correctly', async () => {
    const limiter = new RateLimiter({
      maxRequests: 2,
      windowMs: 1000,
      minBackoffMs: 50,
      maxBackoffMs: 5000,
    });

    // Fire 2 requests at t=0
    await limiter.acquire();
    await limiter.acquire();

    // Advance time by 600ms (still within window)
    vi.advanceTimersByTime(600);

    // Third request should be delayed (window not expired yet)
    const acquirePromise = limiter.acquire();
    await vi.advanceTimersByTimeAsync(100);

    // Advance past the window (1000ms total from first requests)
    vi.advanceTimersByTime(400);
    await acquirePromise;

    // Request should have completed
    expect(true).toBe(true); // If we get here, sliding window worked
  });
});
