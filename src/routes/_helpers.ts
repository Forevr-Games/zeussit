import type { Request, RequestHandler } from 'express';
import type { ZeussitRegistry } from '../core/registry.js';
import type { Deps, KeyNamespace } from '../types.js';
import type { RateLimiter } from '../core/rateLimit.js';
import { ZeussitError, writeErrorResponse } from '../core/errors.js';
import { requireConfirm, resolveSecret } from '../core/confirm.js';
import { logDestructive } from '../core/audit.js';

/**
 * Wraps a route handler so any thrown value is normalised to a JSON error
 * response with the right HTTP status. Eliminates the try/catch +
 * writeErrorResponse boilerplate that would otherwise repeat in every route.
 *
 * Returns `RequestHandler` so express's contextual typing flows through to
 * `req.params`, `req.body`, etc. at the call site.
 */
export function safeRoute(handler: RequestHandler): RequestHandler {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (e) {
      writeErrorResponse(res, e, req.zeussitRequestId!);
    }
  };
}

/**
 * Resolves a key to its registered namespace or throws. Used to gate every
 * Redis read/write — keys outside any namespace are invisible and unwritable.
 *
 * `as: 'read'` (default) throws NOT_FOUND (404), matching read-side semantics.
 * `as: 'write'` throws VALIDATION (400), since writing to a key outside any
 * registered namespace is a client error, not a missing resource.
 */
export function requireNamespace(
  registry: ZeussitRegistry,
  key: string,
  as: 'read' | 'write' = 'read'
): KeyNamespace {
  const ns = registry.findNamespaceForKey(key);
  if (!ns) {
    if (as === 'write') throw new ZeussitError('VALIDATION', 'key outside any namespace');
    throw new ZeussitError('NOT_FOUND', 'no namespace matches key');
  }
  return ns;
}

/**
 * Coerce a query param to an integer, rejecting NaN/Infinity/non-integers.
 * Defaults to `fallback` when the param is absent. Throws VALIDATION
 * otherwise. Required because `Number(undefined)` is `NaN` and `NaN`
 * silently bypasses every JS comparison operator.
 */
export function intQuery(value: unknown, name: string, fallback: number): number {
  if (value === undefined) return fallback;
  const s = Array.isArray(value) ? value[0] : value;
  const n = Number(s);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new ZeussitError('VALIDATION', `${name} must be an integer`);
  }
  return n;
}

/**
 * Same as `intQuery` but for required body numbers (no fallback). Used
 * for finite-score validation in zset member entries, etc.
 */
export function finiteNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ZeussitError('VALIDATION', `${name} must be a finite number`);
  }
  return value;
}

/**
 * Rate-limit + confirm-token gate for mutating non-action routes (DELETE /key,
 * DELETE /jobs/:id). `executeAction` handles the equivalent for registered
 * actions. Returns a `commit()` callback the caller invokes after the
 * mutation succeeds — preserves the "audit on success only" invariant.
 */
export async function beginDestructive(
  req: Request,
  deps: Deps,
  rl: RateLimiter,
  op: string,
  target: string
): Promise<{ userId: string; commit: () => void }> {
  const userId = deps.getUserId();
  // Reject missing userId at the edge. A shared '' bucket means one anon
  // caller can trivially rate-limit every other anon caller, and a denial
  // there would leak more than refusing upfront does.
  if (!userId) throw new ZeussitError('UNAUTHORIZED', 'userId required for destructive ops');
  if (!rl(userId)) throw new ZeussitError('RATE_LIMITED', 'too many destructive ops');
  requireConfirm(req, op, target, await resolveSecret(deps.confirmSecret));
  return {
    userId,
    commit: () =>
      logDestructive(deps.logger, {
        actor: userId,
        op,
        target,
        requestId: req.zeussitRequestId!,
      }),
  };
}
