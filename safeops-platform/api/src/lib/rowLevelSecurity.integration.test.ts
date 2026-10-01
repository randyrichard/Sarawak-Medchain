import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { APP_DB_ROLE } from '../env.js'
import { ensureAppRole } from './dbRole.js'
import { createDb } from './prisma.js'
import { runAsSystem, runAsTenants } from './tenantContext.js'

/**
 * Row-level security, against a REAL PostgreSQL database, connected as the restricted login.
 *
 * The rest of the suite proves the application keeps tenants apart. This proves the
 * database does too, on its own: queries that name another company's rows outright - the
 * shape of a missing check in some future service - get nothing back and can change
 * nothing. Also that the login itself is what it claims to be: no superuser, no DDL.
 *
 * Requires a database. Skipped when DATABASE_URL is absent so CI without one stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const PASSWORD = process.env.APP_DB_PASSWORD ?? 'rls-itest-password-not-real'
const A = 'rls-itest-a'
const B = 'rls-itest-b'
const owner = new PrismaClient()
let app: PrismaClient

function appUrl() {
  const u = new URL(process.env.DATABASE_URL!)
  u.username = APP_DB_ROLE
  u.password = PASSWORD
  return u.toString()
}

const incident = (companyId: string, n: number) => ({
  number: `${companyId}-${n}`, companyId, siteId: `${companyId}-site`, title: `Incident ${n}`,
  type: 'near_miss' as const, severity: 'Minor' as const, location: 'Deck', reporter: 'x', occurredAt: new Date(),
})

async function purge() {
  await owner.incident.deleteMany({ where: { companyId: { in: [A, B] } } })
  await owner.site.deleteMany({ where: { companyId: { in: [A, B] } } })
  await owner.company.deleteMany({ where: { id: { in: [A, B] } } })
}

d('row-level security — integration (real Postgres, restricted login)', () => {
  beforeAll(async () => {
    await ensureAppRole(owner, PASSWORD)
    app = createDb({ url: appUrl(), enforce: true })
    await purge()
    for (const id of [A, B]) {
      await owner.company.create({ data: { id, name: id } })
      await owner.site.create({ data: { id: `${id}-site`, companyId: id, name: 'Yard' } })
      await owner.incident.create({ data: incident(id, 1) })
    }
  })

  afterAll(async () => {
    await purge()
    await app?.$disconnect()
    await owner.$disconnect()
  })

  it('connects as a login that is neither superuser nor exempt from policies', async () => {
    const [me] = await app.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean; current_user: string }[]>`
      SELECT rolsuper, rolbypassrls, current_user FROM pg_roles WHERE rolname = current_user`
    expect(me).toMatchObject({ current_user: APP_DB_ROLE, rolsuper: false, rolbypassrls: false })
  })

  it('cannot change the schema, read the migrations table or run programs', async () => {
    await expect(runAsSystem(async () => app.$executeRawUnsafe('CREATE TABLE rls_itest_x (id int)'))).rejects.toThrow()
    await expect(runAsSystem(async () => app.$executeRawUnsafe('DROP TABLE "Incident"'))).rejects.toThrow()
    await expect(runAsSystem(async () => app.$queryRawUnsafe('SELECT * FROM "_prisma_migrations"'))).rejects.toThrow()
    await expect(runAsSystem(async () => app.$executeRawUnsafe("COPY (SELECT 1) TO PROGRAM 'true'"))).rejects.toThrow()
  })

  it('shows nothing, and accepts nothing, when no company has been named', async () => {
    expect(await app.incident.count({ where: { companyId: { in: [A, B] } } })).toBe(0)
    await expect(app.incident.create({ data: incident(A, 2) })).rejects.toThrow()
  })

  it("keeps a caller to their own company's rows even when a query asks for another's", async () => {
    await runAsTenants([A], async () => {
      // No companyId filter at all: the policy is the only thing narrowing this.
      const all = await app.incident.findMany({ where: { companyId: { in: [A, B] } }, select: { companyId: true } })
      expect(all.map((r) => r.companyId)).toEqual([A])

      const theirs = await owner.incident.findFirstOrThrow({ where: { companyId: B } })
      expect(await app.incident.findUnique({ where: { id: theirs.id } })).toBeNull()
      expect((await app.incident.updateMany({ where: { id: theirs.id }, data: { title: 'changed' } })).count).toBe(0)
      expect((await app.incident.deleteMany({ where: { id: theirs.id } })).count).toBe(0)
      // Writing a row into another company is refused by the policy's WITH CHECK.
      await expect(app.incident.create({ data: incident(B, 3) })).rejects.toThrow()
      // Nor can one of its own rows be moved into another company.
      const mine = await app.incident.findFirstOrThrow({ where: { companyId: A } })
      await expect(app.incident.update({ where: { id: mine.id }, data: { companyId: B, siteId: `${B}-site` } })).rejects.toThrow()
    })
    expect((await owner.incident.findFirstOrThrow({ where: { companyId: B } })).title).toBe('Incident 1')
  })

  it('applies inside both kinds of transaction, not only to single queries', async () => {
    await runAsTenants([A], async () => {
      const interactive = await app.$transaction(async (tx) =>
        tx.incident.findMany({ where: { companyId: { in: [A, B] } }, select: { companyId: true } }))
      expect(interactive.map((r) => r.companyId)).toEqual([A])

      const [a, b] = await app.$transaction([
        app.incident.count({ where: { companyId: A } }),
        app.incident.count({ where: { companyId: B } }),
      ])
      expect([a, b]).toEqual([1, 0])
    })
  })

  it('lets system work - the scheduler, the platform console - see every company', async () => {
    // `async`, and that matters: a Prisma query runs when it is awaited, not when it is
    // written, so one returned un-awaited from the scope would run after the scope ended.
    const n = await runAsSystem(async () => app.incident.count({ where: { companyId: { in: [A, B] } } }))
    expect(n).toBe(2)
  })

  it('never carries one request’s scope to the next on a pooled connection', async () => {
    await runAsSystem(async () => app.incident.count())
    // Same pool, no scope: back to nothing.
    expect(await app.incident.count({ where: { companyId: { in: [A, B] } } })).toBe(0)
    const [inA, none] = await Promise.all([
      runAsTenants([A], async () => app.incident.count({ where: { companyId: { in: [A, B] } } })),
      app.incident.count({ where: { companyId: { in: [A, B] } } }),
    ])
    expect([inA, none]).toEqual([1, 0])
  })
})
