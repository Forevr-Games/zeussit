# Console Helper

A paste-into-devtools snippet for driving zeussit from the browser console. Works from any page on the same origin as your server.

## Setup

Open browser devtools on your app and paste:

```js
(() => {
  const BASE = '/api/zeussit';

  async function req(method, path, { body, token } = {}) {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { 'X-Zeussit-Confirm': token } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, ...json };
  }

  async function send(method, path, body) {
    let r = await req(method, path, { body });
    if (r.status === 409 && r.code === 'NO_CONFIRM' && r.challenge) {
      const mint = await req('POST', '/confirm-challenge', { body: r.challenge });
      if (!mint.ok)
        throw Object.assign(new Error(mint.message ?? 'confirm-challenge failed'), {
          response: mint,
        });
      r = await req(method, path, { body, token: mint.data.token });
    }
    if (!r.ok)
      throw Object.assign(new Error(r.message ?? `HTTP ${r.status}`), { response: r });
    return r.data;
  }

  const q = (k) => encodeURIComponent(k);

  window.z = {
    // Registry introspection
    namespaces: () => send('GET', '/namespaces'),
    crons: () => send('GET', '/crons'),
    jobs: () => send('GET', '/jobs'),
    actions: () => send('GET', '/actions'),

    // Redis keys
    key: (k) => send('GET', `/key?k=${q(k)}`),
    setString: (key, value, ttlSeconds) =>
      send('PUT', '/key/string', { key, value, ttlSeconds }),
    deleteKey: (k) => send('DELETE', `/key?k=${q(k)}`),
    getHash: (k, cursor = 0) =>
      send('GET', `/key/hash?k=${q(k)}&cursor=${cursor}`),
    patchHash: (key, { set, del } = {}) =>
      send('PATCH', '/key/hash', { key, set, del }),
    getZset: (k, start = 0, stop = -1) =>
      send('GET', `/key/zset?k=${q(k)}&start=${start}&stop=${stop}`),

    // Scheduler
    triggerCron: (name, data, mode = 'scheduler') =>
      send('POST', `/crons/${q(name)}/trigger`, { mode, data }),
    cancelJob: (id) => send('DELETE', `/jobs/${q(id)}`),

    // Actions (auto-retries destructive ones with a confirm token)
    call: (id, body = {}) => send('POST', `/actions/${q(id)}`, body),

    // Escape hatch
    _raw: req,
  };

  console.log(
    'zeussit loaded. Try:  z.actions()  |  z.namespaces()  |  z.call("id", {...})'
  );
})();
```

## Usage

```js
// List registered resources
await z.actions();
await z.namespaces();
await z.crons();
await z.jobs();

// Inspect a Redis key (auto-detects type)
await z.key('player:t2_abc');

// Read a hash with cursor pagination
await z.getHash('player:t2_abc');

// Set a string key with optional TTL
await z.setString('config:motd', 'Hello world', 3600);

// Delete a key (auto-mints confirm token)
await z.deleteKey('player:t2_abc');

// Execute a custom action (auto-mints confirm token if destructive)
await z.call('wipe-user', { userId: 't2_abc' });
await z.call('add-chips', { userId: 't2_abc', amount: 1000 });

// Trigger a cron manually
await z.triggerCron('cleanup-inactive');

// Cancel a scheduled job
await z.cancelJob('job_abc123');
```

## How auto-confirm works

The helper's one trick: every call optimistically fires without a token. If the server returns `409` with a `challenge` field, the helper automatically hits `/confirm-challenge` with that payload and retries once. No hard-coded op names — the server tells the client what to mint.

This means destructive operations Just Work from the console — you don't need to manually handle the two-step flow.

## Scope

This is a developer tool, not a product surface. It assumes:

- You're on the same origin as the server
- You have moderator access (or equivalent auth)
- The console is a trusted environment

It does not protect against a malicious operator with devtools access — that's by design. If you can paste this, you can call any mod-gated endpoint.
