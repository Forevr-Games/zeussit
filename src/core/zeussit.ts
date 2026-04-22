import { Router } from 'express';
import type { Deps, KeyNamespace, CronDef, ActionDef } from '../types.js';
import { ZeussitRegistry } from './registry.js';
import { createRateLimiter } from './rateLimit.js';
import { noopLogger } from './logger-shim.js';
import { requestIdMiddleware } from './requestId.js';
import { assembleRouter } from '../routes/index.js';
import { ZeussitError } from './errors.js';
import { executeAction } from './executeAction.js';

export interface RunActionOpts {
  /**
   * Set true when invoking on behalf of a mod (e.g. from an HTTP route after
   * the mod guard + confirm-token check). Enforces rate-limiting on
   * destructive ops. Default false — internal callers (crons, schedulers,
   * trusted server code) skip the rails.
   *
   * Audit logging fires for destructive ops regardless of this flag.
   */
  asMod?: boolean;
}

export interface Zeussit {
  registerKeyNamespace(ns: KeyNamespace): void;
  registerCron(cron: CronDef): void;
  registerAction(action: ActionDef): void;
  runAction(id: string, body: Record<string, unknown>, opts?: RunActionOpts): Promise<unknown>;
  router(): Router;
}

export function createZeussit(deps: Deps): Zeussit {
  const logger = deps.logger ?? noopLogger;
  const validateId =
    deps.validateId ??
    ((v, f) => {
      if (typeof v !== 'string' || !/^[a-zA-Z0-9:_-]{1,128}$/.test(v)) {
        throw new ZeussitError('VALIDATION', `invalid ${f}`);
      }
      return v;
    });
  const rateLimiter = createRateLimiter({ perMin: deps.rateLimitPerMin ?? 10 });
  const registry = new ZeussitRegistry();
  const resolvedDeps: Deps = { ...deps, logger, validateId };

  return {
    registerKeyNamespace: (ns) => registry.registerKeyNamespace(ns),
    registerCron: (cron) => {
      if (deps.cronManifest && !deps.cronManifest[cron.name]) {
        throw new ZeussitError('VALIDATION', `cron "${cron.name}" not in devvit.json`);
      }
      registry.registerCron(cron);
    },
    registerAction: (action) => registry.registerAction(action),
    runAction: async (id, body, opts) => {
      const action = registry.getAction(id);
      if (!action) throw new ZeussitError('NOT_FOUND', `action not found: ${id}`);
      return executeAction({
        action,
        body,
        userId: deps.getUserId(),
        logger,
        rateLimiter,
        asMod: opts?.asMod ?? false,
        isProductionEnv: deps.isProductionEnv?.() ?? false,
      });
    },
    router: () => {
      const r = Router();
      r.use(requestIdMiddleware);
      assembleRouter(r, registry, resolvedDeps, rateLimiter);
      return r;
    },
  };
}
