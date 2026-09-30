import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { NotificationError, NotificationService } from './notificationService.js'
import type { Caller } from '../domain/caller.js'

/**
 * Integration tests — these run against a REAL PostgreSQL database, not a fake.
 *
 * The property worth protecting is that read state is per person. The store this
 * replaces kept one list in one browser, so "mark as read" was implicitly private; on a
 * shared server the naive version marks an alert read for the entire site the moment one
 * person opens their bell. That is a join question, so it is answered against real rows.
 *
 * Requires a database: `npm run db:start && npm run prisma:migrate`.
 * Skipped automatically when DATABASE_URL is absent so CI without a DB stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const svc = new NotificationService(db)

const COMPANY = 'ntf-itest-co'
const OTHER = 'ntf-itest-other-co'

const alice: Caller = {
  userId: 'ntf-alice', name: 'Alice',
  roles: [{ companyId: COMPANY, role: 'hse_manager', siteIds: [] }],
}
const bob: Caller = {
  userId: 'ntf-bob', name: 'Bob',
  roles: [{ companyId: COMPANY, role: 'safety_officer', siteIds: [] }],
}
const outsider: Caller = {
  userId: 'ntf-out', name: 'Outsider',
  roles: [{ companyId: OTHER, role: 'admin', siteIds: [] }],
}

d('NotificationService — integration (real Postgres)', () => {
  beforeAll(async () => {
    for (const [id, name] of [[COMPANY, 'NTF ITest Co'], [OTHER, 'NTF Other Co']]) {
      await db.company.upsert({ where: { id }, update: {}, create: { id, name } })
    }
  })

  afterAll(async () => {
    await db.company.deleteMany({ where: { id: { in: [COMPANY, OTHER] } } })
    await db.$disconnect()
  })

  it('raises a notification for the workspace and lists it unread', async () => {
    const created = await svc.create(alice, COMPANY, {
      kind: 'incident', title: 'Permit PTW-4401 suspended', detail: 'Gas test failed.',
    })
    expect(created.companyId).toBe(COMPANY)

    const feed = await svc.list(alice, COMPANY)
    const mine = feed.find((n) => n.id === created.id)!
    expect(mine.title).toBe('Permit PTW-4401 suspended')
    expect(mine.readAt).toBeNull()
  })

  it('keeps read state per person', async () => {
    const n = await svc.create(alice, COMPANY, { kind: 'action', title: 'CA-404 assigned' })

    await svc.markRead(alice, COMPANY, n.id)

    // Alice has read it...
    const asAlice = await svc.list(alice, COMPANY)
    expect(asAlice.find((x) => x.id === n.id)?.readAt).not.toBeNull()

    // ...and Bob has not. One person clearing their bell must not clear the site's.
    const asBob = await svc.list(bob, COMPANY)
    expect(asBob.find((x) => x.id === n.id)?.readAt).toBeNull()
  })

  it('marks read idempotently', async () => {
    const n = await svc.create(alice, COMPANY, { kind: 'system', title: 'Digest ready' })
    await svc.markRead(bob, COMPANY, n.id)
    await svc.markRead(bob, COMPANY, n.id)

    expect(await db.notificationRead.count({ where: { notificationId: n.id } })).toBe(1)
  })

  it('marks everything read for one person only', async () => {
    await svc.create(alice, COMPANY, { kind: 'audit', title: 'Finding F-3110 raised' })
    await svc.create(alice, COMPANY, { kind: 'audit', title: 'Finding F-3111 raised' })

    const r = await svc.markAllRead(bob, COMPANY)
    expect(r.marked).toBeGreaterThan(0)

    const asBob = await svc.list(bob, COMPANY)
    expect(asBob.every((n) => n.readAt !== null)).toBe(true)

    // Alice still has unread items — hers were not touched.
    const asAlice = await svc.list(alice, COMPANY)
    expect(asAlice.some((n) => n.readAt === null)).toBe(true)

    // And a second sweep has nothing left to do.
    expect((await svc.markAllRead(bob, COMPANY)).marked).toBe(0)
  })

  it('orders the feed newest first', async () => {
    const feed = await svc.list(alice, COMPANY)
    const times = feed.map((n) => n.createdAt.getTime())
    expect([...times].sort((a, b) => b - a)).toEqual(times)
  })

  it('rejects an unknown kind or an empty title', async () => {
    await expect(svc.create(alice, COMPANY, { kind: 'gossip', title: 'Nope' }))
      .rejects.toMatchObject({ code: 'validation' })
    await expect(svc.create(alice, COMPANY, { kind: 'system', title: '   ' }))
      .rejects.toMatchObject({ code: 'validation' })
  })

  it('keeps notifications inside their workspace', async () => {
    const theirs = await svc.create(outsider, OTHER, { kind: 'system', title: 'Their alert' })

    const mine = await svc.list(alice, COMPANY)
    expect(mine.some((n) => n.id === theirs.id)).toBe(false)

    await expect(svc.list(outsider, COMPANY)).rejects.toMatchObject({ status: 403 })
    await expect(svc.create(outsider, COMPANY, { kind: 'system', title: 'Injected' }))
      .rejects.toMatchObject({ status: 403 })
    // A real id from another tenant is not markable from here.
    await expect(svc.markRead(alice, COMPANY, theirs.id)).rejects.toMatchObject({ status: 404 })
    await expect(svc.markRead(alice, COMPANY, 'no-such-id')).rejects.toBeInstanceOf(NotificationError)
  })

  it('cascades read state with the notification and the tenant', async () => {
    const n = await svc.create(alice, COMPANY, { kind: 'system', title: 'To be deleted' })
    await svc.markRead(alice, COMPANY, n.id)

    await db.notification.delete({ where: { id: n.id } })
    expect(await db.notificationRead.count({ where: { notificationId: n.id } })).toBe(0)

    const TMP = 'ntf-cascade-co'
    await db.company.upsert({ where: { id: TMP }, update: {}, create: { id: TMP, name: 'Cascade' } })
    const tmp: Caller = {
      userId: 'x', name: 'Tmp', roles: [{ companyId: TMP, role: 'admin', siteIds: [] }],
    }
    const doomed = await svc.create(tmp, TMP, { kind: 'system', title: 'Goes with the tenant' })
    await db.company.delete({ where: { id: TMP } })
    expect(await db.notification.count({ where: { id: doomed.id } })).toBe(0)
  })
})
