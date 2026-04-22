import type { RequestHandler } from 'express';

export interface GuardOpts {
  getUserId: () => string | undefined;
  cacheMs?: number;
}

const MAX_CACHE_ENTRIES = 10_000;

export function createModeratorGuard(
  check: () => Promise<boolean>,
  opts: GuardOpts
): RequestHandler {
  const cacheMs = opts.cacheMs ?? 30_000;
  // Only positive results are cached. Caching denials would lock mods out
  // for cacheMs whenever the upstream check (e.g. reddit.getModerators())
  // has a transient failure — exactly when an ops tool is most needed.
  const cache = new Map<string, { at: number }>();
  const deny = (res: Parameters<RequestHandler>[1]): void => {
    res.status(401).json({ ok: false, code: 'UNAUTHORIZED', message: 'mod required' });
  };
  return async (_req, res, next) => {
    // Reject missing userId at the edge. Sharing a '' cache slot across all
    // unauthenticated callers would let a non-mod piggyback on a recent
    // positive check for another anon caller.
    const uid = opts.getUserId();
    if (!uid) return deny(res);
    const now = Date.now();
    const cached = cache.get(uid);
    if (cached && now - cached.at < cacheMs) return next();
    const ok = await check();
    if (!ok) return deny(res);
    if (cache.size >= MAX_CACHE_ENTRIES) {
      for (const [k, v] of cache) {
        if (now - v.at >= cacheMs) cache.delete(k);
      }
    }
    cache.set(uid, { at: now });
    next();
  };
}

export function createAllowlistGuard(userIds: string[], opts: GuardOpts): RequestHandler {
  const set = new Set(userIds);
  return (_req, res, next) => {
    const uid = opts.getUserId();
    if (uid && set.has(uid)) {
      next();
      return;
    }
    res.status(401).json({ ok: false, code: 'UNAUTHORIZED', message: 'not allowlisted' });
  };
}
