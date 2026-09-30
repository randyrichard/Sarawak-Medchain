import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { IncidentService } from './incidentService.js'
import { type Caller } from '../domain/caller.js'

/**
 * Integration tests against a REAL PostgreSQL database.
 *
 * The subject is `clientRef`: the key a phone attaches to a report it queued while offline,
 * so that replaying the report cannot file the injury twice.
 *
 * This has to be tested against real Postgres rather than a mock, because the guarantee is
 * a unique index and the interesting case is two inserts racing it. A mock would only prove
 * the `findFirst` shortcut works, which is the half that was never in doubt.
 *
 * Requires a database: `npm run db:start && npm run prisma:migrate`.
 * Skipped automatically when DATABASE_URL is absent so CI without a DB stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const incidents = new IncidentService(db)

const COMPANY = 'idem-itest-co'
const OTHER = 'idem-itest-other'
const SITE = 'idem-itest-site'
const OTHER_SITE = 'idem-itest-other-site'

const role = (r: string, id: string, companyId = COMPANY): Caller => ({
  userId: `idem-${id}`, name: `ITest ${id}`,
  roles: [{ companyId, role: r as never, siteIds: [] }],
})

const admin = role('admin', 'Admin')
const otherAdmin = role('admin', 'Other', OTHER)

let seq = 0
const report = (over: Record<string, unknown> = {}) => {
  seq += 1
  return incidents.create(admin, {
    companyId: COMPANY, siteId: SITE,
    title: `Idem itest ${seq}`, type: 'injury', severity: 'Minor',
    location: 'Workshop', occurredAt: new Date().toISOString(),
    ...over,
  } as never)
}

async function purge() {
  for (const id of [COMPANY, OTHER]) {
    await db.incidentEvent.deleteMany({ where: { incident: { companyId: id } } })
    await db.correctiveAction.deleteMany({ where: { companyId: id } })
    await db.incident.deleteMany({ where: { companyId: id } })
    await db.notification.deleteMany({ where: { companyId: id } })
  }
}

d('Incident idempotency (clientRef) — integration (real Postgres)', () => {
  beforeAll(async () => {
    for (const [id, name] of [[COMPANY, 'Idem ITest Co'], [OTHER, 'Idem ITest Other']]) {
      await db.company.upsert({ where: { id }, update: {}, create: { id, name } })
    }
    for (const [id, companyId, name] of [
      [SITE, COMPANY, 'Idem Site'], [OTHER_SITE, OTHER, 'Other Site'],
    ]) {
      await db.site.upsert({
        where: { id }, update: {},
        create: { id, companyId, name, short: 'IDM', city: 'Bintulu' },
      })
    }
  })

  afterAll(async () => {
    await purge()
    await db.site.deleteMany({ where: { id: { in: [SITE, OTHER_SITE] } } })
    await db.company.deleteMany({ where: { id: { in: [COMPANY, OTHER] } } })
    await db.counter.deleteMany({ where: { companyId: { in: [COMPANY, OTHER] } } })
    await db.$disconnect()
  })

  beforeEach(purge)

  it('replaying a queued report returns the same incident instead of filing a second', async () => {
    const ref = crypto.randomUUID()

    const first = await report({ clientRef: ref, title: 'Hand laceration, press shop' })
    const replay = await report({ clientRef: ref, title: 'Hand laceration, press shop' })

    expect(replay.id).toBe(first.id)
    expect(replay.number).toBe(first.number)

    const rows = await db.incident.count({ where: { companyId: COMPANY, clientRef: ref } })
    expect(rows).toBe(1)
  })

  it('does not burn an INC number on the replay', async () => {
    // The counter is what generates INC-####. If a replay incremented it, the register
    // would show gaps and each retry would consume a reference that no incident uses.
    const ref = crypto.randomUUID()
    const first = await report({ clientRef: ref })
    await report({ clientRef: ref })
    await report({ clientRef: ref })

    const next = await report({}) // a genuinely new report
    const firstNo = Number(first.number.replace('INC-', ''))
    const nextNo = Number(next.number.replace('INC-', ''))
    expect(nextNo).toBe(firstNo + 1)
  })

  it('files two incidents when two different reports are queued', async () => {
    const a = await report({ clientRef: crypto.randomUUID(), title: 'Slip on stair' })
    const b = await report({ clientRef: crypto.randomUUID(), title: 'Dropped load' })

    expect(b.id).not.toBe(a.id)
    expect(await db.incident.count({ where: { companyId: COMPANY } })).toBe(2)
  })

  it('survives two copies of one queued report arriving at the same moment', async () => {
    // Two tabs draining the outbox together. The findFirst shortcut cannot help here -
    // neither sees the other's row yet - so this is the unique index and the P2002 catch.
    const ref = crypto.randomUUID()

    const results = await Promise.all([
      report({ clientRef: ref, title: 'Concurrent drain' }),
      report({ clientRef: ref, title: 'Concurrent drain' }),
      report({ clientRef: ref, title: 'Concurrent drain' }),
    ])

    const ids = new Set(results.map((r) => r.id))
    expect(ids.size).toBe(1)
    expect(await db.incident.count({ where: { companyId: COMPANY, clientRef: ref } })).toBe(1)
  })

  it('scopes the key per company, so one tenant cannot occupy a key another tenant will generate', async () => {
    const ref = crypto.randomUUID()
    const mine = await report({ clientRef: ref })

    const theirs = await incidents.create(otherAdmin, {
      companyId: OTHER, siteId: OTHER_SITE,
      title: 'Their report', type: 'injury', severity: 'Minor',
      location: 'Yard', occurredAt: new Date().toISOString(), clientRef: ref,
    } as never)

    // Same key, different workspaces, two genuinely separate incidents.
    expect(theirs.id).not.toBe(mine.id)
  })

  it('still files reports that carry no key at all', async () => {
    // The form posts without one. Postgres treats NULLs as distinct, so any number of rows
    // may leave the column empty without colliding.
    const a = await report()
    const b = await report()
    expect(b.id).not.toBe(a.id)
    expect(await db.incident.count({ where: { companyId: COMPANY, clientRef: null } })).toBe(2)
  })
})
