import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApp } from './testUtils.js';
import { verifyConfirmToken } from '../src/core/confirm.js';

describe('POST /confirm-challenge', () => {
  it('mints a token the delete endpoint accepts', async () => {
    const { app, z, deps } = makeApp();
    z.registerKeyNamespace({ id: 'u', describe: 'u', matches: () => true });
    await deps.redis.set('u:a', 'hi');
    const m = await request(app)
      .post('/z/confirm-challenge')
      .send({ op: 'key.delete', target: 'u:a' })
      .expect(200);
    const token = m.body.data.token as string;
    expect(
      verifyConfirmToken({ token, op: 'key.delete', target: 'u:a', secret: 'test-secret' })
    ).toBe(true);
    await request(app).delete('/z/key?k=u:a').set('X-Zeussit-Confirm', token).expect(200);
  });

  it('validates body', async () => {
    const { app } = makeApp();
    await request(app).post('/z/confirm-challenge').send({}).expect(400);
  });
});
