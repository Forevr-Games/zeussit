import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { createModeratorGuard, createAllowlistGuard } from '../src/core/guards.js';

const app = (guard: RequestHandler) => {
  const a = express();
  a.get('/x', guard, (_req, res) => {
    res.json({ ok: true });
  });
  return a;
};

describe('createModeratorGuard', () => {
  beforeEach(() => vi.useFakeTimers().setSystemTime(Date.now()));
  afterEach(() => vi.useRealTimers());

  it('rejects non-mods with 401', async () => {
    await request(app(createModeratorGuard(async () => false, { getUserId: () => 'u' })))
      .get('/x')
      .expect(401);
  });
  it('allows mods', async () => {
    await request(app(createModeratorGuard(async () => true, { getUserId: () => 'u' })))
      .get('/x')
      .expect(200);
  });
  it('memoizes per userId within cacheMs', async () => {
    const check = vi.fn(async () => true);
    const g = createModeratorGuard(check, { getUserId: () => 'u', cacheMs: 30_000 });
    await request(app(g)).get('/x').expect(200);
    await request(app(g)).get('/x').expect(200);
    expect(check).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(30_001);
    await request(app(g)).get('/x').expect(200);
    expect(check).toHaveBeenCalledTimes(2);
  });
});

describe('createAllowlistGuard', () => {
  it('gates by userId', async () => {
    const g1 = createAllowlistGuard(['u1'], { getUserId: () => 'u1' });
    const g2 = createAllowlistGuard(['u1'], { getUserId: () => 'u2' });
    await request(app(g1)).get('/x').expect(200);
    await request(app(g2)).get('/x').expect(401);
  });
});
