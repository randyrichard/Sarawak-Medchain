import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { SiteComparisonService } from './siteComparison.js'
import type { Caller } from './incidentService.js'

/**
 * Every site side by side, against a REAL PostgreSQL database.
 *
 * What an HSE manager relies on: each figure is that site's alone, the site needing
 * attention comes first, days without a lost-time injury count from that site's last case,
 * and nobody sees a site - or a count - the rest of the product would not show them.
 *
 * Requires a database. Skipped when DATABASE_URL is absent so CI without one stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const svc = new SiteComparisonService(db)

const COMPANY = 'cmp-itest-co'
const QUIET = 'cmp-itest-quiet'
const BUSY = 'cmp-itest-busy'
const CLOSED = 'cmp-itest-closed'

const as = (role: Caller['roles'][number]['role'], siteIds: string[] = []): Caller => ({
  userId: `cmp-${role}`, name: `ITest ${role}`, roles: [{ companyId: COMPANY, role, siteIds }],
})
const hse = as('hse_manager')
const ceo = as('ceo')
const officerQuiet = as('safety_officer', [QUIET])
const supervisor = as('supervisor')
const employee = as('employee')
const outsider: Caller = { userId: 'cmp-out', name: 'Out', roles: [{ companyId: 'elsewhere', role: 'admin', siteIds: [] }] }

const DAY = 86_400_000
const ago = (days: number) => new Date(Date.now() - days * DAY)

d('SiteComparisonService — integration (real Postgres)', () => {
  beforeAll(async () => {
    await db.company.upsert({ where: { id: COMPANY }, update: {}, create: { id: COMPANY, name: 'Compare ITest Co' } })
    for (const [id, name, active] of [[QUIET, 'Quiet Yard', true], [BUSY, 'Busy Jetty', true], [CLOSED, 'Old Depot', false]] as const) {
      await db.site.upsert({
        where: { id }, update: { active },
        create: { id, companyId: COMPANY, name, short: name.slice(0, 3), city: 'Bintulu', active },
      })
    }
    let n = 0
    const incident = (siteId: string, over: object) => db.incident.create({
      data: {
        number: `INC-C${++n}`, companyId: COMPANY, siteId, title: 'x', type: 'near_miss', severity: 'near_miss',
        location: 'x', reporter: 'x', occurredAt: ago(2), ...over,
      },
    })
    await incident(BUSY, { highRisk: true, type: 'injury', severity: 'medical_treatment' })
    await incident(BUSY, {})
    await incident(BUSY, { type: 'injury', severity: 'lost_time_injury', occurredAt: ago(12), stage: 'closed' })
    await incident(QUIET, { type: 'injury', severity: 'lost_time_injury', occurredAt: ago(400), stage: 'closed' })
    await incident(QUIET, { occurredAt: ago(90), stage: 'closed' }) // outside the default 30 days

    await db.correctiveAction.create({
      data: { code: 'CA-C1', companyId: COMPANY, siteId: BUSY, title: 'x', owner: 'Kumar', dueDate: ago(5), createdBy: 'x' },
    })
    await db.correctiveAction.create({
      data: { code: 'CA-C2', companyId: COMPANY, siteId: QUIET, title: 'x', owner: 'Kumar', dueDate: ago(-5), createdBy: 'x' },
    })
    await db.toolboxMeeting.create({
      data: { companyId: COMPANY, siteId: QUIET, number: 'TBM-C1', heldAt: new Date(Date.now() - 60_000),
        ledBy: 'A', topic: 'x', headcount: 40, recordedBy: 'x', recordedById: 'x' },
    })
  })

  afterAll(async () => {
    await db.toolboxMeeting.deleteMany({ where: { companyId: COMPANY } })
    await db.correctiveAction.deleteMany({ where: { companyId: COMPANY } })
    await db.incident.deleteMany({ where: { companyId: COMPANY } })
    await db.site.deleteMany({ where: { companyId: COMPANY } })
    await db.company.deleteMany({ where: { id: COMPANY } })
    await db.$disconnect()
  })

  it('gives each active site its own figures, the one needing attention first', async () => {
    const { rows } = await svc.compare(hse, { companyId: COMPANY })
    expect(rows.map((r) => r.siteName)).toEqual(['Busy Jetty', 'Quiet Yard'])

    const busy = rows[0]
    expect(busy).toMatchObject({
      openIncidents: 2, highRiskOpen: 1, incidentsInRange: 3, nearMissesInRange: 1, injuriesInRange: 2,
      daysSinceLostTime: 12, overdueActions: 1, openActions: 1, toolboxToday: false,
    })
    expect(busy.attention).toEqual(['1 high-risk incident open', '1 overdue action', 'lost-time injury 12 days ago'])

    const quiet = rows[1]
    expect(quiet).toMatchObject({
      openIncidents: 0, incidentsInRange: 0, daysSinceLostTime: 400, overdueActions: 0, openActions: 1,
      toolboxToday: true, toolboxHeadcount: 40,
    })
    expect(quiet.attention).toEqual([])
  })

  it('says a site has no lost-time case on record rather than inventing a number', async () => {
    await db.incident.deleteMany({ where: { companyId: COMPANY, siteId: QUIET, severity: 'lost_time_injury' } })
    const { rows } = await svc.compare(hse, { companyId: COMPANY })
    expect(rows.find((r) => r.siteId === QUIET)?.daysSinceLostTime).toBeNull()
  })

  it('widens the incident window when asked', async () => {
    const from = ago(120).toISOString().slice(0, 10)
    const { rows } = await svc.compare(hse, { companyId: COMPANY, from })
    expect(rows.find((r) => r.siteId === QUIET)?.incidentsInRange).toBe(1)
  })

  it('lets managers and the executive compare, and nobody else', async () => {
    await expect(svc.compare(ceo, { companyId: COMPANY })).resolves.toBeTruthy()
    for (const who of [supervisor, employee]) {
      await expect(svc.compare(who, { companyId: COMPANY })).rejects.toMatchObject({ status: 403 })
    }
    await expect(svc.compare(outsider, { companyId: COMPANY })).rejects.toMatchObject({ status: 403 })
  })

  it('shows a site-restricted officer only their own sites', async () => {
    const { rows } = await svc.compare(officerQuiet, { companyId: COMPANY })
    expect(rows.map((r) => r.siteId)).toEqual([QUIET])
  })

  it('refuses a project from another workspace rather than widening the view', async () => {
    await expect(svc.compare(hse, { companyId: COMPANY, projectId: 'not-a-project' })).rejects.toMatchObject({ status: 404 })
  })
})
