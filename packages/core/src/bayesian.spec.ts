/**
 * @file bayesian.spec.ts
 * @description Tests for Bayesian posterior update and credible interval calculation.
 */

import { describe, it, expect } from 'vitest';
import {
  updatePosterior,
  credibleInterval,
  shouldPromote,
  shouldKill,
  decayPosterior,
  PRIOR_ALPHA,
  PRIOR_BETA,
} from './bayesian';
import { BayesianPosterior } from './types';

describe('updatePosterior', () => {
  it('should increment alpha on win', () => {
    const prior: BayesianPosterior = { alpha: 3, beta: 3 };
    const updated = updatePosterior(prior, true);

    expect(updated.alpha).toBe(4);
    expect(updated.beta).toBe(3);
  });

  it('should increment beta on loss', () => {
    const prior: BayesianPosterior = { alpha: 3, beta: 3 };
    const updated = updatePosterior(prior, false);

    expect(updated.alpha).toBe(3);
    expect(updated.beta).toBe(4);
  });

  it('should chain updates correctly', () => {
    let posterior: BayesianPosterior = { alpha: PRIOR_ALPHA, beta: PRIOR_BETA };

    // 7 wins, 3 losses
    posterior = updatePosterior(posterior, true);  // 4, 3
    posterior = updatePosterior(posterior, true);  // 5, 3
    posterior = updatePosterior(posterior, true);  // 6, 3
    posterior = updatePosterior(posterior, false); // 6, 4
    posterior = updatePosterior(posterior, true);  // 7, 4
    posterior = updatePosterior(posterior, false); // 7, 5
    posterior = updatePosterior(posterior, true);  // 8, 5
    posterior = updatePosterior(posterior, true);  // 9, 5
    posterior = updatePosterior(posterior, false); // 9, 6
    posterior = updatePosterior(posterior, true);  // 10, 6

    expect(posterior.alpha).toBe(10); // 3 + 7 wins
    expect(posterior.beta).toBe(6);   // 3 + 3 losses
  });
});

describe('credibleInterval', () => {
  it('should return wide interval for small n', () => {
    const posterior: BayesianPosterior = { alpha: 4, beta: 3 }; // n=7
    const ci = credibleInterval(posterior, 0.8);

    expect(ci.lower).toBe(0);
    expect(ci.upper).toBe(1);
    expect(ci.mean).toBeCloseTo(4 / 7, 2);
  });

  it('should narrow interval as n increases', () => {
    const posterior: BayesianPosterior = { alpha: 60, beta: 40 }; // 60% win rate, n=100
    const ci = credibleInterval(posterior, 0.8);

    expect(ci.mean).toBeCloseTo(0.6, 2);
    expect(ci.lower).toBeGreaterThan(0.5); // Should be confident it's > 50%
    expect(ci.upper).toBeLessThan(0.7);
    expect(ci.upper - ci.lower).toBeLessThan(0.2); // Narrow interval
  });

  it('should compute mean correctly', () => {
    const posterior: BayesianPosterior = { alpha: 10, beta: 10 };
    const ci = credibleInterval(posterior);

    expect(ci.mean).toBe(0.5); // Exactly 50/50
  });

  it('should respect credibility level', () => {
    const posterior: BayesianPosterior = { alpha: 50, beta: 50 };
    const ci80 = credibleInterval(posterior, 0.8);
    const ci95 = credibleInterval(posterior, 0.95);

    // 95% CI should be wider than 80% CI
    expect(ci95.upper - ci95.lower).toBeGreaterThan(ci80.upper - ci80.lower);
  });
});

describe('shouldPromote', () => {
  it('should not promote with n < 10', () => {
    const posterior: BayesianPosterior = { alpha: 6, beta: 1 }; // 6/7 = 85% win rate, but n=7
    expect(shouldPromote(posterior)).toBe(false);
  });

  it('should promote when n ≥ 10 and lower CI > 0.5', () => {
    const posterior: BayesianPosterior = { alpha: 10, beta: 3 }; // 10/13 ≈ 77%, n=13
    expect(shouldPromote(posterior)).toBe(true);
  });

  it('should not promote when lower CI ≤ 0.5', () => {
    const posterior: BayesianPosterior = { alpha: 8, beta: 7 }; // 8/15 ≈ 53%, n=15
    expect(shouldPromote(posterior)).toBe(false);
  });

  it('should not promote coin flip', () => {
    const posterior: BayesianPosterior = { alpha: 10, beta: 10 }; // 50%, n=20
    expect(shouldPromote(posterior)).toBe(false);
  });
});

describe('shouldKill', () => {
  it('should not kill with n < 20', () => {
    const posterior: BayesianPosterior = { alpha: 5, beta: 10 }; // 33% win rate, but n=15
    expect(shouldKill(posterior)).toBe(false);
  });

  it('should kill when n ≥ 20 and lower CI ≤ 0.5', () => {
    const posterior: BayesianPosterior = { alpha: 8, beta: 15 }; // 8/23 ≈ 35%, n=23
    expect(shouldKill(posterior)).toBe(true);
  });

  it('should not kill when lower CI > 0.5', () => {
    const posterior: BayesianPosterior = { alpha: 15, beta: 8 }; // 15/23 ≈ 65%, n=23
    expect(shouldKill(posterior)).toBe(false);
  });

  it('should kill coin flip with n ≥ 20', () => {
    const posterior: BayesianPosterior = { alpha: 20, beta: 20 }; // 50%, n=40
    expect(shouldKill(posterior)).toBe(true);
  });
});

describe('decayPosterior', () => {
  it('should compress posterior toward prior by 50%', () => {
    const posterior: BayesianPosterior = { alpha: 23, beta: 7 }; // Strong evidence (23/30 ≈ 77%)
    const decayed = decayPosterior(posterior, 0.5);

    // Alpha: 3 + (23 - 3) * 0.5 = 3 + 10 = 13
    // Beta:  3 + (7 - 3) * 0.5 = 3 + 2 = 5
    expect(decayed.alpha).toBeCloseTo(13, 1);
    expect(decayed.beta).toBeCloseTo(5, 1);
  });

  it('should fully reset when decay factor = 0', () => {
    const posterior: BayesianPosterior = { alpha: 50, beta: 10 };
    const decayed = decayPosterior(posterior, 0);

    expect(decayed.alpha).toBe(PRIOR_ALPHA);
    expect(decayed.beta).toBe(PRIOR_BETA);
  });

  it('should not change posterior when decay factor = 1', () => {
    const posterior: BayesianPosterior = { alpha: 15, beta: 5 };
    const decayed = decayPosterior(posterior, 1);

    expect(decayed.alpha).toBe(posterior.alpha);
    expect(decayed.beta).toBe(posterior.beta);
  });

  it('should preserve prior when decaying prior', () => {
    const posterior: BayesianPosterior = { alpha: PRIOR_ALPHA, beta: PRIOR_BETA };
    const decayed = decayPosterior(posterior, 0.5);

    expect(decayed.alpha).toBe(PRIOR_ALPHA);
    expect(decayed.beta).toBe(PRIOR_BETA);
  });
});
