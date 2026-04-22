# zeussit

Safety-gated Express router for Redis inspection, cron control, scheduler jobs, and custom debug actions — built for [Devvit](https://developers.reddit.com/) apps.

## Why

Devvit apps run on Redis with no `SCAN`, limited observability, and no built-in admin tooling. zeussit gives you a drop-in Express router with:

- **Redis key inspection** — read/write strings, hashes, and sorted sets through registered namespaces (no wild-card access)
- **Cron list & trigger** — see registered crons and fire them on demand
- **Scheduler job control** — list, schedule, and cancel jobs
- **Custom actions** — register arbitrary ops with a type-safe handler interface
- **Safety rails** — mod-only guard, HMAC confirm tokens for destructive ops, per-user rate limiting, and structured audit logging

Everything is injected via dependency injection — zeussit has zero imports from your app code.

## Install

```bash
bun add zeussit
# or
npm install zeussit
```

Peer dependencies: `express ^5.0.0`, `@devvit/web >=0.12.0`

## Quick start

```ts
import { createZeussit, createModeratorGuard } from 'zeussit';

const z = createZeussit({
  logger,
  confirmSecret: 'your-32-char-hex-secret',
  getUserId: () => context.userId,
  redis,
  scheduler,
});

// Register what you want to expose
z.registerKeyNamespace({
  id: 'player',
  describe: 'Player profile data',
  matches: (k) => /^player:[a-z0-9_-]+$/.test(k),
});

z.registerCron({ name: 'cleanup-inactive' });

z.registerAction({
  id: 'wipe-user',
  label: 'Wipe user data',
  destructive: true,
  targetField: 'userId',
  schema: { userId: 'string' },
  handler: async ({ userId }, ctx) => {
    // your logic here
    return { wiped: userId };
  },
});

// Mount behind your auth guard
app.use(
  '/api/zeussit',
  createModeratorGuard(checkIsModerator, {
    getUserId: () => context.userId,
    cacheMs: 30_000,
  }),
  z.router()
);
```

## API

### `createZeussit(deps: Deps): Zeussit`

Creates a zeussit instance. All host capabilities are injected here:

| Field              | Type                                        | Description                                             |
| ------------------ | ------------------------------------------- | ------------------------------------------------------- |
| `logger`           | `Logger`                                    | `{ info, warn, error }` — audit entries use `warn`      |
| `confirmSecret`    | `string \| () => string \| Promise<string>` | HMAC secret for confirm tokens (32+ hex chars)          |
| `getUserId`        | `() => string \| undefined`                 | Returns the current user's ID                           |
| `redis`            | `RedisLike`                                 | Redis client matching the `RedisLike` interface         |
| `scheduler`        | `SchedulerLike`                             | Scheduler client matching the `SchedulerLike` interface |
| `validateId?`      | `(value, fieldName) => string`              | Optional ID validator (throws on invalid)               |
| `rateLimitPerMin?` | `number`                                    | Destructive op rate limit per user (default: 10)        |
| `cronManifest?`    | `Record<string, { endpoint, cron? }>`       | Cron metadata for the list endpoint                     |
| `isProductionEnv?` | `() => boolean`                             | When true, `devOnly` actions return 403                 |

### Instance methods

- **`registerKeyNamespace(ns: KeyNamespace)`** — register a Redis key pattern for inspection
- **`registerCron(cron: CronDef)`** — register a cron for list/trigger
- **`registerAction(action: ActionDef)`** — register a custom action
- **`router(): express.Router`** — returns the Express router to mount
- **`runAction(id, body, opts?)`** — invoke an action server-side (skips confirm/rate-limit by default)

### `createModeratorGuard(checkFn, opts)`

Express middleware that gates all routes behind a moderator check. Positive results are cached for `cacheMs`; denials always re-check.

### `createAllowlistGuard(allowedIds)`

Express middleware that gates routes to a static list of user IDs.

### `ZeussitError`

Typed error class with `code` field. Throw from action handlers for structured error responses:

```ts
import { ZeussitError } from 'zeussit';
throw new ZeussitError('INVALID_INPUT', 'userId is required');
```

## Routes

Once mounted, the router exposes:

| Method | Path                   | Description                    |
| ------ | ---------------------- | ------------------------------ |
| GET    | `/namespaces`          | List registered key namespaces |
| GET    | `/key?k=...`           | Read a key (auto-detects type) |
| PUT    | `/key/string`          | Set a string key               |
| PATCH  | `/key/hash`            | Update hash fields             |
| DELETE | `/key?k=...`           | Delete a key                   |
| GET    | `/crons`               | List registered crons          |
| POST   | `/crons/:name/trigger` | Trigger a cron                 |
| GET    | `/jobs`                | List scheduled jobs            |
| POST   | `/jobs`                | Schedule a new job             |
| DELETE | `/jobs/:id`            | Cancel a job                   |
| GET    | `/actions`             | List registered actions        |
| POST   | `/actions/:id`         | Execute an action              |
| POST   | `/confirm-challenge`   | Mint a confirm token           |
| GET    | `/zset?k=...`          | Read sorted set members        |
| POST   | `/zset/add`            | Add sorted set members         |
| DELETE | `/zset/rem`            | Remove sorted set members      |

## Security model

- **Mod guard** is the authentication boundary. Mount it before `z.router()`. Positive checks are cached; denials always re-check so a transient API failure won't lock mods out.
- **Confirm tokens** prevent fat-finger destructive ops by requiring a two-step (mint then spend) flow within a 60s window. They are intent-confirmation, not CSRF protection.
- **Rate limiting** applies to destructive ops: 10/min/user by default (configurable via `rateLimitPerMin`).
- **Namespace matching** prevents access to unregistered Redis keys — writes must match a registered namespace's `matches()` predicate.
- **Audit logging** fires on every destructive success via the injected logger.

### `devOnly` actions

Mark actions with `devOnly: true` to block them in production. Requires injecting `isProductionEnv` in deps:

```ts
z.registerAction({
  id: 'reset-everything',
  label: 'Nuclear reset',
  destructive: true,
  devOnly: true,
  handler: async () => {
    /* ... */
  },
});
```

## TypeScript

zeussit exports full types for all interfaces. Key types:

```ts
import type {
  ActionDef,
  ActionContext,
  KeyNamespace,
  CronDef,
  Deps,
  RedisLike,
  SchedulerLike,
  Zeussit,
  Logger,
} from 'zeussit';
```

## License

[MIT](./LICENSE) — ForeVR Games
