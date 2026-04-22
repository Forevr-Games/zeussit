import type { Request } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ZeussitError } from './errors.js';

const TTL_MS = 60_000;

interface MintArgs {
  op: string;
  target: string;
  secret: string;
}
interface VerifyArgs extends MintArgs {
  token: string;
}

function sign(op: string, target: string, ts: number, secret: string): string {
  return createHmac('sha256', secret).update(`${op}|${target}|${ts}`).digest('hex');
}

export function mintConfirmToken({ op, target, secret }: MintArgs): string {
  const ts = Date.now();
  return `${ts}.${sign(op, target, ts, secret)}`;
}

export function verifyConfirmToken({ token, op, target, secret }: VerifyArgs): boolean {
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot < 1) return false;
  const ts = Number(token.slice(0, dot));
  const sig = token.slice(dot + 1);
  if (!sig || !Number.isFinite(ts) || Date.now() - ts > TTL_MS) return false;
  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(sign(op, target, ts, secret), 'hex');
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function resolveSecret(s: string | (() => string | Promise<string>)): Promise<string> {
  return typeof s === 'function' ? s() : s;
}

export function requireConfirm(req: Request, op: string, target: string, secret: string): void {
  const token = (req.header('X-Zeussit-Confirm') ?? '').trim();
  if (!token) throw new ZeussitError('NO_CONFIRM', 'missing confirm token', { op, target });
  if (!verifyConfirmToken({ token, op, target, secret })) {
    throw new ZeussitError('NO_CONFIRM', 'invalid/expired token', { op, target });
  }
}
