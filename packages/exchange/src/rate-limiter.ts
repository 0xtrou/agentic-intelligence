/**
 * @module RateLimiter
 * @description Token bucket rate limiter with exponential backoff for API requests.
 *
 * Bybit V5 rate limits vary by endpoint tier. This limiter:
 * - Tracks requests per sliding window
 * - Enforces max requests per time window
 * - Implements exponential backoff on 429 responses
 * - Thread-safe via promise queue
 */

export interface RateLimiterConfig {
  maxRequests: number;  // Max requests per window
  windowMs: number;     // Time window in milliseconds
  minBackoffMs: number; // Initial backoff delay
  maxBackoffMs: number; // Maximum backoff delay
}

interface Request {
  timestamp: number;
  resolve: () => void;
}

/**
 * Token bucket rate limiter with exponential backoff.
 *
 * Tracks requests in a sliding window and enforces rate limits.
 * When rate limit is hit, delays subsequent requests with exponential backoff.
 */
export class RateLimiter {
  private readonly config: RateLimiterConfig;
  private requests: number[] = []; // Timestamps of recent requests
  private backoffMs: number;
  private queue: Request[] = [];
  private processing = false;

  constructor(config: RateLimiterConfig) {
    this.config = config;
    this.backoffMs = config.minBackoffMs;
  }

  /**
   * Acquire permission to make a request.
   * Blocks until rate limit allows the request.
   *
   * @returns Promise that resolves when the request can proceed
   */
  async acquire(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.queue.push({ timestamp: Date.now(), resolve });
      this.processQueue();
    });
  }

  /**
   * Notify the limiter that a request received a 429 response.
   * Triggers exponential backoff.
   */
  on429(): void {
    // Double the backoff, up to max
    this.backoffMs = Math.min(this.backoffMs * 2, this.config.maxBackoffMs);
  }

  /**
   * Notify the limiter that a request succeeded.
   * Resets backoff on success.
   */
  onSuccess(): void {
    this.backoffMs = this.config.minBackoffMs;
  }

  /**
   * Process the request queue with rate limiting.
   */
  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      
      // Remove requests outside the sliding window
      this.requests = this.requests.filter(
        (ts) => now - ts < this.config.windowMs
      );

      // Check if we can make a request
      if (this.requests.length < this.config.maxRequests) {
        const request = this.queue.shift();
        if (request) {
          this.requests.push(now);
          request.resolve();
        }
      } else {
        // Rate limit hit — wait for backoff duration
        await this.sleep(this.backoffMs);
      }
    }

    this.processing = false;
  }

  /**
   * Sleep for the specified duration.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current backoff delay in milliseconds.
   * Useful for monitoring rate limit pressure.
   *
   * @returns Current backoff delay
   */
  getBackoffMs(): number {
    return this.backoffMs;
  }
}
