import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { OrgError, OrgService } from './orgService.js'
import type { Caller } from './incidentService.js'

/**
 * Integration tests — these run against a REAL PostgreSQL database, not a fake.
 *
 * The organisation tree is what every other module is scoped by, so the property that
 * matters is that it never returns a workspace, site, department or team the caller
 * cannot reach — including through an id they guessed. That is a SQL join question, so
 * it is answered against real rows.
 *
 * Requires a database: `npm run db:start && npm run prisma:migrate`.
 * Skipped automatically when DATABASE_URL is absent so CI without a DB stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const svc = new OrgService(db)

const COMPANY = 'org-itest-co'
const SITE_A = 'org-itest-site-a'
const SITE_B = 'org-itest-site-b'
const OTHER = 'org-itest-other-co'
const OTHER_SITE = 'org-itest-other-site'

const manager: Caller = {
  userId: 'org-mgr', name: 'ORG Manager',
  roles: [{ companyId: COMPANY, role: 'hse_manager', siteIds: [] }],
}
/** Scoped to one site — the case that separates a filter from a real restriction. */
const officer: Caller = {
  userId: 'org-so', name: 'ORG Officer',
  roles: [{ companyId: COMPANY, role: 'safety_officer', siteIds: [SITE_A] }],
}
const outsider: Caller = {
  userId: 'org-out', name: 'ORG Outsider',
  roles: [{ companyId: OTHER, role: 'admin', siteIds: [] }],
}
const nobody: Caller = { userId: 'org-nobody', name: 'ORG Nobody', roles: [] }
const both: Caller = {
  userId: 'org-both', name: 'ORG Both',
  roles: [
    { companyId: COMPANY, role: 'admin', siteIds: [] },
    { companyId: OTHER, role: 'admin', siteIds: [] },
  ],
}

d('OrgService — integration (real Postgres)', () => {
  beforeAll(async () => {
    await db.company.upsert({
      where: { id: COMPANY }, update: {},
      create: { id: COMPANY, name: 'ORG ITest Co', industry: 'Testing', logoInitials: 'OI' },
    })
    await db.company.upsert({
      where: { id: OTHER }, update: {},
      create: { id: OTHER, name: 'ORG Other Co', industry: 'Other', logoInitials: 'OO' },
    })
    for (const [id, companyId, name] of [
      [SITE_A, COMPANY, 'Alpha Yard'],
      [SITE_B, COMPANY, 'Bravo Plant'],
      [OTHER_SITE, OTHER, 'Foreign Works'],
    ]) {
      await db.site.upsert({
        where: { id }, update: {},
        create: { id, companyId, name, short: name.split(' ')[0], city: 'Kuching', headcount: 100 },
      })
    }
    for (const [id, siteId, name] of [
      ['org-dep-a1', SITE_A, 'Production'],
      ['org-dep-a2', SITE_A, 'Maintenance'],
      ['org-dep-b1', SITE_B, 'Logistics'],
      ['org-dep-x1', OTHER_SITE, 'Foreign Dept'],
    ]) {
      await db.department.upsert({ where: { id }, update: {}, create: { id, siteId, name } })
    }
    for (const [id, departmentId, name, lead] of [
      ['org-team-a1', 'org-dep-a1', 'Line 1', 'Alice'],
      ['org-team-b1', 'org-dep-b1', 'Inbound', 'Bob'],
      ['org-team-x1', 'org-dep-x1', 'Foreign Crew', 'Mallory'],
    ]) {
      await db.team.upsert({ where: { id }, update: {}, create: { id, departmentId, name, lead } })
    }
  })

  afterAll(async () => {
    await db.company.deleteMany({ where: { id: { in: [COMPANY, OTHER] } } })
    await db.$disconnect()
  })

  // ── Companies ──────────────────────────────────────────────────────────────

  it('offers exactly the workspaces the session can open', async () => {
    const mine = await svc.listCompanies(manager)
    expect(mine.map((c) => c.id)).toEqual([COMPANY])

    // A membership in two tenants offers both.
    const two = await svc.listCompanies(both)
    expect(two.map((c) => c.id).sort()).toEqual([COMPANY, OTHER].sort())

    // No memberships, no workspaces — and no error to probe with.
    expect(await svc.listCompanies(nobody)).toEqual([])
  })

  it('carries the display fields the switcher renders', async () => {
    const [c] = await svc.listCompanies(manager)
    expect(c.name).toBe('ORG ITest Co')
    expect(c.industry).toBe('Testing')
    expect(c.logoInitials).toBe('OI')
    expect(c.plan).toBe('enterprise')
  })

  // ── Sites ──────────────────────────────────────────────────────────────────

  it('lists a workspace’s sites with their display fields', async () => {
    const sites = await svc.listSites(manager, COMPANY)
    expect(sites.map((s) => s.id).sort()).toEqual([SITE_A, SITE_B].sort())
    const alpha = sites.find((s) => s.id === SITE_A)!
    expect(alpha.short).toBe('Alpha')
    expect(alpha.city).toBe('Kuching')
    expect(alpha.headcount).toBe(100)
    expect(alpha.timezone).toBe('Asia/Kuching')
  })

  it('narrows the site list to a site-scoped role', async () => {
    const sites = await svc.listSites(officer, COMPANY)
    expect(sites.map((s) => s.id)).toEqual([SITE_A])
  })

  it('refuses sites for a workspace the caller is not in', async () => {
    await expect(svc.listSites(outsider, COMPANY)).rejects.toMatchObject({ status: 403 })
    await expect(svc.listSites(nobody, COMPANY)).rejects.toBeInstanceOf(OrgError)
  })

  // ── Departments & teams ────────────────────────────────────────────────────

  it('resolves departments only for sites inside the caller’s tenants', async () => {
    const mine = await svc.listDepartments(manager, [SITE_A, SITE_B])
    expect(mine.map((d) => d.id).sort()).toEqual(['org-dep-a1', 'org-dep-a2', 'org-dep-b1'])

    // A real site id belonging to another tenant returns nothing rather than its rows.
    const foreign = await svc.listDepartments(manager, [OTHER_SITE])
    expect(foreign).toEqual([])

    // Mixing a legitimate id with a foreign one does not smuggle the foreign one through.
    const mixed = await svc.listDepartments(manager, [SITE_A, OTHER_SITE])
    expect(mixed.every((d) => d.siteId === SITE_A)).toBe(true)

    expect(await svc.listDepartments(manager, [])).toEqual([])
  })

  it('resolves teams only for departments inside the caller’s tenants', async () => {
    const mine = await svc.listTeams(manager, ['org-team-a1'].map(() => 'org-dep-a1'))
    expect(mine.map((t) => t.id)).toEqual(['org-team-a1'])
    expect(mine[0].lead).toBe('Alice')

    // The join reaches department -> site -> company, so a foreign department is empty.
    expect(await svc.listTeams(manager, ['org-dep-x1'])).toEqual([])
    expect(await svc.listTeams(manager, ['org-dep-a1', 'org-dep-x1'])
      .then((r) => r.every((t) => t.id !== 'org-team-x1'))).toBe(true)
    expect(await svc.listTeams(nobody, ['org-dep-a1'])).toEqual([])
  })

  // ── Tree ───────────────────────────────────────────────────────────────────

  it('returns the whole tree for one workspace', async () => {
    const tree = await svc.tree(manager, COMPANY)
    expect(tree.company.id).toBe(COMPANY)
    expect(tree.sites).toHaveLength(2)

    const alpha = tree.sites.find((s) => s.id === SITE_A)!
    expect(alpha.departments.map((d) => d.name).sort()).toEqual(['Maintenance', 'Production'])
    expect(alpha.departments.find((d) => d.id === 'org-dep-a1')!.teams).toHaveLength(1)

    // Nothing from the other tenant appears anywhere in it.
    const json = JSON.stringify(tree)
    expect(json).not.toContain('Foreign')
    expect(json).not.toContain('Mallory')
  })

  it('refuses a tree for another tenant, and reports an unknown workspace as not found', async () => {
    await expect(svc.tree(outsider, COMPANY)).rejects.toMatchObject({ status: 403 })
    await expect(svc.tree(manager, 'no-such-company')).rejects.toMatchObject({ status: 403 })
    // A member of a workspace whose row has been removed gets a clean 404.
    const ghost: Caller = {
      userId: 'g', name: 'Ghost',
      roles: [{ companyId: 'org-deleted-co', role: 'admin', siteIds: [] }],
    }
    await expect(svc.tree(ghost, 'org-deleted-co')).rejects.toMatchObject({ status: 404 })
  })

  // ── Cascades ───────────────────────────────────────────────────────────────

  it('cascades departments and teams with their site', async () => {
    await db.site.create({
      data: { id: 'org-tmp-site', companyId: COMPANY, name: 'Temp', short: 'T', city: 'X' },
    })
    await db.department.create({
      data: { id: 'org-tmp-dep', siteId: 'org-tmp-site', name: 'Temp Dept' },
    })
    await db.team.create({
      data: { id: 'org-tmp-team', departmentId: 'org-tmp-dep', name: 'Temp Team', lead: 'T' },
    })

    await db.site.delete({ where: { id: 'org-tmp-site' } })

    expect(await db.department.count({ where: { id: 'org-tmp-dep' } })).toBe(0)
    expect(await db.team.count({ where: { id: 'org-tmp-team' } })).toBe(0)
  })

  it('refuses a department pointing at a site that does not exist', async () => {
    await expect(db.department.create({
      data: { id: 'org-ghost-dep', siteId: 'no-such-site', name: 'Ghost' },
    })).rejects.toThrow()
  })
})
