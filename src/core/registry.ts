import type { KeyNamespace, CronDef, ActionDef } from '../types.js';
import { ZeussitError } from './errors.js';

export class ZeussitRegistry {
  private namespaces = new Map<string, KeyNamespace>();
  private crons = new Map<string, CronDef>();
  private actions = new Map<string, ActionDef>();

  registerKeyNamespace(ns: KeyNamespace): void {
    if (this.namespaces.has(ns.id))
      throw new ZeussitError('VALIDATION', `duplicate namespace: ${ns.id}`);
    this.namespaces.set(ns.id, ns);
  }
  registerCron(cron: CronDef): void {
    if (this.crons.has(cron.name))
      throw new ZeussitError('VALIDATION', `duplicate cron: ${cron.name}`);
    this.crons.set(cron.name, cron);
  }
  registerAction(action: ActionDef): void {
    if (this.actions.has(action.id))
      throw new ZeussitError('VALIDATION', `duplicate action: ${action.id}`);
    this.actions.set(action.id, action);
  }
  listNamespaces() {
    return [...this.namespaces.values()].map((n) => ({
      id: n.id,
      describe: n.describe,
      group: n.group,
      listable: typeof n.listKeys === 'function',
      writable: true,
    }));
  }
  getNamespace(id: string) {
    return this.namespaces.get(id);
  }
  findNamespaceForKey(key: string) {
    return [...this.namespaces.values()].find((n) => n.matches(key));
  }
  listCrons() {
    return [...this.crons.values()];
  }
  getCron(name: string) {
    return this.crons.get(name);
  }
  listActions() {
    return [...this.actions.values()].map((a) => ({
      id: a.id,
      label: a.label,
      destructive: !!a.destructive,
      devOnly: !!a.devOnly,
      schema: a.schema ?? null,
      targetField: a.targetField ?? null,
    }));
  }
  getAction(id: string) {
    return this.actions.get(id);
  }
}
