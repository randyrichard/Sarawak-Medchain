import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { SearchError, SearchService } from './searchService.js'
import type { Caller } from '../domain/caller.js'

/**
 * Integration tests — these run against a REAL PostgreSQL database, not a fake.
 *
 * A search box reaches across every register at once, which makes it the easiest place in
 * an application to leak another tenant's data: one forgotten `companyId` and a customer
 * can type a competitor's permit number and read the result. So most of what is tested
 * here is what search must NOT return.
 *
 * Requires a database: `npm run db:start && npm run prisma:migrate`.
 * Skipped automatically when DATABASE_URL is absent so CI without a DB stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const svc = new SearchService(db)

const MINE = 'search-itest-mine'
const THEIRS = 'search-itest-theirs'
const SITE_A = 'search-itest-a'
const SITE_B = 'search-itest-b'
const SITE_THEIRS = 'search-itest-theirs-site'

const manager: Caller = {
  userId: 'search-mgr', name: 'Manager',
  roles: [{ companyId: MINE, role: 'hse_manager', siteIds: [] }],
}
/** Restricted to site A only — the site-scoping case. */
const supervisor: Caller = {
  userId: 'search-sup', name: 'Supervisor',
  roles: [{ companyId: MINE, role: 'supervisor', siteIds: [SITE_A] }],
}
const outsider: Caller = {
  userId: 'search-out', name: 'Outsider',
  roles: [{ companyId: THEIRS, role: 'admin', siteIds: [] }],
}

d('SearchService — integration (real Postgres)', () => {
  beforeAll(async () => {
    for (const [id, name] of [[MINE, 'Search Mine'], [THEIRS, 'Search Theirs']]) {
      await db.company.upsert({ where: { id }, update: {}, create: { id, name } })
    }
    for (const [id, companyId] of [[SITE_A, MINE], [SITE_B, MINE], [SITE_THEIRS, THEIRS]]) {
      await db.site.upsert({
        where: { id }, update: {},
        create: { id, companyId, name: `Site ${id}`, short: id, city: 'Kuching' },
      })
    }

    await db.incident.createMany({
      data: [
        { number: 'INC-SEARCH-1', companyId: MINE, siteId: SITE_A, title: 'Ladder slipped on the gantry', type: 'near_miss', severity: 'Minor', location: 'Gantry', reporter: 'A', occurredAt: new Date() },
        { number: 'INC-SEARCH-2', companyId: MINE, siteId: SITE_B, title: 'Ladder stored badly', type: 'unsafe_condition', severity: 'Minor', location: 'Store', reporter: 'A', occurredAt: new Date() },
        { number: 'INC-SEARCH-3', companyId: MINE, siteId: SITE_A, title: 'Archived ladder report', type: 'near_miss', severity: 'Minor', location: 'Yard', reporter: 'A', occurredAt: new Date(), archived: true },
        { number: 'INC-SECRET-9', companyId: THEIRS, siteId: SITE_THEIRS, title: 'Ladder incident belonging to another tenant', type: 'near_miss', severity: 'Minor', location: 'Elsewhere', reporter: 'B', occurredAt: new Date() },
      ],
    })
    await db.permit.createMany({
      data: [
        { code: 'PTW-SEARCH-1', companyId: MINE, siteId: SITE_A, type: 'hot_work', title: 'Weld the ladder bracket', location: 'Gantry', applicant: 'A', validFrom: new Date(), validTo: new Date(Date.now() + 3600_000), createdBy: 'itest' },
        { code: 'PTW-SECRET-9', companyId: THEIRS, siteId: SITE_THEIRS, type: 'hot_work', title: 'Another tenant ladder permit', location: 'Elsewhere', applicant: 'B', validFrom: new Date(), validTo: new Date(Date.now() + 3600_000), createdBy: 'itest' },
      ],
    })
    await db.asset.createMany({
      data: [
        { code: 'AST-SEARCH-1', qrKey: 'AST-SEARCH-1', companyId: MINE, siteId: SITE_A, name: 'Extension ladder 6m', category: 'ladder', serialNumber: 'LDR-XYZ-99', owner: 'A', frequency: 'monthly', nextDueDate: new Date(), createdBy: 'itest' },
      ],
    })
    await db.correctiveAction.createMany({
      data: [
        { code: 'CA-SEARCH-1', companyId: MINE, siteId: SITE_A, title: 'Replace the ladder feet', owner: 'A', dueDate: new Date(), createdBy: 'itest' },
      ],
    })
  })

  afterAll(async () => {
    await db.company.deleteMany({ where: { id: { in: [MINE, THEIRS] } } })
    await db.$disconnect()
  })

  const codes = (hits: { code: string }[]) => hits.map((h) => h.code)

  it('finds a record by its exact reference', async () => {
    const hits = await svc.search(manager, MINE, 'INC-SEARCH-1')
    expect(codes(hits)).toContain('INC-SEARCH-1')
  })

  it('is case-insensitive, because nobody types the case of a reference', async () => {
    const hits = await svc.search(manager, MINE, 'ptw-search-1')
    expect(codes(hits)).toContain('PTW-SEARCH-1')
  })

  it('searches titles across every register at once', async () => {
    const hits = await svc.search(manager, MINE, 'ladder')
    const kinds = new Set(hits.map((h) => h.kind))
    expect(kinds).toContain('incident')
    expect(kinds).toContain('permit')
    expect(kinds).toContain('asset')
    expect(kinds).toContain('action')
  })

  it('finds an asset by serial number', async () => {
    const hits = await svc.search(manager, MINE, 'LDR-XYZ-99')
    expect(codes(hits)).toContain('AST-SEARCH-1')
  })

  it('puts an exact reference match first', async () => {
    const hits = await svc.search(manager, MINE, 'INC-SEARCH-2')
    expect(hits[0].code).toBe('INC-SEARCH-2')
  })

  // ── What it must not return ────────────────────────────────────────────────

  it('never returns another tenant\'s records', async () => {
    const hits = await svc.search(manager, MINE, 'ladder')
    const serialised = JSON.stringify(hits)
    expect(serialised).not.toContain('SECRET')
    expect(serialised).not.toContain(THEIRS)
  })

  it('refuses a workspace the caller is not a member of', async () => {
    await expect(svc.search(outsider, MINE, 'ladder')).rejects.toThrow(SearchError)
  })

  it('honours a site restriction', async () => {
    const hits = await svc.search(supervisor, MINE, 'ladder')
    // INC-SEARCH-2 is at site B, which this supervisor cannot see.
    expect(codes(hits)).toContain('INC-SEARCH-1')
    expect(codes(hits)).not.toContain('INC-SEARCH-2')
  })

  it('excludes archived incidents', async () => {
    const hits = await svc.search(manager, MINE, 'ladder')
    expect(codes(hits)).not.toContain('INC-SEARCH-3')
  })

  it('returns nothing for a query that is too short to be meaningful', async () => {
    expect(await svc.search(manager, MINE, 'l')).toEqual([])
    expect(await svc.search(manager, MINE, '  ')).toEqual([])
  })

  it('returns an empty list rather than failing when nothing matches', async () => {
    expect(await svc.search(manager, MINE, 'zzzznotarealthing')).toEqual([])
  })

  it('treats an injection string as a search term', async () => {
    const hits = await svc.search(manager, MINE, "'; DROP TABLE \"Incident\"; --")
    expect(hits).toEqual([])
    // The table is still there.
    expect(await db.incident.count({ where: { companyId: MINE } })).toBeGreaterThan(0)
  })

  it('gives every hit somewhere to go', async () => {
    const hits = await svc.search(manager, MINE, 'ladder')
    expect(hits.length).toBeGreaterThan(0)
    for (const h of hits) {
      expect(h.href).toMatch(/^\//)
      expect(h.code).toBeTruthy()
      expect(h.title).toBeTruthy()
    }
  })
})
