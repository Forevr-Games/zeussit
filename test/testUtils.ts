import express from 'express';
import type { Deps } from '../src/types.js';
import { createZeussit } from '../src/core/zeussit.js';
import { noopLogger } from '../src/core/logger-shim.js';

export function makeFakeRedis() {
  const strings = new Map<string, { v: string; exp?: number }>();
  const hashes = new Map<string, Map<string, string>>();
  const zsets = new Map<string, Array<{ member: string; score: number }>>();
  return {
    strings,
    hashes,
    zsets,
    redis: {
      async get(k: string) {
        const e = strings.get(k);
        if (!e) return undefined;
        if (e.exp && Date.now() > e.exp) {
          strings.delete(k);
          return undefined;
        }
        return e.v;
      },
      async set(k: string, v: string, opts?: { expiration?: Date }) {
        const exp = opts?.expiration?.getTime();
        strings.set(k, exp !== undefined ? { v, exp } : { v });
      },
      async del(...keys: string[]) {
        let n = 0;
        for (const k of keys) {
          if (strings.delete(k) || hashes.delete(k) || zsets.delete(k)) n++;
        }
        return n;
      },
      async type(k: string) {
        if (strings.has(k)) return 'string';
        if (hashes.has(k)) return 'hash';
        if (zsets.has(k)) return 'zset';
        return 'none';
      },
      async exists(...keys: string[]) {
        return keys.filter((k) => strings.has(k) || hashes.has(k) || zsets.has(k)).length;
      },
      async expire(k: string, s: number) {
        const e = strings.get(k);
        if (e) e.exp = Date.now() + s * 1000;
      },
      async expireTime(k: string) {
        const e = strings.get(k);
        return e?.exp ? Math.round((e.exp - Date.now()) / 1000) : -1;
      },
      async hGetAll(k: string) {
        const m = hashes.get(k);
        return m ? Object.fromEntries(m) : {};
      },
      async hScan(k: string, _c: number) {
        const m = hashes.get(k) ?? new Map<string, string>();
        return { cursor: 0, fieldValues: [...m].map(([field, value]) => ({ field, value })) };
      },
      async hSet(k: string, rec: Record<string, string>) {
        const m = hashes.get(k) ?? new Map<string, string>();
        for (const [f, v] of Object.entries(rec)) m.set(f, v);
        hashes.set(k, m);
        return Object.keys(rec).length;
      },
      async hDel(k: string, fields: string[]) {
        const m = hashes.get(k);
        if (!m) return 0;
        let n = 0;
        for (const f of fields) if (m.delete(f)) n++;
        return n;
      },
      async zRange(k: string, start: number, stop: number) {
        const z = zsets.get(k) ?? [];
        const s = [...z].sort((a, b) => a.score - b.score);
        return s.slice(start, stop === -1 ? undefined : stop + 1);
      },
      async zAdd(k: string, ...members: Array<{ member: string; score: number }>) {
        const z = zsets.get(k) ?? [];
        for (const m of members) {
          const i = z.findIndex((x) => x.member === m.member);
          if (i >= 0) z[i] = m;
          else z.push(m);
        }
        zsets.set(k, z);
        return members.length;
      },
      async zRem(k: string, members: string[]) {
        const z = zsets.get(k);
        if (!z) return 0;
        const b = z.length;
        zsets.set(
          k,
          z.filter((x) => !members.includes(x.member))
        );
        return b - zsets.get(k)!.length;
      },
    },
  };
}

export function makeFakeScheduler() {
  const jobs: Array<{ id: string; name: string; data?: unknown }> = [];
  let seq = 0;
  return {
    jobs,
    scheduler: {
      async runJob({ name, data }: { name: string; data?: unknown; runAt: Date }) {
        const id = `job-${++seq}`;
        jobs.push({ id, name, data });
        return id;
      },
      async listJobs() {
        return [...jobs];
      },
      async cancelJob(id: string) {
        const i = jobs.findIndex((j) => j.id === id);
        if (i >= 0) jobs.splice(i, 1);
      },
    },
  };
}

export function makeApp(overrides: Partial<Deps> = {}) {
  const fr = makeFakeRedis();
  const fs = makeFakeScheduler();
  const deps: Deps = {
    logger: noopLogger,
    confirmSecret: 'test-secret',
    getUserId: () => 'u-mod',
    redis: fr.redis,
    scheduler: fs.scheduler,
    ...overrides,
  };
  const z = createZeussit(deps);
  const app = express();
  app.use(express.json());
  app.use('/z', z.router());
  return { app, z, deps, fakes: { redis: fr, scheduler: fs } };
}
