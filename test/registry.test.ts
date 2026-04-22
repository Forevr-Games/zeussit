import { describe, it, expect } from 'vitest';
import { ZeussitRegistry } from '../src/core/registry.js';

describe('ZeussitRegistry', () => {
  it('registers + lists namespaces', () => {
    const r = new ZeussitRegistry();
    r.registerKeyNamespace({ id: 'user', describe: 'u', matches: (k) => /^user:/.test(k) });
    expect(r.listNamespaces()).toEqual([
      { id: 'user', describe: 'u', group: undefined, listable: false, writable: true },
    ]);
  });
  it('rejects duplicate ids', () => {
    const r = new ZeussitRegistry();
    r.registerKeyNamespace({ id: 'user', describe: 'a', matches: () => true });
    expect(() =>
      r.registerKeyNamespace({ id: 'user', describe: 'b', matches: () => true })
    ).toThrow(/duplicate/);
  });
  it('finds matching namespace via strict predicate', () => {
    const r = new ZeussitRegistry();
    r.registerKeyNamespace({ id: 'u', describe: 'u', matches: (k) => /^user:[a-z]+$/.test(k) });
    expect(r.findNamespaceForKey('user:abc')?.id).toBe('u');
    expect(r.findNamespaceForKey('user:abc:secrets')).toBeUndefined();
  });
  it('registers crons + actions', async () => {
    const r = new ZeussitRegistry();
    r.registerCron({ name: 'x', description: 'X' });
    r.registerAction({
      id: 'wipe',
      label: 'W',
      destructive: true,
      handler: async (b) => ({ r: b }),
    });
    expect(r.listCrons()).toEqual([{ name: 'x', description: 'X' }]);
    expect(r.getAction('wipe')?.destructive).toBe(true);
    expect(await r.getAction('wipe')!.handler({ a: 1 }, {} as never)).toEqual({ r: { a: 1 } });
  });
});
