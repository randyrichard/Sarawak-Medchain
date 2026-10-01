import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Which companies the current unit of work acts for, carried to the database.
 *
 * Row-level security (migration 20261002090000) admits a row only if its companyId is one
 * the session names, or the session says it is cross-tenant system work. lib/prisma.ts
 * reads this before every query and hands it to Postgres. It is set at the edges, once:
 *
 *   - requireAuth: the companies in the caller's verified token;
 *   - requireApiKey: the key's one company;
 *   - the scheduler, the worker, the platform console and operator CLIs: system work;
 *   - invitation redemption: system work, because the token is the authority there and
 *     the invitee has no session yet.
 *
 * Nothing set means nothing visible. That is the point: a path nobody thought about fails
 * closed instead of reading every tenant.
 */
export type TenantScope = { companyIds: string[] } | { system: true }

const storage = new AsyncLocalStorage<TenantScope>()

/**
 * Runs `fn` - and everything it awaits, timers included - acting for these companies.
 *
 * Await the queries inside `fn`. A Prisma query runs when it is awaited, not when it is
 * written, so `runAsTenants(ids, () => db.incident.count())` hands back a query that runs
 * after the scope has ended - and therefore sees nothing.
 */
export function runAsTenants<T>(companyIds: string[], fn: () => T): T {
  return storage.run({ companyIds }, fn)
}

/**
 * Runs `fn` as cross-tenant system work. Only for code that is cross-tenant by design and
 * authorises by other means: the scheduler, the platform console behind its staff check,
 * invitation redemption behind its token, operator CLIs.
 */
export function runAsSystem<T>(fn: () => T): T {
  return storage.run({ system: true }, fn)
}

/**
 * Sets the scope for the rest of the current async flow, for an async middleware that has
 * awaited something already and cannot wrap what follows in `runAsTenants`.
 */
export function enterTenants(companyIds: string[]): void {
  storage.enterWith({ companyIds })
}

/**
 * Re-attaches the current scope to a callback that will be called from somewhere that has
 * lost it - multer calls back from the upload stream's events, not from the request.
 */
export function keepScope<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  return AsyncLocalStorage.bind(fn)
}

/** The scope in force, or null when none was set. */
export function currentScope(): TenantScope | null {
  return storage.getStore() ?? null
}

/** The two settings lib/prisma.ts passes to Postgres for the scope in force. */
export function scopeSettings(scope: TenantScope | null): { companyIds: string; bypass: string } {
  if (!scope) return { companyIds: '', bypass: 'off' }
  if ('system' in scope) return { companyIds: '', bypass: 'on' }
  // Company ids are cuids or slugs; a comma inside one would split it, so it is dropped.
  return { companyIds: scope.companyIds.filter((id) => !id.includes(',')).join(','), bypass: 'off' }
}
