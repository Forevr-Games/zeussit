import type { Router } from 'express';
import type { Deps } from '../types.js';
import type { ZeussitRegistry } from '../core/registry.js';
import { ZeussitError } from '../core/errors.js';
import { safeRoute } from './_helpers.js';

export function mountCronRoutes(router: Router, registry: ZeussitRegistry, deps: Deps): void {
  router.get('/crons', (_req, res) => {
    const data = registry.listCrons().map((c) => {
      const manifest = deps.cronManifest?.[c.name];
      return {
        name: c.name,
        description: c.description,
        endpoint: manifest?.endpoint,
        cron: manifest?.cron,
      };
    });
    res.json({ ok: true, data });
  });

  router.post(
    '/crons/:name/trigger',
    safeRoute(async (req, res) => {
      const name = String(req.params.name ?? '');
      const cron = registry.getCron(name);
      if (!cron) throw new ZeussitError('NOT_FOUND', `cron not registered: ${name}`);

      const mode = (req.body as Record<string, unknown>)?.mode ?? 'scheduler';

      if (mode === 'direct') {
        const endpoint = deps.cronManifest?.[name]?.endpoint;
        res.json({ ok: true, data: { endpoint } });
        return;
      }

      const jobId = await deps.scheduler.runJob({ name, runAt: new Date() });
      res.json({ ok: true, data: { jobId } });
    })
  );
}
