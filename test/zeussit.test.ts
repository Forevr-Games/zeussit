import { describe, it, expect, vi } from 'vitest';
import { createZeussit } from '../src/core/zeussit.js';
import { noopLogger } from '../src/core/logger-shim.js';

const baseDeps = () => ({
  logger: noopLogger,
  confirmSecret: 's',
  getUserId: () => 'u',
  redis: {} as never,
  scheduler: {} as never,
});

describe('createZeussit facade', () => {
  it('runAction dispatches to registered handler', async () => {
    const z = createZeussit(baseDeps());
    const handler = vi.fn(async () => ({ pong: true }));
    z.registerAction({ id: 'ping', label: 'P', handler });
    expect(await z.runAction('ping', { a: 1 })).toEqual({ pong: true });
    expect(handler).toHaveBeenCalledWith(
      { a: 1 },
      expect.objectContaining({ requestId: expect.any(String) })
    );
  });

  it('runAction 404s unknown', async () => {
    const z = createZeussit(baseDeps());
    await expect(z.runAction('nope', {})).rejects.toThrow(/not found|NOT_FOUND/i);
  });

  it('registerCron validates against manifest', () => {
    const z = createZeussit({ ...baseDeps(), cronManifest: { 'real': { endpoint: '/x' } } });
    expect(() => z.registerCron({ name: 'fake' })).toThrow(/not in devvit.json/);
    expect(() => z.registerCron({ name: 'real' })).not.toThrow();
  });
});
