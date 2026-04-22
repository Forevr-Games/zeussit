import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApp } from './testUtils.js';

describe('GET /crons', () => {
  it('joins registry entries with manifest data', async () => {
    const { app, z } = makeApp({
      cronManifest: {
        sync: { endpoint: '/crons/sync/run', cron: '0 * * * *' },
      },
    });
    z.registerCron({ name: 'sync', description: 'Sync data' });

    const res = await request(app).get('/z/crons').expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toHaveLength(1);
    const entry = res.body.data[0];
    expect(entry.name).toBe('sync');
    expect(entry.description).toBe('Sync data');
    expect(entry.endpoint).toBe('/crons/sync/run');
    expect(entry.cron).toBe('0 * * * *');
  });

  it('returns registry crons with undefined manifest fields when not in manifest', async () => {
    const { app, z } = makeApp();
    z.registerCron({ name: 'orphan', description: 'No manifest entry' });

    const res = await request(app).get('/z/crons').expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('orphan');
    expect(res.body.data[0].endpoint).toBeUndefined();
  });
});

describe('POST /crons/:name/trigger', () => {
  it('scheduler mode enqueues a job and returns jobId', async () => {
    const { app, z, fakes } = makeApp({
      cronManifest: {
        sync: { endpoint: '/crons/sync/run', cron: '0 * * * *' },
      },
    });
    z.registerCron({ name: 'sync', description: 'Sync data' });

    const res = await request(app)
      .post('/z/crons/sync/trigger')
      .send({ mode: 'scheduler' })
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.data.jobId).toBe('string');

    const jobs = await fakes.scheduler.scheduler.listJobs();
    expect(jobs.some((j) => j.name === 'sync')).toBe(true);
  });

  it('scheduler mode is the default when mode is omitted', async () => {
    const { app, z, fakes } = makeApp();
    z.registerCron({ name: 'sweep' });

    await request(app).post('/z/crons/sweep/trigger').send({}).expect(200);
    const jobs = await fakes.scheduler.scheduler.listJobs();
    expect(jobs.some((j) => j.name === 'sweep')).toBe(true);
  });

  it('direct mode returns endpoint from manifest', async () => {
    const { app, z } = makeApp({
      cronManifest: {
        sync: { endpoint: '/crons/sync/run', cron: '0 * * * *' },
      },
    });
    z.registerCron({ name: 'sync' });

    const res = await request(app)
      .post('/z/crons/sync/trigger')
      .send({ mode: 'direct' })
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.endpoint).toBe('/crons/sync/run');
  });

  it('unknown cron name → 404', async () => {
    const { app } = makeApp();
    await request(app).post('/z/crons/nope/trigger').send({}).expect(404);
  });
});
