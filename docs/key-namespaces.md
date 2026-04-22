# Key Namespaces

Devvit Redis has no `SCAN` or `KEYS` command, so generic "show me all keys matching `user:*`" is impossible. zeussit solves this with **registration-based discovery** — you declare what key patterns exist, and zeussit makes them inspectable.

## Registering a namespace

```ts
zeussit.registerKeyNamespace({
  id: 'player',
  group: 'users',
  describe: 'Player profiles stored as Redis hashes',
  matches: (key) => /^player:[a-zA-Z0-9_-]+$/.test(key),
  listKeys: async () =>
    redis.zRange('index:players', 0, -1).then((rs) => rs.map((r) => r.member)),
});
```

## Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique namespace identifier |
| `group?` | `string` | No | Logical grouping (e.g. `'users'`, `'gameplay'`) for UI organization |
| `describe` | `string` | Yes | Human-readable description |
| `matches` | `(key: string) => boolean` | Yes | Predicate that determines if a key belongs to this namespace |
| `listKeys?` | `() => Promise<string[]>` | No | Returns all known keys in this namespace |

## The `matches` predicate

This is the most important field. It serves two purposes:

1. **Read routing** — when you `GET /key?k=player:t2_abc`, zeussit uses `matches` to identify which namespace owns the key
2. **Write gating** — writes (`PUT /key/string`, `PATCH /key/hash`, etc.) are rejected if no namespace's `matches` returns true

**Always use strict regexes**, not `startsWith`:

```ts
// GOOD — won't accidentally match 'player-admin:secrets'
matches: (k) => /^player:[a-zA-Z0-9_-]+$/.test(k)

// BAD — matches any key starting with 'player:'
matches: (k) => k.startsWith('player:')
```

Use the `:` terminator pattern so `player:` doesn't accidentally catch `player-admin:secrets`.

## Key listing

If `listKeys` is provided, `GET /namespaces/:id/keys` returns the list. If absent, listing returns 404 — but direct inspection of a known key (`GET /key?k=player:t2_abc`) still works.

Common patterns for `listKeys`:

```ts
// From an index sorted set
listKeys: async () =>
  redis.zRange('index:players', 0, -1).then((rs) => rs.map((r) => r.member))

// From a known set of IDs
listKeys: async () => {
  const ids = await redis.get('active-room-ids');
  return ids ? JSON.parse(ids).map((id: string) => `room:${id}`) : [];
}
```

## Available endpoints

Once namespaces are registered, zeussit exposes:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/namespaces` | List all registered namespaces |
| GET | `/key?k=...` | Read a key (auto-detects type: string, hash, or zset) |
| PUT | `/key/string` | Set a string key `{ key, value, ttlSeconds? }` |
| PATCH | `/key/hash` | Update hash fields `{ key, set?, del? }` |
| DELETE | `/key?k=...` | Delete a key (destructive — requires confirm token) |
| GET | `/zset?k=...` | Read sorted set members |
| POST | `/zset/add` | Add sorted set members |
| DELETE | `/zset/rem` | Remove sorted set members |

All write operations validate the key against registered namespaces. Unregistered keys are rejected with 400.
