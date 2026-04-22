import type { Router } from 'express';
import type { Deps } from '../types.js';
import type { ZeussitRegistry } from '../core/registry.js';
import { ZeussitError } from '../core/errors.js';
import { safeRoute, requireNamespace } from './_helpers.js';

export function mountNamespaceRoutes(router: Router, registry: ZeussitRegistry, deps: Deps): void {
  router.get('/namespaces', (_req, res) => {
    res.json({ ok: true, data: registry.listNamespaces() });
  });

  router.get(
    '/keys',
    safeRoute(async (req, res) => {
      const ns = registry.getNamespace(String(req.query.namespace ?? ''));
      if (!ns || !ns.listKeys) throw new ZeussitError('NOT_FOUND', 'namespace not listable');
      res.json({ ok: true, data: await ns.listKeys() });
    })
  );

  router.get(
    '/key',
    safeRoute(async (req, res) => {
      const k = String(req.query.k ?? '');
      requireNamespace(registry, k);
      const [type, ttl] = await Promise.all([deps.redis.type(k), deps.redis.expireTime(k)]);
      res.json({ ok: true, data: { type, ttl } });
    })
  );
}
