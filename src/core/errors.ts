export type ZeussitErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NO_CONFIRM'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export interface Challenge {
  op: string;
  target: string;
}

export class ZeussitError extends Error {
  constructor(
    public readonly code: ZeussitErrorCode,
    message: string,
    public readonly challenge?: Challenge
  ) {
    super(message);
    this.name = 'ZeussitError';
  }
}

export interface HttpError {
  status: number;
  code: ZeussitErrorCode;
  message: string;
  challenge?: Challenge;
}

/**
 * Map any thrown value to its HTTP-shaped representation. Non-ZeussitError
 * throws become `INTERNAL` (500) with the original message preserved.
 *
 * The single consumer-facing helper for "I caught something, what status
 * should I return?". Build whatever response shape you want on top —
 * Express JSON, Devvit menu toast, Slack message, etc.
 */
export function httpErrorFor(err: unknown): HttpError {
  const z = normalizeError(err);
  return {
    status: httpStatusFor(z.code),
    code: z.code,
    message: z.message,
    ...(z.challenge ? { challenge: z.challenge } : {}),
  };
}

// --- internals (not re-exported from `zeussit` index) -----------------------

export function httpStatusFor(code: ZeussitErrorCode): number {
  switch (code) {
    case 'UNAUTHORIZED':
      return 401;
    case 'FORBIDDEN':
      return 403;
    case 'NO_CONFIRM':
      return 409;
    case 'VALIDATION':
      return 400;
    case 'NOT_FOUND':
      return 404;
    case 'RATE_LIMITED':
      return 429;
    case 'INTERNAL':
      return 500;
  }
}

export function normalizeError(err: unknown): ZeussitError {
  if (err instanceof ZeussitError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new ZeussitError('INTERNAL', message);
}

/**
 * Write an error response with the right HTTP status for any thrown value.
 * Internal helper used by `safeRoute` — consumers building their own
 * response shape should use `httpErrorFor` instead.
 */
export function writeErrorResponse(
  res: { status: (code: number) => { json: (body: unknown) => unknown } },
  err: unknown,
  requestId: string
): void {
  const z = normalizeError(err);
  const body: Record<string, unknown> = {
    ok: false,
    code: z.code,
    message: z.message,
    requestId,
  };
  if (z.challenge) body.challenge = z.challenge;
  res.status(httpStatusFor(z.code)).json(body);
}
