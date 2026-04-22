import { randomBytes } from 'node:crypto';
import type { ActionContext, ActionDef } from '../types.js';
import type { Logger } from './logger-shim.js';
import type { RateLimiter } from './rateLimit.js';
import { ZeussitError } from './errors.js';
import { logDestructive } from './audit.js';

interface ExecuteOpts {
  action: ActionDef;
  body: Record<string, unknown>;
  userId: string | undefined;
  requestId?: string | undefined;
  logger: Logger;
  rateLimiter: RateLimiter;
  /** True when invoked on behalf of a mod — enforces rate limit for destructive ops. */
  asMod: boolean;
  /** When true, devOnly actions are rejected before the handler runs. */
  isProductionEnv?: boolean;
}

/**
 * Single source of truth for action invocation: rate-limit (when `asMod`) +
 * handler call + destructive audit log. Used by both `Zeussit.runAction()`
 * and `POST /actions/:id` so the two paths can never drift.
 *
 * Confirm-token enforcement is HTTP-layer (needs `req`) and stays in the
 * route, before this is called.
 */
export async function executeAction(opts: ExecuteOpts): Promise<unknown> {
  const { action, body, userId, logger, rateLimiter, asMod, isProductionEnv } = opts;
  const requestId = opts.requestId ?? randomBytes(6).toString('hex');

  if (action.devOnly && isProductionEnv) {
    throw new ZeussitError('FORBIDDEN', `action '${action.id}' is dev-only`);
  }

  if (asMod && action.destructive) {
    // Reject missing userId instead of falling back to '' — otherwise every
    // unauthenticated caller shares one bucket and trivially DoSes destructive
    // ops for each other.
    if (!userId) {
      throw new ZeussitError('UNAUTHORIZED', 'userId required for destructive ops');
    }
    if (!rateLimiter(userId)) {
      throw new ZeussitError('RATE_LIMITED', 'too many destructive ops');
    }
  }

  const ctx: ActionContext = { userId, requestId, logger };
  const result = await action.handler(body, ctx);

  if (action.destructive) {
    // Mirror the confirm-token's target resolution so the audit line records
    // "wipe-user t2_alice" rather than "wipe-user wipe-user".
    const rawTarget = action.targetField ? body[action.targetField] : undefined;
    const target = typeof rawTarget === 'string' && rawTarget ? rawTarget : action.id;
    logDestructive(logger, {
      actor: userId,
      op: `action.${action.id}`,
      target,
      requestId,
    });
  }

  return result;
}
