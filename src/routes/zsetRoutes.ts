import type { Router } from 'express';
import type { Deps } from '../types.js';
import type { ZeussitRegistry } from '../core/registry.js';
import type { RateLimiter } from '../core/rateLimit.js';
import { ZeussitError } from '../core/errors.js';
import {
  safeRoute,
  requireNamespace,
  intQuery,
  finiteNumber,
  beginDestructive,
} from './_helpers.js';

export function mountZsetRoutes(
  router: Router,
  registry: ZeussitRegistry,
  deps: Deps,
  rl: RateLimiter
): void {
  router.get(
    '/key/zset',
    safeRoute(async (req, res) => {
      const k = String(req.query.k ?? '');
      requireNamespace(registry, k);
      const start = intQuery(req.query.start, 'start', 0);
      const stop = intQuery(req.query.stop, 'stop', -1);
      const data = await deps.redis.zRange(k, start, stop);
      res.json({ ok: true, data });
    })
  );

  router.patch(
    '/key/zset',
    safeRoute(async (req, res) => {
      const { key, add, rem } = req.body as { key: unknown; add?: unknown; rem?: unknown };
      if (typeof key !== 'string') {
        throw new ZeussitError('VALIDATION', 'key must be a string');
      }
      requireNamespace(registry, key, 'write');
      if (add !== undefined) {
        if (!Array.isArray(add)) {
          throw new ZeussitError('VALIDATION', 'add must be an array of {m, s} entries');
        }
        if (add.length > 0) {
          const members = add.map((x, i) => {
            if (typeof x !== 'object' || x === null) {
              throw new ZeussitError('VALIDATION', `add[${i}] must be an object`);
            }
            const { m, s } = x as { m?: unknown; s?: unknown };
            if (typeof m !== 'string' || m.length === 0) {
              throw new ZeussitError('VALIDATION', `add[${i}].m must be a non-empty string`);
            }
            return { member: m, score: finiteNumber(s, `add[${i}].s`) };
          });
          await deps.redis.zAdd(key, ...members);
        }
      }
      let destructiveCommit: (() => void) | null = null;
      if (rem !== undefined) {
        if (!Array.isArray(rem)) {
          throw new ZeussitError('VALIDATION', 'rem must be an array of member names');
        }
        if (rem.length > 0) {
          // Validate payload before reaching beginDestructive so a malformed
          // request 400s instead of pointlessly minting a confirm challenge.
          rem.forEach((m, i) => {
            if (typeof m !== 'string' || m.length === 0) {
              throw new ZeussitError('VALIDATION', `rem[${i}] must be a non-empty string`);
            }
          });
          // Member removal is destructive — require confirm-token, rate-limit,
          // and audit line. Add-only patches remain ungated.
          const d = await beginDestructive(req, deps, rl, 'key.zset.rem', key);
          destructiveCommit = d.commit;
          await deps.redis.zRem(key, rem as string[]);
        }
      }
      if (destructiveCommit) destructiveCommit();
      res.json({ ok: true, data: { key } });
    })
  );
}
