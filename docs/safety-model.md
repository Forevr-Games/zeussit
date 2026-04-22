# Safety Model

zeussit layers five safety mechanisms that compose on every destructive operation. None are optional.

## The layers

| Layer | Purpose | Implementation |
|-------|---------|---------------|
| **Guard middleware** | Authorization gate | `createModeratorGuard` / `createAllowlistGuard` / custom middleware |
| **Namespace matching** | Prevent access to undeclared keys | Strict `matches()` predicate per namespace |
| **Confirm tokens** | Prevent accidental destructive ops | HMAC of op+target+timestamp, 60s TTL |
| **Rate limiter** | Prevent runaway destructive loops | In-memory token bucket, 10 destructive/min/user |
| **Audit log** | Post-hoc accountability | `logger.warn()` on every destructive success |

## Guard middleware

Mount your auth middleware before `zeussit.router()`. Two built-in options:

### Moderator guard

```ts
import { createModeratorGuard } from 'zeussit';

const guard = createModeratorGuard(checkIsModerator, {
  getUserId: () => context.userId,
  cacheMs: 30_000, // cache positive checks for 30s
});

app.use('/api/zeussit', guard, zeussit.router());
```

Positive checks are cached to avoid hammering your auth API. Denials always re-check — a transient failure won't lock legitimate users out.

### Allowlist guard

```ts
import { createAllowlistGuard } from 'zeussit';

const guard = createAllowlistGuard(['user_abc', 'user_xyz'], {
  getUserId: () => context.userId,
});
```

Or roll your own Express middleware — zeussit's router doesn't care how auth is implemented.

## Confirm tokens

Destructive operations use a two-step flow to prevent fat-finger mistakes:

```
Client                          zeussit                        Redis
  |                                |                              |
  |---  POST /confirm-challenge -->|                              |
  |     { op, target }            |                              |
  |<-- 200 { token } ------------|                              |
  |                                |                              |
  |---  POST /actions/wipe-user ->|                              |
  |     X-Zeussit-Confirm: token  |                              |
  |     { userId: "abc" }         |--- verify HMAC + TTL ------->|
  |                                |<-- OK ----------------------|
  |                                |--- execute handler -------->|
  |<-- 200 { data } -------------|                              |
```

### How it works

1. Client calls a destructive endpoint without a token
2. Server returns `409 { code: 'NO_CONFIRM', challenge: { op, target } }`
3. Client sends the challenge to `POST /confirm-challenge`
4. Server returns an HMAC token (60-second TTL)
5. Client retries the original request with `X-Zeussit-Confirm: <token>` header

### Target scoping

When an action has `targetField` set, the HMAC is scoped to `body[targetField]`. This prevents replaying a token minted for one target (e.g. `userId: "bob"`) against another (`userId: "alice"`) within the TTL window.

### Configuring the secret

The `confirmSecret` dep accepts a string or an async factory:

```ts
createZeussit({
  // Static string
  confirmSecret: process.env.ZEUSSIT_SECRET,

  // Or lazy-loaded from settings
  confirmSecret: () => settings.get('zeussitSecret'),
});
```

Use 32+ random hex characters in production. If unset, zeussit falls back to a per-process random secret and logs an error — tokens will invalidate on every restart.

**Important:** Confirm tokens are intent-confirmation, not CSRF protection. They prevent accidental ops and unattended scripted abuse. They do not protect a compromised session — treat the auth guard as the real authorization layer.

## Rate limiting

Destructive operations are rate-limited per user: 10 ops/minute by default.

```ts
createZeussit({
  rateLimitPerMin: 20, // override the default
});
```

The limiter uses an in-memory token bucket with a bounded cache. It applies to:
- All destructive HTTP requests (`POST /actions/:id` where `destructive: true`)
- Server-side `runAction()` calls with `{ asMod: true }`

Non-destructive operations are not rate-limited.

## Audit logging

Every destructive success emits a structured log entry via the injected logger:

```
logger.warn('zeussit.destructive', {
  actor: 'user_abc',
  op: 'wipe-user',
  target: 'user_xyz',
  requestId: 'a1b2c3d4e5f6'
})
```

Audit logging always fires — for both HTTP and server-side `runAction()` calls, regardless of other settings. The `requestId` lets you correlate across multiple log entries within a single request.
