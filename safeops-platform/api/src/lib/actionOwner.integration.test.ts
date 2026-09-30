import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { IncidentService } from './incidentService.js'
import { type Caller } from '../domain/caller.js'
import { SearchService } from './searchService.js'
import { resolveOwnerId } from './actionOwner.js'

/**
 * Corrective-action ownership by account, against a REAL PostgreSQL database.
 *
 * Owned by name alone, an action was shared by everybody with that name and lost by its
 * owner the moment their account name differed from what was typed. These pin the rules
 * that replace it: the account decides when it is known, the name only when it is not,
 * and nothing that used to reach its owner stops reaching them.
 *
 * Requires a database. Skipped when DATABASE_URL is absent so CI without one stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const incidents = new IncidentService(db)
const search = new SearchService(db)

const CO = 'owner-itest-co'
const OTHER = 'owner-itest-other'
const SITE = 'owner-itest-site'

const caller = (userId: string, name: string, role: Caller['roles'][number]['role'] = 'employee'): Caller =>
  ({ userId, name, roles: [{ companyId: CO, role, siteIds: [] }] })

const manager = caller('owner-mgr', 'Manager Zainab', 'hse_manager')
const hafiz1 = caller('owner-hafiz-1', 'Muhammad Hafiz')
const hafiz2 = caller('owner-hafiz-2', 'Muhammad Hafiz')
const ahmad = caller('owner-ahmad', 'Ahmad Ali')

let incidentId = ''
const raise = (owner: string, ownerId?: string) =>
  incidents.addAction(manager, incidentId, { title: `For ${owner}`, owner, ownerId, dueDate: '2030-01-01' })

async function purge() {
  await db.notification.deleteMany({ where: { companyId: { in: [CO, OTHER] } } })
  await db.correctiveAction.deleteMany({ where: { companyId: CO } })
  await db.incident.deleteMany({ where: { companyId: CO } })
  await db.membership.deleteMany({ where: { companyId: { in: [CO, OTHER] } } })
  await db.user.deleteMany({ where: { id: { startsWith: 'owner-' } } })
  await db.site.deleteMany({ where: { companyId: CO } })
  await db.company.deleteMany({ where: { id: { in: [CO, OTHER] } } })
}

async function member(c: Caller, companyId = CO) {
  await db.user.upsert({
    where: { id: c.userId }, update: { name: c.name },
    create: { id: c.userId, email: `${c.userId}@itest.local`, name: c.name, passwordHash: 'x' },
  })
  await db.membership.create({ data: { userId: c.userId, companyId, role: c.roles[0].role } })
}

d('corrective-action ownership by account — integration (real Postgres)', () => {
  beforeAll(async () => {
    await purge()
    await db.company.create({ data: { id: CO, name: 'Owner ITest' } })
    await db.company.create({ data: { id: OTHER, name: 'Owner ITest Other' } })
    await db.site.create({ data: { id: SITE, companyId: CO, name: 'Yard', short: 'YRD', city: 'Miri' } })
    for (const c of [manager, hafiz1, hafiz2, ahmad]) await member(c)
    const inc = await incidents.create(manager, {
      companyId: CO, siteId: SITE, title: 'Dropped object', description: 'x',
      type: 'near_miss', severity: 'near_miss', location: 'Yard', department: 'Ops',
      occurredAt: new Date().toISOString(),
    })
    incidentId = inc.id
  }, 120_000)

  afterAll(async () => { await purge(); await db.$disconnect() })

  const listIds = async (c: Caller) =>
    (await incidents.listActions(c, CO, { page: 1, pageSize: 100 })).rows.map((r) => r.id)

  it('links an action to the one member with that name, and addresses its notice to them', async () => {
    const a = await raise('ahmad ali ') // case and spacing differ from the account
    expect(a.ownerId).toBe(ahmad.userId)
    const notice = await db.notification.findFirst({ where: { companyId: CO, href: `/actions?open=${a.id}` } })
    expect(notice?.recipientUserId).toBe(ahmad.userId)
  })

  it('keeps a linked action with its owner after their account is renamed', async () => {
    const a = await raise('Ahmad Ali')
    const renamed = { ...ahmad, name: 'Ahmad bin Ali' }
    expect(await listIds(renamed)).toContain(a.id)
    await expect(incidents.getAction(renamed, a.id)).resolves.toMatchObject({ id: a.id })
    await expect(incidents.updateAction(renamed, a.id, { status: 'in_progress' })).resolves.toBeTruthy()
  })

  it('does not guess between two people with the same name', async () => {
    const a = await raise('Muhammad Hafiz')
    expect(a.ownerId).toBeNull()
    // Unlinked: owned by name, exactly as before - both still see it, nobody lost it.
    expect(await listIds(hafiz1)).toContain(a.id)
    expect(await listIds(hafiz2)).toContain(a.id)
  })

  it('keeps a linked action away from somebody who merely shares the owner\'s name', async () => {
    const a = await raise('Muhammad Hafiz', hafiz1.userId)
    expect(a.ownerId).toBe(hafiz1.userId)

    expect(await listIds(hafiz1)).toContain(a.id)
    expect(await listIds(hafiz2)).not.toContain(a.id)
    await expect(incidents.getAction(hafiz2, a.id)).rejects.toMatchObject({ status: 403 })
    await expect(incidents.updateAction(hafiz2, a.id, { status: 'in_progress' })).rejects.toMatchObject({ status: 403 })
    await expect(incidents.updateAction(hafiz1, a.id, { status: 'in_progress' })).resolves.toBeTruthy()
  })

  it('still reaches an owner by name when nobody could be linked', async () => {
    const a = await raise('Late Joiner')
    expect(a.ownerId).toBeNull()
    const late = caller('owner-late', 'Late Joiner')
    await member(late)
    expect(await listIds(late)).toContain(a.id)
  })

  it('ignores an owner id that is not a member of the workspace', async () => {
    const outsider = caller('owner-outsider', 'Someone Else')
    await member(outsider, OTHER)
    expect(await resolveOwnerId(db, CO, 'Someone Else', outsider.userId)).toBeNull()
    const a = await raise('Ahmad Ali', outsider.userId)
    // Falls back to the name, which is unambiguous here.
    expect(a.ownerId).toBe(ahmad.userId)
  })

  it('applies the ownership rule without losing search\'s own filter', async () => {
    const mine = await raise('Muhammad Hafiz', hafiz1.userId)
    const hits = await search.search(hafiz2, CO, mine.code)
    // hafiz2 shares the name but not the account: the code alone must not find it.
    expect(hits.some((h) => h.id === mine.id)).toBe(false)
    const own = await search.search(hafiz1, CO, mine.code)
    expect(own.some((h) => h.id === mine.id)).toBe(true)
    // And the text filter still applies: an unrelated query finds none of hafiz1's actions.
    expect((await search.search(hafiz1, CO, 'zzqq-no-such-thing')).length).toBe(0)
  })

  it('leaves managers seeing every action, linked or not', async () => {
    const ids = await listIds(manager)
    expect(ids.length).toBeGreaterThanOrEqual(6)
  })
})
