import { describe, it, expect } from 'vitest';
import { ZeussitError, httpErrorFor } from '../src/core/errors.js';

describe('httpErrorFor', () => {
  it('maps every ZeussitErrorCode to the right HTTP status', () => {
    expect(httpErrorFor(new ZeussitError('UNAUTHORIZED', 'x')).status).toBe(401);
    expect(httpErrorFor(new ZeussitError('NO_CONFIRM', 'x')).status).toBe(409);
    expect(httpErrorFor(new ZeussitError('VALIDATION', 'x')).status).toBe(400);
    expect(httpErrorFor(new ZeussitError('NOT_FOUND', 'x')).status).toBe(404);
    expect(httpErrorFor(new ZeussitError('RATE_LIMITED', 'x')).status).toBe(429);
    expect(httpErrorFor(new ZeussitError('INTERNAL', 'x')).status).toBe(500);
  });

  it('returns code + message + status for ZeussitError', () => {
    const err = new ZeussitError('VALIDATION', 'bad key');
    expect(httpErrorFor(err)).toEqual({
      status: 400,
      code: 'VALIDATION',
      message: 'bad key',
    });
  });

  it('NO_CONFIRM errors include the challenge payload', () => {
    const err = new ZeussitError('NO_CONFIRM', 'missing token', {
      op: 'key.delete',
      target: 'player:a',
    });
    expect(httpErrorFor(err)).toEqual({
      status: 409,
      code: 'NO_CONFIRM',
      message: 'missing token',
      challenge: { op: 'key.delete', target: 'player:a' },
    });
  });

  it('wraps non-ZeussitError throws as INTERNAL 500', () => {
    expect(httpErrorFor(new Error('boom'))).toEqual({
      status: 500,
      code: 'INTERNAL',
      message: 'boom',
    });
    expect(httpErrorFor('raw string')).toEqual({
      status: 500,
      code: 'INTERNAL',
      message: 'raw string',
    });
  });
});
