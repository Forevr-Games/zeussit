import type { Router } from 'express';
import type { Deps } from '../types.js';
import type { ZeussitRegistry } from '../core/registry.js';
import type { RateLimiter } from '../core/rateLimit.js';
import { ZeussitError } from '../core/errors.js';
import { safeRoute, requireNamespace, beginDestructive } from './_helpers.js';

export function mountStringRoutes(
  router: Router,
  registry: ZeussitRegistry,
  deps: Deps,
  rl: RateLimiter
): void {
  router.get(
    '/key/string',
    safeRoute(async (req, res) => {
      const k = String(req.query.k ?? '');
      requireNamespace(registry, k);
      res.json({ ok: true, data: (await deps.redis.get(k)) ?? null });
    })
  );

  router.put(
    '/key/string',
    safeRoute(async (req, res) => {
      const { key, value, ttlSeconds } = req.body as {
        key: unknown;
        value: unknown;
        ttlSeconds?: unknown;
      };
      if (typeof key !== 'string' || typeof value !== 'string') {
        throw new ZeussitError('VALIDATION', 'key and value must be strings');
      }
      requireNamespace(registry, key, 'write');
      // Overwriting existing state is destructive. Gate every PUT uniformly
      // (no TOCTOU read-then-set race to reason about) — the client auto-
      // remints through the challenge flow, so UX cost is a single round-trip.
      const { commit } = await beginDestructive(req, deps, rl, 'key.string.put', key);
      const opts =
        typeof ttlSeconds === 'number' && Number.isInteger(ttlSeconds) && ttlSeconds > 0
          ? { expiration: new Date(Date.now() + ttlSeconds * 1000) }
          : undefined;
      await deps.redis.set(key, value, opts);
      commit();
      res.json({ ok: true, data: { key } });
    })
  );

  router.delete(
    '/key',
    safeRoute(async (req, res) => {
      const k = String(req.query.k ?? '');
      requireNamespace(registry, k, 'write');
      const { commit } = await beginDestructive(req, deps, rl, 'key.delete', k);
      await deps.redis.del(k);
      commit();
      res.json({ ok: true, data: { deleted: k } });
    })
  );

  router.post(
    '/key/ttl',
    safeRoute(async (req, res) => {
      const { key, ttlSeconds } = req.body as { key: unknown; ttlSeconds: unknown };
      if (typeof key !== 'string') throw new ZeussitError('VALIDATION', 'key required');
      if (typeof ttlSeconds !== 'number' || !Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
        throw new ZeussitError('VALIDATION', 'ttlSeconds must be positive integer');
      }
      requireNamespace(registry, key);
      await deps.redis.expire(key, ttlSeconds);
      res.json({ ok: true, data: { key, ttlSeconds } });
    })
  );
}
