import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { makeApp } from './testUtils.js';
import { mintConfirmToken } from '../src/core/confirm.js';

describe('action routes', () => {
  it('GET /actions lists', async () => {
    const { app, z } = makeApp();
    z.registerAction({ id: 'ping', label: 'P', handler: async () => ({ pong: true }) });
    const r = await request(app).get('/z/actions').expect(200);
    expect(r.body.data).toEqual([
      {
        id: 'ping',
        label: 'P',
        destructive: false,
        devOnly: false,
        schema: null,
        targetField: null,
      },
    ]);
  });

  it('POST /actions/:id runs non-destructive handler', async () => {
    const { app, z } = makeApp();
    const handler = vi.fn(async () => ({ pong: true }));
    z.registerAction({ id: 'ping', label: 'P', handler });
    await request(app).post('/z/actions/ping').send({ a: 1 }).expect(200);
    expect(handler).toHaveBeenCalledWith(
      { a: 1 },
      expect.objectContaining({ requestId: expect.any(String) })
    );
  });

  it('destructive action: 409 + challenge without token', async () => {
    const { app, z } = makeApp();
    z.registerAction({ id: 'wipe', label: 'W', destructive: true, handler: async () => ({}) });
    const r = await request(app).post('/z/actions/wipe').send({}).expect(409);
    expect(r.body.challenge).toEqual({ op: 'action.wipe', target: 'wipe' });
  });

  it('destructive action: succeeds with token', async () => {
    const { app, z } = makeApp();
    z.registerAction({
      id: 'wipe',
      label: 'W',
      destructive: true,
      handler: async () => ({ done: true }),
    });
    const tok = mintConfirmToken({ op: 'action.wipe', target: 'wipe', secret: 'test-secret' });
    const r = await request(app)
      .post('/z/actions/wipe')
      .set('X-Zeussit-Confirm', tok)
      .send({})
      .expect(200);
    expect(r.body.data).toEqual({ done: true });
  });

  it('unknown action 404s', async () => {
    const { app } = makeApp();
    await request(app).post('/z/actions/nope').send({}).expect(404);
  });

  it('devOnly action: 403 FORBIDDEN in production', async () => {
    const { app, z } = makeApp({ isProductionEnv: () => true });
    const handler = vi.fn(async () => ({}));
    z.registerAction({ id: 'nuke-prod', label: 'N', devOnly: true, handler });
    const r = await request(app).post('/z/actions/nuke-prod').send({}).expect(403);
    expect(r.body.code).toBe('FORBIDDEN');
    expect(handler).not.toHaveBeenCalled();
  });

  it('devOnly action: allowed when isProductionEnv is false', async () => {
    const { app, z } = makeApp({ isProductionEnv: () => false });
    const handler = vi.fn(async () => ({ ok: true }));
    z.registerAction({ id: 'dev-op', label: 'D', devOnly: true, handler });
    await request(app).post('/z/actions/dev-op').send({}).expect(200);
    expect(handler).toHaveBeenCalled();
  });

  it('devOnly + destructive: confirm token still required, then 403 fires before handler', async () => {
    const { app, z } = makeApp({ isProductionEnv: () => true });
    const handler = vi.fn(async () => ({}));
    z.registerAction({
      id: 'risky',
      label: 'R',
      destructive: true,
      devOnly: true,
      handler,
    });
    // First call: 409 for missing confirm token (guards layer before devOnly).
    await request(app).post('/z/actions/risky').send({}).expect(409);
    // With token: 403 devOnly kicks in before handler runs.
    const tok = mintConfirmToken({ op: 'action.risky', target: 'risky', secret: 'test-secret' });
    await request(app).post('/z/actions/risky').set('X-Zeussit-Confirm', tok).send({}).expect(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it('destructive + targetField: confirm-token is scoped to body[targetField]', async () => {
    const { app, z } = makeApp();
    const handler = vi.fn(async () => ({ ok: true }));
    z.registerAction({
      id: 'wipe-user',
      label: 'W',
      destructive: true,
      targetField: 'userId',
      handler,
    });
    // Challenge surfaces the resolved target (userId), not the action id.
    const noTok = await request(app)
      .post('/z/actions/wipe-user')
      .send({ userId: 't2_alice' })
      .expect(409);
    expect(noTok.body.challenge).toEqual({ op: 'action.wipe-user', target: 't2_alice' });

    // A token minted for alice can't be replayed against bob.
    const aliceTok = mintConfirmToken({
      op: 'action.wipe-user',
      target: 't2_alice',
      secret: 'test-secret',
    });
    await request(app)
      .post('/z/actions/wipe-user')
      .set('X-Zeussit-Confirm', aliceTok)
      .send({ userId: 't2_bob' })
      .expect(409);
    expect(handler).not.toHaveBeenCalled();

    // Using it against the intended target succeeds.
    await request(app)
      .post('/z/actions/wipe-user')
      .set('X-Zeussit-Confirm', aliceTok)
      .send({ userId: 't2_alice' })
      .expect(200);
    expect(handler).toHaveBeenCalledWith(
      { userId: 't2_alice' },
      expect.objectContaining({ requestId: expect.any(String) })
    );
  });

  it('destructive with missing userId: UNAUTHORIZED (not shared rate-limit bucket)', async () => {
    const { app, z } = makeApp({ getUserId: () => undefined });
    z.registerAction({ id: 'wipe', label: 'W', destructive: true, handler: async () => ({}) });
    const tok = mintConfirmToken({ op: 'action.wipe', target: 'wipe', secret: 'test-secret' });
    const r = await request(app)
      .post('/z/actions/wipe')
      .set('X-Zeussit-Confirm', tok)
      .send({})
      .expect(401);
    expect(r.body.code).toBe('UNAUTHORIZED');
  });

  it('runAction() also honors devOnly', async () => {
    const { z } = makeApp({ isProductionEnv: () => true });
    const handler = vi.fn(async () => ({}));
    z.registerAction({ id: 'dev-op', label: 'D', devOnly: true, handler });
    await expect(z.runAction('dev-op', {})).rejects.toThrow(/dev-only/);
    expect(handler).not.toHaveBeenCalled();
  });
});
