/**
 * @module bayesian
 * @description Bayesian posterior update and credible interval calculation for sensor lifecycle.
 *
 * Uses Beta distribution to model win rate uncertainty:
 * - Prior: Beta(3,3) — assumes coin flip until proven otherwise
 * - Update: Alpha += 1 on win, Beta += 1 on loss
 * - Promotion: Lower 80% CI > 0.5 after n ≥ 10
 * - Kill: n ≥ 20 and lower 80% CI of EV ≤ 0
 * - Decay: Compress posterior 50% toward prior every 90 days
 */

import { BayesianPosterior, CredibleInterval } from './types';

/** Prior: Beta(3,3) — weakly informative, centered at 0.5 */
export const PRIOR_ALPHA = 3;
export const PRIOR_BETA = 3;

/**
 * Update posterior after a trade outcome.
 *
 * @param posterior - Current Beta(alpha, beta) posterior
 * @param win - True if the trade was a win, false if loss
 * @returns Updated posterior
 */
export function updatePosterior(
  posterior: BayesianPosterior,
  win: boolean,
): BayesianPosterior {
  return {
    alpha: posterior.alpha + (win ? 1 : 0),
    beta: posterior.beta + (win ? 0 : 1),
  };
}

/**
 * Compute credible interval for win rate using Beta quantile approximation.
 *
 * Uses normal approximation to Beta quantiles for computational speed.
 * Exact Beta quantile would require numerical integration or gamma functions.
 *
 * @param posterior - Beta(alpha, beta) posterior
 * @param credibility - Credibility level (default 0.8 for 80% CI)
 * @returns Lower bound, upper bound, and mean of the credible interval
 */
export function credibleInterval(
  posterior: BayesianPosterior,
  credibility: number = 0.8,
): CredibleInterval {
  const { alpha, beta } = posterior;
  const n = alpha + beta;
  const mean = alpha / n;

  // For small n, return wide interval
  if (n < 10) {
    return { lower: 0, upper: 1, mean };
  }

  // Normal approximation to Beta distribution
  // Variance of Beta(α, β) = (αβ) / [(α+β)²(α+β+1)]
  const variance = (alpha * beta) / (n * n * (n + 1));
  const stdDev = Math.sqrt(variance);

  // Z-score for credibility level (0.8 → 1.28, 0.95 → 1.96)
  const z = normalQuantile((1 + credibility) / 2);

  const lower = Math.max(0, mean - z * stdDev);
  const upper = Math.min(1, mean + z * stdDev);

  return { lower, upper, mean };
}

/**
 * Approximate normal quantile (inverse CDF) using Abramowitz & Stegun approximation.
 *
 * Good enough for credible interval calculation. Exact quantiles not needed.
 *
 * @param p - Cumulative probability (0 < p < 1)
 * @returns Z-score corresponding to p
 */
function normalQuantile(p: number): number {
  if (p <= 0 || p >= 1) {
    throw new Error('p must be between 0 and 1');
  }

  // Coefficients for Abramowitz & Stegun approximation
  const c = [2.515517, 0.802853, 0.010328];
  const d = [1.432788, 0.189269, 0.001308];

  const t = Math.sqrt(-2 * Math.log(Math.min(p, 1 - p)));
  const numerator = c[0] + c[1] * t + c[2] * t * t;
  const denominator = 1 + d[0] * t + d[1] * t * t + d[2] * t * t * t;

  const z = t - numerator / denominator;

  return p < 0.5 ? -z : z;
}

/**
 * Check if a sensor should be promoted from PROBATION to ACTIVE.
 *
 * Criteria:
 * - n ≥ 10 trades
 * - Lower 80% CI of win rate > 0.5
 *
 * @param posterior - Beta(alpha, beta) posterior
 * @returns True if sensor should be promoted
 */
export function shouldPromote(posterior: BayesianPosterior): boolean {
  const n = posterior.alpha + posterior.beta;
  if (n < 10) return false;

  const ci = credibleInterval(posterior, 0.8);
  return ci.lower > 0.5;
}

/**
 * Check if a sensor should be killed.
 *
 * Criteria:
 * - n ≥ 20 trades AND lower 80% CI of expected value ≤ 0
 * - OR no signal in 60 days (checked elsewhere)
 *
 * Expected value = win_rate * avg_win - (1 - win_rate) * avg_loss
 * For kill logic, we simplify: assume avg_win ≈ avg_loss, so EV = 2*win_rate - 1
 * EV ≤ 0 when win_rate ≤ 0.5
 *
 * @param posterior - Beta(alpha, beta) posterior
 * @returns True if sensor should be killed
 */
export function shouldKill(posterior: BayesianPosterior): boolean {
  const n = posterior.alpha + posterior.beta;
  if (n < 20) return false;

  const ci = credibleInterval(posterior, 0.8);
  // Kill if lower bound of win rate ≤ 0.5 (no edge)
  return ci.lower <= 0.5;
}

/**
 * Decay posterior toward prior.
 *
 * Compresses posterior 50% toward prior — markets change,
 * a sensor that worked 6 months ago may not work now.
 *
 * @param posterior - Current Beta(alpha, beta) posterior
 * @param decayFactor - Fraction to compress toward prior (default 0.5)
 * @returns Decayed posterior
 */
export function decayPosterior(
  posterior: BayesianPosterior,
  decayFactor: number = 0.5,
): BayesianPosterior {
  return {
    alpha: PRIOR_ALPHA + (posterior.alpha - PRIOR_ALPHA) * decayFactor,
    beta: PRIOR_BETA + (posterior.beta - PRIOR_BETA) * decayFactor,
  };
}
