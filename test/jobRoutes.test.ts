import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApp } from './testUtils.js';
import { mintConfirmToken } from '../src/core/confirm.js';

const tok = (op: string, target: string) => mintConfirmToken({ op, target, secret: 'test-secret' });

describe('GET /jobs', () => {
  it('returns listJobs result', async () => {
    const { app, deps } = makeApp();
    await deps.scheduler.runJob({ name: 'sync', runAt: new Date() });

    const res = await request(app).get('/z/jobs').expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('sync');
  });
});

describe('DELETE /jobs/:id', () => {
  it('without token → 409 + challenge', async () => {
    const { app, deps } = makeApp();
    const jobId = await deps.scheduler.runJob({ name: 'sweep', runAt: new Date() });

    const res = await request(app).delete(`/z/jobs/${jobId}`).expect(409);
    expect(res.body.ok).toBe(false);
    expect(res.body.challenge).toMatchObject({ op: 'jobs.cancel', target: jobId });
  });

  it('with valid token → cancels job', async () => {
    const { app, deps } = makeApp();
    const jobId = await deps.scheduler.runJob({ name: 'sweep', runAt: new Date() });

    const res = await request(app)
      .delete(`/z/jobs/${jobId}`)
      .set('X-Zeussit-Confirm', tok('jobs.cancel', jobId))
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toMatchObject({ cancelled: jobId });

    const remaining = await deps.scheduler.listJobs();
    expect(remaining).toHaveLength(0);
  });
});
