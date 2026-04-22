import type { Logger } from './core/logger-shim.js';

export interface ActionContext {
  userId: string | undefined;
  requestId: string;
  logger: Logger;
}

export interface KeyNamespace {
  id: string;
  group?: string;
  describe: string;
  matches: (key: string) => boolean;
  listKeys?: () => Promise<string[]>;
}

export interface CronDef {
  name: string;
  description?: string;
}

export interface ActionDef {
  id: string;
  label: string;
  destructive?: boolean;
  /**
   * When true, the router rejects with 403 FORBIDDEN in production
   * environments (`Deps.isProductionEnv?.() === true`). Use for ops that
   * could corrupt or grief real-user state — `create-orphaned-lock`,
   * `reset-free-chips`, etc. No-op if `isProductionEnv` isn't injected.
   */
  devOnly?: boolean;
  /**
   * UI hint only — surfaced via `GET /actions` so an inspector can render a
   * form. NOT enforced by the router. Validate inside `handler` using
   * `assertPositiveInt`/`assertRedditUserId` (or zod, etc).
   */
  schema?: Record<string, 'string' | 'number' | 'boolean'>;
  /**
   * When set, the confirm-token HMAC for this action is scoped to
   * `body[targetField]` rather than just the action id. Prevents replaying a
   * confirm minted for one target (e.g. `userId: bob`) against another
   * (`userId: alice`) within the 60s TTL. If the field is missing or
   * non-string the target falls back to the action id.
   */
  targetField?: string;
  handler: (body: Record<string, unknown>, ctx: ActionContext) => Promise<unknown>;
}

export interface RedisLike {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, opts?: { expiration?: Date }): Promise<void>;
  del(...keys: string[]): Promise<number>;
  type(key: string): Promise<string>;
  exists(...keys: string[]): Promise<number>;
  expire(key: string, seconds: number): Promise<void>;
  expireTime(key: string): Promise<number>;
  hGetAll(key: string): Promise<Record<string, string>>;
  hScan(
    key: string,
    cursor: number
  ): Promise<{ cursor: number; fieldValues: Array<{ field: string; value: string }> }>;
  hSet(key: string, rec: Record<string, string>): Promise<number>;
  hDel(key: string, fields: string[]): Promise<number>;
  zRange(
    key: string,
    start: number,
    stop: number
  ): Promise<Array<{ member: string; score: number }>>;
  zAdd(key: string, ...members: Array<{ member: string; score: number }>): Promise<number>;
  zRem(key: string, members: string[]): Promise<number>;
}

export interface SchedulerLike {
  runJob(opts: { name: string; data?: unknown; runAt: Date }): Promise<string>;
  listJobs(): Promise<Array<{ id: string; name: string; data?: unknown }>>;
  cancelJob(id: string): Promise<void>;
}

export interface Deps {
  logger: Logger;
  validateId?: (value: unknown, fieldName: string) => string;
  confirmSecret: string | (() => string | Promise<string>);
  rateLimitPerMin?: number;
  getUserId: () => string | undefined;
  redis: RedisLike;
  scheduler: SchedulerLike;
  cronManifest?: Record<string, { endpoint: string; cron?: string }>;
  /**
   * Host-supplied predicate. When it returns true, any `ActionDef.devOnly`
   * action is rejected with 403 FORBIDDEN. Omit in dev/test hosts.
   */
  isProductionEnv?: () => boolean;
}
