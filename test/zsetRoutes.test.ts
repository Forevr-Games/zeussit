import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApp } from './testUtils.js';
import { mintConfirmToken } from '../src/core/confirm.js';

const tok = (op: string, target: string) => mintConfirmToken({ op, target, secret: 'test-secret' });

describe('zset routes', () => {
  it('GET /key/zset returns range sorted by score ascending', async () => {
    const { app, z, fakes } = makeApp();
    z.registerKeyNamespace({ id: 'zs', describe: 'zs', matches: (k) => /^zs:/.test(k) });
    await fakes.redis.redis.zAdd(
      'zs:one',
      { member: 'alpha', score: 10 },
      { member: 'beta', score: 5 }
    );
    const r = await request(app).get('/z/key/zset?k=zs:one').expect(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.data).toContainEqual({ member: 'beta', score: 5 });
    expect(r.body.data).toContainEqual({ member: 'alpha', score: 10 });
    // sorted ascending: beta (5) before alpha (10)
    const members = r.body.data.map((e: { member: string }) => e.member);
    expect(members.indexOf('beta')).toBeLessThan(members.indexOf('alpha'));
  });

  it('PATCH /key/zset adds and removes members', async () => {
    const { app, z, fakes } = makeApp();
    z.registerKeyNamespace({ id: 'zs', describe: 'zs', matches: (k) => /^zs:/.test(k) });
    await fakes.redis.redis.zAdd('zs:two', { member: 'm1', score: 1 });
    await request(app)
      .patch('/z/key/zset')
      .set('X-Zeussit-Confirm', tok('key.zset.rem', 'zs:two'))
      .send({ key: 'zs:two', add: [{ m: 'm2', s: 2 }], rem: ['m1'] })
      .expect(200);
    const range = await fakes.redis.redis.zRange('zs:two', 0, -1);
    expect(range).toHaveLength(1);
    expect(range[0]).toMatchObject({ member: 'm2', score: 2 });
  });

  it('PATCH /key/zset add-only does not require confirm', async () => {
    const { app, z, fakes } = makeApp();
    z.registerKeyNamespace({ id: 'zs', describe: 'zs', matches: (k) => /^zs:/.test(k) });
    await request(app)
      .patch('/z/key/zset')
      .send({ key: 'zs:two', add: [{ m: 'm2', s: 2 }] })
      .expect(200);
    const range = await fakes.redis.redis.zRange('zs:two', 0, -1);
    expect(range).toHaveLength(1);
  });

  it('PATCH /key/zset rem without confirm: 409 + challenge', async () => {
    const { app, z, fakes } = makeApp();
    z.registerKeyNamespace({ id: 'zs', describe: 'zs', matches: (k) => /^zs:/.test(k) });
    await fakes.redis.redis.zAdd('zs:two', { member: 'm1', score: 1 });
    const r = await request(app)
      .patch('/z/key/zset')
      .send({ key: 'zs:two', rem: ['m1'] })
      .expect(409);
    expect(r.body).toMatchObject({
      code: 'NO_CONFIRM',
      challenge: { op: 'key.zset.rem', target: 'zs:two' },
    });
  });

  it('PATCH /key/zset rejects key outside any namespace', async () => {
    const { app } = makeApp();
    await request(app)
      .patch('/z/key/zset')
      .send({ key: 'nope:x', add: [{ m: 'm1', s: 1 }] })
      .expect(400);
  });

  it('PATCH /key/zset rejects non-string member or non-finite score', async () => {
    const { app, z } = makeApp();
    z.registerKeyNamespace({ id: 'zs', describe: 'zs', matches: (k) => /^zs:/.test(k) });
    await request(app)
      .patch('/z/key/zset')
      .send({ key: 'zs:bad', add: [{ m: null, s: 1 }] })
      .expect(400);
    await request(app)
      .patch('/z/key/zset')
      .send({ key: 'zs:bad', add: [{ m: 'ok', s: 'NaN' }] })
      .expect(400);
    await request(app)
      .patch('/z/key/zset')
      .send({ key: 'zs:bad', rem: [null] })
      .expect(400);
  });

  it('GET /key/zset rejects non-integer start/stop', async () => {
    const { app, z } = makeApp();
    z.registerKeyNamespace({ id: 'zs', describe: 'zs', matches: (k) => /^zs:/.test(k) });
    await request(app).get('/z/key/zset?k=zs:x&start=foo').expect(400);
    await request(app).get('/z/key/zset?k=zs:x&start=1.5').expect(400);
  });
});
