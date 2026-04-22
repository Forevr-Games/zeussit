import type { Router } from 'express';
import type { Deps } from '../types.js';
import type { RateLimiter } from '../core/rateLimit.js';
import { safeRoute, beginDestructive } from './_helpers.js';

export function mountJobRoutes(router: Router, deps: Deps, rl: RateLimiter): void {
  router.get('/jobs', async (_req, res) => {
    const data = await deps.scheduler.listJobs();
    res.json({ ok: true, data });
  });

  router.delete(
    '/jobs/:id',
    safeRoute(async (req, res) => {
      const id = String(req.params.id ?? '');
      const { commit } = await beginDestructive(req, deps, rl, 'jobs.cancel', id);
      await deps.scheduler.cancelJob(id);
      commit();
      res.json({ ok: true, data: { cancelled: id } });
    })
  );
}
