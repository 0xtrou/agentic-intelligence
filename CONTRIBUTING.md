# Contributing — Development Pipeline

## Branch Strategy

```
main          ← always runnable, always green
  └── feat/*  ← feature branches
  └── fix/*   ← bug fixes
  └── chore/* ← tooling, CI, docs
```

**No direct commits to main.** Everything goes through a PR.

## Semantic Versioning

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add funding rate sensor          → minor bump (0.1.0 → 0.2.0)
fix: correct EMA calculation           → patch bump (0.2.0 → 0.2.1)
feat!: redesign signal schema          → major bump (0.2.1 → 1.0.0)
chore: update dependencies             → no bump
docs: update API documentation         → no bump
test: add brain aggregation tests      → no bump
refactor: simplify sensor registry     → no bump
```

Format: `type(scope): description`

```
feat(sensors): add funding rate divergence sensor
fix(exchange): handle Bybit rate limit 429 correctly
test(brain): add Bayesian posterior update tests
docs(api): document /signals endpoint response schema
```

## PR Requirements

Before a PR is merged:

1. **All tests pass** — `pnpm test` green
2. **No build errors** — `pnpm build` clean
3. **No type errors** — strict TypeScript, zero `any`
4. **Code documented** — every function, every module, line-by-line where logic is non-obvious
5. **Conventional commit message** — for semantic release

## Code Documentation Standard

Every file starts with a module doc comment:

```typescript
/**
 * @module EmaCrossSensor
 * @description Detects EMA crossover events as directional signals.
 *
 * Thesis: When the fast EMA crosses the slow EMA, it indicates
 * a shift in short-term momentum relative to the longer trend.
 *
 * This sensor fires:
 *   - vote=1, direction=LONG when fast crosses above slow
 *   - vote=1, direction=SHORT when fast crosses below slow
 *   - vote=0 when no crossover detected
 */
```

Every function documents its purpose, params, and return:

```typescript
/**
 * Calculate the Exponential Moving Average for a series of candle closes.
 *
 * Uses the standard EMA formula:
 *   EMA_today = close * multiplier + EMA_yesterday * (1 - multiplier)
 *   where multiplier = 2 / (period + 1)
 *
 * @param candles - Array of Candle objects, ordered oldest to newest
 * @param period - Number of periods for the EMA (e.g., 9, 21, 50)
 * @returns Array of EMA values, same length as input (NaN for insufficient data)
 */
```

Non-obvious logic gets inline comments:

```typescript
// Compress posterior 50% toward prior — markets change,
// a sensor that worked 6 months ago may not work now.
// This prevents stale high-confidence sensors from dominating.
const decayedAlpha = PRIOR_ALPHA + (record.alpha - PRIOR_ALPHA) * 0.5;
```

## Testing Standard

**TDD. Tests first. Then implementation.**

```
packages/
  core/
    src/
      bayesian.ts
      bayesian.spec.ts     ← test file lives next to source
    __tests__/
      integration.spec.ts  ← integration tests in __tests__/
```

Every sensor, every brain function, every exchange method has tests.

Test names describe behavior, not implementation:

```typescript
// Good
it('should promote sensor when lower 80% CI exceeds 0.5 after 10 wins')

// Bad
it('should call updatePosterior with correct params')
```

## Release Process

```bash
# Animus finishes a milestone
# All tests pass, all builds clean
# Tag the release:
git tag -a v0.1.0 -m "feat: M1 skeleton — monorepo, core types, CI"
git push origin v0.1.0
```

Sisyphus clones, runs `docker compose up`, and validates:
- Backend starts without errors
- API responds on all documented endpoints
- Tests pass locally
- Signals/sensors/trades endpoints return expected schemas

If it works, the release stands. If it doesn't, it goes back.

## Definition of Done

A milestone is done when:

- [ ] All tests pass (`pnpm test`)
- [ ] Zero build errors (`pnpm build`)
- [ ] No TypeScript `any` types
- [ ] All code documented (module + function + inline)
- [ ] README updated if API changed
- [ ] Conventional commit history
- [ ] Semantic version tagged
- [ ] `docker compose up` runs the full stack
- [ ] Sisyphus can clone and run it cold
