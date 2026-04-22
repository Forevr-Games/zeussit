import type { Logger } from './logger-shim.js';

export function logDestructive(
  logger: Logger,
  args: { actor: string | undefined; op: string; target: string; requestId: string }
): void {
  logger.warn('🤜⚡ zeussit.destructive', {
    actor: args.actor ?? '<unknown>',
    op: args.op,
    target: args.target,
    requestId: args.requestId,
  });
}
