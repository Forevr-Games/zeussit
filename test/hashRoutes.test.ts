import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApp } from './testUtils.js';
import { mintConfirmToken } from '../src/core/confirm.js';

const tok = (op: string, target: string) => mintConfirmToken({ op, target, secret: 'test-secret' });

describe('hash routes', () => {
  it('GET /key/hash returns all field-values via hScan', async () => {
    const { app, z, fakes } = makeApp();
    z.registerKeyNamespace({ id: 'h', describe: 'h', matches: (k) => /^h:/.test(k) });
    await fakes.redis.redis.hSet('h:one', { x: '1', y: '2' });
    const r = await request(app).get('/z/key/hash?k=h:one').expect(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.data).toContainEqual({ field: 'x', value: '1' });
    expect(r.body.data).toContainEqual({ field: 'y', value: '2' });
  });

  it('GET /key/hash rejects key outside any namespace', async () => {
    const { app } = makeApp();
    await request(app).get('/z/key/hash?k=nope:x').expect(404);
  });

  it('PATCH /key/hash sets new fields and deletes existing fields', async () => {
    const { app, z, fakes } = makeApp();
    z.registerKeyNamespace({ id: 'h', describe: 'h', matches: (k) => /^h:/.test(k) });
    await fakes.redis.redis.hSet('h:one', { x: '1' });
    await request(app)
      .patch('/z/key/hash')
      .set('X-Zeussit-Confirm', tok('key.hash.del', 'h:one'))
      .send({ key: 'h:one', set: { y: '2' }, del: ['x'] })
      .expect(200);
    const all = await fakes.redis.redis.hGetAll('h:one');
    expect(all).toEqual({ y: '2' });
  });

  it('PATCH /key/hash set-only does not require confirm', async () => {
    const { app, z, fakes } = makeApp();
    z.registerKeyNamespace({ id: 'h', describe: 'h', matches: (k) => /^h:/.test(k) });
    await request(app)
      .patch('/z/key/hash')
      .send({ key: 'h:one', set: { y: '2' } })
      .expect(200);
    const all = await fakes.redis.redis.hGetAll('h:one');
    expect(all).toEqual({ y: '2' });
  });

  it('PATCH /key/hash del without confirm: 409 + challenge', async () => {
    const { app, z, fakes } = makeApp();
    z.registerKeyNamespace({ id: 'h', describe: 'h', matches: (k) => /^h:/.test(k) });
    await fakes.redis.redis.hSet('h:one', { x: '1' });
    const r = await request(app)
      .patch('/z/key/hash')
      .send({ key: 'h:one', del: ['x'] })
      .expect(409);
    expect(r.body).toMatchObject({
      code: 'NO_CONFIRM',
      challenge: { op: 'key.hash.del', target: 'h:one' },
    });
  });

  it('PATCH /key/hash rejects key outside any namespace', async () => {
    const { app } = makeApp();
    await request(app)
      .patch('/z/key/hash')
      .send({ key: 'nope:x', set: { a: '1' } })
      .expect(400);
  });

  it('GET /key/hash rejects non-integer cursor', async () => {
    const { app, z } = makeApp();
    z.registerKeyNamespace({ id: 'h', describe: 'h', matches: (k) => /^h:/.test(k) });
    await request(app).get('/z/key/hash?k=h:x&cursor=foo').expect(400);
    await request(app).get('/z/key/hash?k=h:x&cursor=1.5').expect(400);
  });
});
