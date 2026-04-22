import type { Router } from 'express';
import type { Deps } from '../types.js';
import type { ZeussitRegistry } from '../core/registry.js';
import type { RateLimiter } from '../core/rateLimit.js';
import { ZeussitError } from '../core/errors.js';
import { requireConfirm, resolveSecret } from '../core/confirm.js';
import { executeAction } from '../core/executeAction.js';
import { safeRoute } from './_helpers.js';

export function mountActionRoutes(
  router: Router,
  registry: ZeussitRegistry,
  deps: Deps,
  rateLimiter: RateLimiter
): void {
  router.get('/actions', (_req, res) => {
    res.json({ ok: true, data: registry.listActions() });
  });

  router.post(
    '/actions/:id',
    safeRoute(async (req, res) => {
      const id = String(req.params.id ?? '');
      const action = registry.getAction(id);
      if (!action) throw new ZeussitError('NOT_FOUND', `unknown action: ${id}`);

      const body = (req.body as Record<string, unknown>) ?? {};

      // Confirm-token enforcement is HTTP-layer (needs req); rate-limit +
      // audit live in executeAction so HTTP and runAction() can't drift.
      if (action.destructive) {
        // Bind the confirm-token to body[targetField] when declared so a
        // confirm minted for userId:bob can't be replayed against userId:alice.
        const rawTarget = action.targetField ? body[action.targetField] : undefined;
        const target = typeof rawTarget === 'string' && rawTarget ? rawTarget : id;
        requireConfirm(req, `action.${id}`, target, await resolveSecret(deps.confirmSecret));
      }

      const data = await executeAction({
        action,
        body,
        userId: deps.getUserId(),
        requestId: req.zeussitRequestId,
        logger: deps.logger,
        rateLimiter,
        asMod: true,
        isProductionEnv: deps.isProductionEnv?.() ?? false,
      });

      res.json({ ok: true, data });
    })
  );
}
