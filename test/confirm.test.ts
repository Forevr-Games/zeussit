import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mintConfirmToken, verifyConfirmToken } from '../src/core/confirm.js';

describe('confirm tokens', () => {
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z')));
  afterEach(() => vi.useRealTimers());

  const args = { op: 'key.delete', target: 'u:a', secret: 's' };
  it('round-trips valid', () => {
    expect(verifyConfirmToken({ token: mintConfirmToken(args), ...args })).toBe(true);
  });
  it('rejects after 60s', () => {
    const t = mintConfirmToken(args);
    vi.advanceTimersByTime(61_000);
    expect(verifyConfirmToken({ token: t, ...args })).toBe(false);
  });
  it('rejects wrong op/target/secret', () => {
    const t = mintConfirmToken(args);
    expect(verifyConfirmToken({ token: t, ...args, op: 'jobs.cancel' })).toBe(false);
    expect(verifyConfirmToken({ token: t, ...args, target: 'u:b' })).toBe(false);
    expect(verifyConfirmToken({ token: t, ...args, secret: 'other' })).toBe(false);
  });
  it('rejects malformed', () => {
    expect(verifyConfirmToken({ token: '', ...args })).toBe(false);
    expect(verifyConfirmToken({ token: 'abc', ...args })).toBe(false);
    expect(verifyConfirmToken({ token: 'x.y', ...args })).toBe(false);
  });
});
