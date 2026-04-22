# Getting Started

This guide walks you through adding zeussit to a Devvit app — from install to your first custom action.

## Prerequisites

- A [Devvit](https://developers.reddit.com/) app with an Express server
- Express 5.x (ships with `@devvit/web >=0.12`)
- A Redis instance (Devvit provides one)

## Install

```bash
bun add zeussit
# or
npm install zeussit
```

## 1. Create the zeussit instance

Wire up zeussit where your Express app boots. All host capabilities are injected — zeussit never imports from your app code.

```ts
import { createZeussit, createModeratorGuard } from 'zeussit';

const zeussit = createZeussit({
  logger: console,
  confirmSecret: process.env.ZEUSSIT_SECRET ?? 'dev-secret-change-me',
  getUserId: () => context.userId,
  redis,
  scheduler,
});
```

### Required dependencies

| Dep | What it does |
|-----|-------------|
| `logger` | Any object with `{ info, warn, error }`. Audit entries use `warn`. |
| `confirmSecret` | HMAC secret for confirm tokens. Use 32+ random hex chars in production. Can be a string or `() => string \| Promise<string>` for lazy loading from settings. |
| `getUserId` | Returns the current user's ID. Used for rate limiting and audit logs. |
| `redis` | Your Redis client. Must match the `RedisLike` interface (Devvit's `redis` object works out of the box). |
| `scheduler` | Your scheduler client. Must match `SchedulerLike` (Devvit's `scheduler` works directly). |

## 2. Register your resources

Tell zeussit what it's allowed to inspect and operate on.

### Key namespaces

Devvit Redis has no `SCAN` or `KEYS`, so zeussit uses registration-based discovery:

```ts
zeussit.registerKeyNamespace({
  id: 'player',
  group: 'users',
  describe: 'Player profiles',
  matches: (key) => /^player:[a-zA-Z0-9_-]+$/.test(key),
  listKeys: async () =>
    redis.zRange('index:players', 0, -1).then((rs) => rs.map((r) => r.member)),
});
```

The `matches` predicate is load-bearing — it gates all write operations. Use strict regexes, not `startsWith`.

### Crons

```ts
zeussit.registerCron({ name: 'cleanup-inactive', description: 'Remove stale sessions' });
```

### Actions

```ts
zeussit.registerAction({
  id: 'add-chips',
  label: 'Add chips to a player',
  destructive: true,
  targetField: 'userId',
  schema: { userId: 'string', amount: 'number' },
  handler: async ({ userId, amount }, ctx) => {
    // your logic here
    return { added: amount, userId };
  },
});
```

## 3. Mount the router

```ts
app.use(
  '/api/zeussit',
  createModeratorGuard(checkIsModerator, {
    getUserId: () => context.userId,
    cacheMs: 30_000,
  }),
  zeussit.router()
);
```

That's it. You now have a full admin API at `/api/zeussit/*` with auth, confirmation, rate limiting, and audit logging.

## 4. Try it out

Open your browser devtools on the app and run:

```js
// List everything registered
await fetch('/api/zeussit/actions').then(r => r.json());
await fetch('/api/zeussit/namespaces').then(r => r.json());
await fetch('/api/zeussit/crons').then(r => r.json());

// Read a key
await fetch('/api/zeussit/key?k=player:t2_abc').then(r => r.json());
```

For a richer devtools experience, see the [Console Helper](./console-helper.md).

## Next steps

- [Actions Guide](./actions.md) — defining custom actions with validation and error handling
- [Key Namespaces Guide](./key-namespaces.md) — making Redis inspectable
- [Safety Model](./safety-model.md) — how confirm tokens, rate limiting, and audit logging work
- [Console Helper](./console-helper.md) — browser devtools snippet for easy interaction
