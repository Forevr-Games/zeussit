import type { Router } from 'express';
import type { Deps } from '../types.js';
import type { ZeussitRegistry } from '../core/registry.js';
import type { RateLimiter } from '../core/rateLimit.js';
import { ZeussitError } from '../core/errors.js';
import { safeRoute, requireNamespace, intQuery, beginDestructive } from './_helpers.js';

export function mountHashRoutes(
  router: Router,
  registry: ZeussitRegistry,
  deps: Deps,
  rl: RateLimiter
): void {
  router.get(
    '/key/hash',
    safeRoute(async (req, res) => {
      const k = String(req.query.k ?? '');
      requireNamespace(registry, k);
      const cursor = intQuery(req.query.cursor, 'cursor', 0);
      const { fieldValues } = await deps.redis.hScan(k, cursor);
      res.json({ ok: true, data: fieldValues });
    })
  );

  router.patch(
    '/key/hash',
    safeRoute(async (req, res) => {
      const { key, set, del } = req.body as { key: unknown; set?: unknown; del?: unknown };
      if (typeof key !== 'string') {
        throw new ZeussitError('VALIDATION', 'key must be a string');
      }
      requireNamespace(registry, key, 'write');
      if (set !== undefined) {
        if (typeof set !== 'object' || set === null || Array.isArray(set)) {
          throw new ZeussitError('VALIDATION', 'set must be a record of string fields');
        }
        const rec = set as Record<string, unknown>;
        if (Object.values(rec).some((v) => typeof v !== 'string')) {
          throw new ZeussitError('VALIDATION', 'set values must be strings');
        }
        if (Object.keys(rec).length > 0) {
          await deps.redis.hSet(key, rec as Record<string, string>);
        }
      }
      let destructiveCommit: (() => void) | null = null;
      if (del !== undefined) {
        if (!Array.isArray(del)) {
          throw new ZeussitError('VALIDATION', 'del must be an array of field names');
        }
        if (del.length > 0) {
          // Validate payload before reaching beginDestructive so a malformed
          // request 400s instead of pointlessly minting a confirm challenge.
          del.forEach((m, i) => {
            if (typeof m !== 'string' || m.length === 0) {
              throw new ZeussitError('VALIDATION', `del[${i}] must be a non-empty string`);
            }
          });
          // Field deletion is destructive — require confirm-token, rate-limit,
          // and audit line. Set-only patches remain ungated.
          const d = await beginDestructive(req, deps, rl, 'key.hash.del', key);
          destructiveCommit = d.commit;
          await deps.redis.hDel(key, del as string[]);
        }
      }
      if (destructiveCommit) destructiveCommit();
      res.json({ ok: true, data: { key } });
    })
  );
}
