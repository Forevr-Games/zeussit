# Actions

Actions are custom operations you register with zeussit. They're the primary extension point — anything your admin panel needs to do can be an action.

## Defining an action

```ts
import type { ActionDef } from 'zeussit';
import { ZeussitError } from 'zeussit';

export const wipeUserAction: ActionDef = {
  id: 'wipe-user',
  label: 'Wipe all user data',
  destructive: true,
  targetField: 'userId',
  schema: { userId: 'string' },
  handler: async ({ userId: raw }, ctx) => {
    const userId = String(raw);
    if (!userId) throw new ZeussitError('INVALID_INPUT', 'userId is required');

    await deleteUserData(userId);

    ctx.logger.info(`Wiped user ${userId}`, { requestId: ctx.requestId });
    return { wiped: userId };
  },
};
```

## ActionDef fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique identifier. Used in the route: `POST /actions/:id` |
| `label` | `string` | Human-readable name. Surfaced in `GET /actions` for UI rendering. |
| `destructive?` | `boolean` | When true: requires confirm token, rate-limited, audit-logged. |
| `devOnly?` | `boolean` | When true: rejected with 403 in production environments. |
| `targetField?` | `string` | Body field used to scope the confirm token HMAC. Prevents replaying a token minted for one target against another. |
| `schema?` | `Record<string, 'string' \| 'number' \| 'boolean'>` | UI hint only — surfaced in `GET /actions` so an inspector can render a form. NOT enforced by the router. Validate inside `handler`. |
| `handler` | `(body, ctx) => Promise<unknown>` | The implementation. Receives the request body and an `ActionContext`. |

## ActionContext

Your handler receives:

```ts
interface ActionContext {
  userId: string | undefined;
  requestId: string;
  logger: Logger;
}
```

- `userId` — the moderator executing the action
- `requestId` — unique per-request ID for correlation in logs
- `logger` — scoped logger instance

## Error handling

Throw `ZeussitError` for structured error responses:

```ts
import { ZeussitError } from 'zeussit';

// Returns 400 with { ok: false, code: 'INVALID_INPUT', message: '...' }
throw new ZeussitError('INVALID_INPUT', 'amount must be positive');

// Returns 404
throw new ZeussitError('NOT_FOUND', 'player not found');
```

Error codes map to HTTP status codes automatically:

| Code | HTTP Status |
|------|------------|
| `INVALID_INPUT` | 400 |
| `NOT_FOUND` | 404 |
| `CONFLICT` | 409 |
| `FORBIDDEN` | 403 |
| `INTERNAL` | 500 |

## Destructive vs non-destructive

**Non-destructive** actions (the default) execute immediately — one request, one response. Use for read-only operations or low-risk mutations.

**Destructive** actions (`destructive: true`) require a two-step flow:

1. First call returns `409 { code: 'NO_CONFIRM', challenge: { op, target } }`
2. Client mints a confirm token via `POST /confirm-challenge` with the challenge payload
3. Client retries with `X-Zeussit-Confirm: <token>` header

This prevents fat-finger operations and scripted abuse. The [Console Helper](./console-helper.md) handles this automatically.

## devOnly actions

Mark actions that should never run in production:

```ts
export const resetEverythingAction: ActionDef = {
  id: 'reset-everything',
  label: 'Nuclear reset',
  destructive: true,
  devOnly: true,
  handler: async () => {
    // only runs in dev environments
  },
};
```

Requires injecting `isProductionEnv` in deps:

```ts
const zeussit = createZeussit({
  // ...other deps
  isProductionEnv: () => process.env.NODE_ENV === 'production',
});
```

## Server-side invocation

Actions can be called directly from server code without HTTP:

```ts
const result = await zeussit.runAction('wipe-user', { userId: 't2_abc' });
```

This skips confirm tokens and rate limiting by default (trusted internal caller). Audit logging still fires for destructive ops. Opt into rate limiting with:

```ts
await zeussit.runAction('wipe-user', { userId: 't2_abc' }, { asMod: true });
```

## Auto-registration pattern

For apps with many actions, use a barrel file:

```ts
// debugActions/index.ts
export { wipeUserAction } from './wipeUser.js';
export { addChipsAction } from './addChips.js';
export { resetBonusAction } from './resetBonus.js';

// setup.ts
import * as actions from './debugActions/index.js';
for (const action of Object.values(actions)) {
  zeussit.registerAction(action);
}
```

One file per action, auto-registered at boot. No per-action wiring needed.
