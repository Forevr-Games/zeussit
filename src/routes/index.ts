import type { Router } from 'express';
import type { Deps } from '../types.js';
import type { ZeussitRegistry } from '../core/registry.js';
import type { RateLimiter } from '../core/rateLimit.js';
import { mountNamespaceRoutes } from './namespaceRoutes.js';
import { mountStringRoutes } from './stringRoutes.js';
import { mountHashRoutes } from './hashRoutes.js';
import { mountZsetRoutes } from './zsetRoutes.js';
import { mountConfirmRoutes } from './confirmRoutes.js';
import { mountCronRoutes } from './cronRoutes.js';
import { mountJobRoutes } from './jobRoutes.js';
import { mountActionRoutes } from './actionRoutes.js';

export function assembleRouter(
  router: Router,
  registry: ZeussitRegistry,
  deps: Deps,
  rateLimiter: RateLimiter
): void {
  mountNamespaceRoutes(router, registry, deps);
  mountStringRoutes(router, registry, deps, rateLimiter);
  mountHashRoutes(router, registry, deps, rateLimiter);
  mountZsetRoutes(router, registry, deps, rateLimiter);
  mountConfirmRoutes(router, deps);
  mountCronRoutes(router, registry, deps);
  mountJobRoutes(router, deps, rateLimiter);
  mountActionRoutes(router, registry, deps, rateLimiter);
}
