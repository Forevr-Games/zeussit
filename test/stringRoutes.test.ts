import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApp } from './testUtils.js';
import { mintConfirmToken } from '../src/core/confirm.js';

const tok = (op: string, target: string) => mintConfirmToken({ op, target, secret: 'test-secret' });

describe('string routes', () => {
  it('GET /key/string returns value', async () => {
    const { app, z, deps } = makeApp();
    z.registerKeyNamespace({ id: 'u', describe: 'u', matches: (k) => /^u:/.test(k) });
    await deps.redis.set('u:a', 'hi');
    const r = await request(app).get('/z/key/string?k=u:a').expect(200);
    expect(r.body.data).toBe('hi');
  });

  it('PUT /key/string writes + respects TTL', async () => {
    const { app, z, deps } = makeApp();
    z.registerKeyNamespace({ id: 'u', describe: 'u', matches: (k) => /^u:/.test(k) });
    await request(app)
      .put('/z/key/string')
      .set('X-Zeussit-Confirm', tok('key.string.put', 'u:a'))
      .send({ key: 'u:a', value: 'hi', ttlSeconds: 60 })
      .expect(200);
    expect(await deps.redis.get('u:a')).toBe('hi');
  });

  it('PUT /key/string without token: 409 + challenge', async () => {
    const { app, z } = makeApp();
    z.registerKeyNamespace({ id: 'u', describe: 'u', matches: (k) => /^u:/.test(k) });
    const r = await request(app).put('/z/key/string').send({ key: 'u:a', value: 'hi' }).expect(409);
    expect(r.body).toMatchObject({
      code: 'NO_CONFIRM',
      challenge: { op: 'key.string.put', target: 'u:a' },
    });
  });

  it('PUT /key/string rejects keys outside any namespace', async () => {
    const { app } = makeApp();
    await request(app).put('/z/key/string').send({ key: 'nope:x', value: 'hi' }).expect(400);
  });

  it('DELETE /key without token: 409 + challenge', async () => {
    const { app, z, deps } = makeApp();
    z.registerKeyNamespace({ id: 'u', describe: 'u', matches: () => true });
    await deps.redis.set('u:a', 'hi');
    const r = await request(app).delete('/z/key?k=u:a').expect(409);
    expect(r.body).toMatchObject({
      ok: false,
      code: 'NO_CONFIRM',
      challenge: { op: 'key.delete', target: 'u:a' },
    });
  });

  it('DELETE /key with valid token deletes', async () => {
    const { app, z, deps } = makeApp();
    z.registerKeyNamespace({ id: 'u', describe: 'u', matches: () => true });
    await deps.redis.set('u:a', 'hi');
    await request(app)
      .delete('/z/key?k=u:a')
      .set('X-Zeussit-Confirm', tok('key.delete', 'u:a'))
      .expect(200);
    expect(await deps.redis.get('u:a')).toBeUndefined();
  });

  it('POST /key/ttl sets expiration', async () => {
    const { app, z, deps } = makeApp();
    z.registerKeyNamespace({ id: 'u', describe: 'u', matches: () => true });
    await deps.redis.set('u:a', 'hi');
    await request(app).post('/z/key/ttl').send({ key: 'u:a', ttlSeconds: 60 }).expect(200);
    expect(await deps.redis.expireTime('u:a')).toBeGreaterThan(0);
  });
});
