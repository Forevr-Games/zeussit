import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApp } from './testUtils.js';

describe('namespace routes', () => {
  it('GET /namespaces', async () => {
    const { app, z } = makeApp();
    z.registerKeyNamespace({
      id: 'u',
      describe: 'users',
      matches: () => true,
      listKeys: async () => ['u:a'],
    });
    const r = await request(app).get('/z/namespaces').expect(200);
    expect(r.body.data).toEqual([
      { id: 'u', describe: 'users', group: undefined, listable: true, writable: true },
    ]);
  });
  it('GET /keys lists when namespace has listKeys', async () => {
    const { app, z } = makeApp();
    z.registerKeyNamespace({
      id: 'u',
      describe: 'u',
      matches: () => true,
      listKeys: async () => ['u:a', 'u:b'],
    });
    const r = await request(app).get('/z/keys?namespace=u').expect(200);
    expect(r.body.data).toEqual(['u:a', 'u:b']);
  });
  it('GET /keys 404s when namespace has no listKeys', async () => {
    const { app, z } = makeApp();
    z.registerKeyNamespace({ id: 'u', describe: 'u', matches: () => true });
    await request(app).get('/z/keys?namespace=u').expect(404);
  });
  it('GET /key returns type + ttl', async () => {
    const { app, z, deps } = makeApp();
    z.registerKeyNamespace({ id: 'u', describe: 'u', matches: (k) => /^u:/.test(k) });
    await deps.redis.set('u:a', 'hi');
    const r = await request(app).get('/z/key?k=u:a').expect(200);
    expect(r.body.data).toMatchObject({ type: 'string', ttl: -1 });
  });
  it('GET /key 404s on key outside any namespace', async () => {
    const { app } = makeApp();
    await request(app).get('/z/key?k=nope:x').expect(404);
  });
});
