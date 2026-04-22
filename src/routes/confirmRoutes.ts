import type { Router } from 'express';
import type { Deps } from '../types.js';
import { ZeussitError } from '../core/errors.js';
import { mintConfirmToken, resolveSecret } from '../core/confirm.js';
import { safeRoute } from './_helpers.js';

export function mountConfirmRoutes(router: Router, deps: Deps): void {
  router.post(
    '/confirm-challenge',
    safeRoute(async (req, res) => {
      const { op, target } = req.body as { op: unknown; target: unknown };
      if (typeof op !== 'string' || !op || typeof target !== 'string' || !target) {
        throw new ZeussitError('VALIDATION', 'op and target required');
      }
      const token = mintConfirmToken({
        op,
        target,
        secret: await resolveSecret(deps.confirmSecret),
      });
      res.json({ ok: true, data: { token, ttlSeconds: 60 } });
    })
  );
}
