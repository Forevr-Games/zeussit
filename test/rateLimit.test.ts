import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRateLimiter } from '../src/core/rateLimit.js';

describe('rate limiter', () => {
  beforeEach(() => vi.useFakeTimers().setSystemTime(Date.now()));
  afterEach(() => vi.useRealTimers());

  it('allows under limit, rejects over', () => {
    const rl = createRateLimiter({ perMin: 3 });
    expect([rl('u'), rl('u'), rl('u'), rl('u')]).toEqual([true, true, true, false]);
  });
  it('isolates per userId', () => {
    const rl = createRateLimiter({ perMin: 1 });
    expect(rl('a') && rl('b')).toBe(true);
  });
  it('refills after 60s', () => {
    const rl = createRateLimiter({ perMin: 1 });
    rl('u');
    expect(rl('u')).toBe(false);
    vi.advanceTimersByTime(60_001);
    expect(rl('u')).toBe(true);
  });
});
