import { PrismaClient } from '@prisma/client'
import { env } from '../env.js'
import { currentScope, scopeSettings, type TenantScope } from './tenantContext.js'

/**
 * The database client every service uses.
 *
 * With APP_DB_PASSWORD set it connects as the restricted `safeops_app` login and tells
 * Postgres, before each query, which companies the current request acts for - row-level
 * security then admits only their rows (see tenantContext.ts and the RLS migration).
 * Without it, it connects as DATABASE_URL's own account, which owns the tables and is
 * exempt from their policies, and nothing below runs.
 */
export const prisma = createDb()

/**
 * A client for `url`. `fixedScope` pins the scope for clients that only ever do one kind of
 * work - the worker and CLIs are system work - instead of reading it from the request.
 */
export function createDb(opts: { url?: string; enforce?: boolean; fixedScope?: TenantScope } = {}): PrismaClient {
  const base = new PrismaClient({
    datasourceUrl: opts.url ?? env.appDatabaseUrl,
    // Never log query parameters in production — they contain credentials and PII.
    log: ['warn', 'error'],
  })
  const enforce = opts.enforce ?? !!env.APP_DB_PASSWORD
  if (!enforce) return base

  const settings = () => scopeSettings(opts.fixedScope ?? currentScope())
  // Transaction-local (`true`): the values die with the transaction, so a pooled connection
  // handed to the next request carries nothing over from this one.
  const setScope = (client: PrismaClient) => {
    const s = settings()
    return client.$executeRaw`SELECT set_config('safeops.company_ids', ${s.companyIds}, true), set_config('safeops.bypass_rls', ${s.bypass}, true)`
  }

  /*
   * A setting made with set_config(..., true) lives only as long as the transaction it is
   * made in, so each query has to run in a transaction that makes it first:
   *
   *   - a query on its own is wrapped: [set_config, query] as one batch transaction;
   *   - a query already inside `$transaction(async tx => ...)` or `$transaction([...])` is
   *     left alone, because the $transaction override below made the setting at the start
   *     of that transaction.
   *
   * Prisma reports which case it is in `__internalParams.transaction`. It is an internal
   * field; securityHardening.integration.test.ts proves all three cases against a live
   * database so an upgrade that moves it fails a test rather than every query.
   */
  const extended = base.$extends({
    query: {
      $allOperations(params) {
        const { args, query } = params
        const inTransaction = (params as unknown as { __internalParams?: { transaction?: unknown } })
          .__internalParams?.transaction
        if (inTransaction) return query(args)
        return base.$transaction([setScope(base), query(args)]).then(([, result]) => result)
      },
    },
  })

  return new Proxy(extended, {
    get(target, prop, receiver) {
      if (prop !== '$transaction') return Reflect.get(target, prop, receiver)
      return (arg: unknown, options?: unknown) => {
        if (typeof arg === 'function') {
          return target.$transaction(async (tx) => {
            await setScope(tx as unknown as PrismaClient)
            return (arg as (tx: unknown) => unknown)(tx)
          }, options as never)
        }
        const list = arg as unknown[]
        return target.$transaction([setScope(target as unknown as PrismaClient), ...list] as never, options as never)
          .then((results: unknown[]) => results.slice(1))
      }
    },
  }) as unknown as PrismaClient
}
