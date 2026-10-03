import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { HsePerformanceService, computeIndicators, parseMonth } from './hsePerformance.js'
import type { Caller } from '../domain/caller.js'

/**
 * HSE performance, against a REAL PostgreSQL database.
 *
 * These are the figures an HSE manager signs off to DOSH and the board, so every expected
 * value below is worked by hand from the fixture - not read back from the code - and the
 * tests concentrate on the ways a rate lies: another tenant's injury in the numerator, a
 * draft or archived report counted, an estimated denominator passed off as recorded, a site
 * the caller cannot see leaking into the total.
 *
 * Requires a database. Skipped when DATABASE_URL is absent so CI without one stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const svc = new HsePerformanceService(db)

const CO = 'perf-itest-co'
const OTHER = 'perf-itest-other'
const SITE_A = 'perf-itest-site-a' // 100 workers, hours recorded
const SITE_B = 'perf-itest-site-b' // 50 workers, hours estimated
const OTHER_SITE = 'perf-itest-other-site'

const caller = (role: string, id: string, companyId = CO, siteIds: string[] = []): Caller => ({
  userId: `perf-${id}`, name: `Perf ${id}`, roles: [{ companyId, role: role as never, siteIds }],
})
const hse = caller('hse_manager', 'hse')
const officer = caller('safety_officer', 'officer')
const employee = caller('employee', 'employee')
const outsider = caller('admin', 'outsider', OTHER)
const siteAOnly = caller('hse_manager', 'site-a', CO, [SITE_A])

// January to June 2026, viewed from mid-July: every month complete.
const NOW = new Date('2026-07-15T00:00:00Z')
const PERIOD = { companyId: CO, months: 6, endMonth: '2026-06', now: NOW }
const at = (iso: string) => new Date(`${iso}T08:00:00Z`)

let seq = 0
async function incident(over: Record<string, unknown>) {
  seq += 1
  return db.incident.create({
    data: {
      number: `PERF-${Date.now().toString(36)}-${seq}`, companyId: CO, siteId: SITE_A,
      title: `Perf incident ${seq}`, type: 'injury', severity: 'Minor', severityRank: 1,
      location: 'Yard', occurredAt: at('2026-03-10'), reporter: 'Tester', stage: 'investigation',
      ...over,
    } as never,
  })
}

async function purge() {
  const scope = { companyId: { in: [CO, OTHER] } }
  await db.siteManHours.deleteMany({ where: scope })
  await db.correctiveAction.deleteMany({ where: scope })
  await db.incident.deleteMany({ where: scope })
}

d('HSE performance — integration (real Postgres)', () => {
  beforeAll(async () => {
    for (const [id, name] of [[CO, 'Perf ITest Co'], [OTHER, 'Perf ITest Other']]) {
      await db.company.upsert({ where: { id }, update: {}, create: { id, name } })
    }
    for (const [id, companyId, name, headcount] of [
      [SITE_A, CO, 'Perf Site A', 100], [SITE_B, CO, 'Perf Site B', 50], [OTHER_SITE, OTHER, 'Other Site', 500],
    ] as const) {
      await db.site.upsert({ where: { id }, update: { headcount }, create: { id, companyId, name, headcount } })
    }
    await purge()

    // Site A: 20,000 hours recorded in each of the six months = 120,000.
    for (const mo of ['01', '02', '03', '04', '05', '06']) {
      await db.siteManHours.create({ data: { companyId: CO, siteId: SITE_A, month: new Date(`2026-${mo}-01T00:00:00Z`), hours: 20_000, updatedBy: 'seed' } })
    }
    // Site A: one lost-time injury (10 days lost), one medical treatment case, one first aid,
    // four near misses.
    const lti = await incident({ severity: 'lost_time_injury', occurredAt: at('2026-03-10') })
    await db.incidentPerson.create({ data: { incidentId: lti.id, role: 'injured', name: 'Worker One', daysLost: 10, addedBy: 'seed' } as never })
    await db.incidentPerson.create({ data: { incidentId: lti.id, role: 'witness', name: 'Witness', daysLost: 99, addedBy: 'seed' } as never })
    await incident({ severity: 'medical_treatment', occurredAt: at('2026-04-02') })
    await incident({ severity: 'Minor', occurredAt: at('2026-04-20') })
    for (const day of ['2026-01-05', '2026-02-11', '2026-03-03', '2026-06-18']) {
      await incident({ type: 'near_miss', severity: 'near_miss', occurredAt: at(day) })
    }
    // Site B: one fatality, no hours recorded (estimated 50 × 195 × 6 = 58,500).
    await incident({ siteId: SITE_B, severity: 'fatality', occurredAt: at('2026-05-07') })

    // Must not count: a draft, an archived report, one outside the period, another tenant's.
    await incident({ severity: 'lost_time_injury', stage: 'draft' })
    await incident({ severity: 'lost_time_injury', archived: true })
    await incident({ severity: 'lost_time_injury', occurredAt: at('2025-12-20') })
    await incident({ companyId: OTHER, siteId: OTHER_SITE, severity: 'lost_time_injury' })

    // Corrective actions closed in the period at Site A: two on time, one late.
    const closedAction = (code: string, due: string, done: string) => db.correctiveAction.create({
      data: {
        code, companyId: CO, siteId: SITE_A, title: code, owner: 'Owner', dueDate: at(due),
        priority: 'High', status: 'completed', completedAt: at(done), createdBy: 'seed',
      } as never,
    })
    await closedAction('PERF-CA-1', '2026-02-10', '2026-02-09')
    await closedAction('PERF-CA-2', '2026-03-10', '2026-03-10') // on the due day itself
    await closedAction('PERF-CA-3', '2026-04-01', '2026-04-15')
  })

  afterAll(async () => {
    await purge()
    await db.site.deleteMany({ where: { id: { in: [SITE_A, SITE_B, OTHER_SITE] } } })
    await db.company.deleteMany({ where: { id: { in: [CO, OTHER] } } })
    await db.$disconnect()
  })

  it('refuses people outside the workspace and roles that do not report performance', async () => {
    await expect(svc.performance(outsider, PERIOD)).rejects.toMatchObject({ status: 403 })
    await expect(svc.performance(employee, PERIOD)).rejects.toMatchObject({ status: 403 })
  })

  it('counts lagging indicators from this tenant, this period, and real reports only', async () => {
    const r = await svc.performance(hse, PERIOD)
    expect(r.total.lostTime).toBe(2) // the LTI and the fatality
    expect(r.total.recordable).toBe(3) // LTI, medical treatment, fatality - not first aid
    expect(r.total.fatalities).toBe(1)
    expect(r.total.daysLost).toBe(10) // the injured person's, not the witness's
    expect(r.total.nearMisses).toBe(4)
  })

  it('calculates the DOSH and OSHA rates from hours worked', async () => {
    const { total } = await svc.performance(hse, PERIOD)
    expect(total.hours).toBe(178_500) // 120,000 recorded + 58,500 estimated
    expect(total.estimatedShare).toBeCloseTo(58_500 / 178_500, 3)
    expect(total.frequencyRate).toBeCloseTo(11.2, 1) // 2 × 1,000,000 / 178,500
    expect(total.severityRate).toBeCloseTo(56.02, 1) // 10 × 1,000,000 / 178,500
    expect(total.trir).toBeCloseTo(3.36, 1) // 3 × 200,000 / 178,500
    expect(total.incidenceRate).toBeCloseTo(13.33, 1) // 2 × 1,000 / 150 workers
  })

  it('reports leading indicators beside them', async () => {
    const { total } = await svc.performance(hse, PERIOD)
    expect(total.nearMissRatio).toBeCloseTo(1.3, 1) // 4 near misses : 3 recordables
    expect(total.actionsClosed).toBe(3)
    expect(total.actionsClosedOnTime).toBe(2) // closing on the due day counts as on time
    expect(total.onTimeClosure).toBeCloseTo(0.667, 2)
  })

  it('ranks sites by lost-time frequency, worst first, and says whose hours are estimated', async () => {
    const { sites } = await svc.performance(hse, PERIOD)
    expect(sites.map((s) => s.siteId)).toEqual([SITE_B, SITE_A])
    const [b, a] = sites
    expect(b.frequencyRate).toBeCloseTo(17.09, 1) // 1 × 1,000,000 / 58,500
    expect(b.estimatedShare).toBe(1)
    expect(a.frequencyRate).toBeCloseTo(8.33, 1) // 1 × 1,000,000 / 120,000
    expect(a.estimatedShare).toBe(0)
  })

  it('draws a month-by-month trend for the whole period', async () => {
    const { months } = await svc.performance(hse, PERIOD)
    expect(months.map((m) => m.month)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'])
    expect(months.find((m) => m.month === '2026-03')).toMatchObject({ lostTime: 1, recordable: 1, nearMisses: 1, hours: 20_000 + 9_750 })
    expect(months.find((m) => m.month === '2026-05')).toMatchObject({ lostTime: 1, recordable: 1 })
  })

  it('shows a site-restricted manager their own sites only, totals included', async () => {
    const r = await svc.performance(siteAOnly, PERIOD)
    expect(r.sites.map((s) => s.siteId)).toEqual([SITE_A])
    expect(r.total.fatalities).toBe(0)
    expect(r.total.hours).toBe(120_000)
  })

  it('lets an HSE manager record and clear man-hours, and nobody else', async () => {
    await svc.setManHours(hse, { companyId: CO, siteId: SITE_B, month: '2026-05', hours: 12_345, now: NOW })
    const withRecorded = await svc.performance(hse, PERIOD)
    expect(withRecorded.sites.find((s) => s.siteId === SITE_B)!.hours).toBe(9_750 * 5 + 12_345)
    await svc.setManHours(hse, { companyId: CO, siteId: SITE_B, month: '2026-05', hours: null, now: NOW })
    expect((await svc.performance(hse, PERIOD)).sites.find((s) => s.siteId === SITE_B)!.hours).toBe(58_500)

    await expect(svc.setManHours(officer, { companyId: CO, siteId: SITE_B, month: '2026-05', hours: 1, now: NOW })).rejects.toMatchObject({ status: 403 })
    await expect(svc.setManHours(hse, { companyId: CO, siteId: OTHER_SITE, month: '2026-05', hours: 1, now: NOW })).rejects.toMatchObject({ status: 404 })
    await expect(svc.setManHours(siteAOnly, { companyId: CO, siteId: SITE_B, month: '2026-05', hours: 1, now: NOW })).rejects.toMatchObject({ status: 404 })
    await expect(svc.setManHours(hse, { companyId: CO, siteId: SITE_A, month: '2026-08', hours: 1, now: NOW })).rejects.toMatchObject({ code: 'validation' })
    await expect(svc.setManHours(hse, { companyId: CO, siteId: SITE_A, month: '2026-05', hours: -5, now: NOW })).rejects.toMatchObject({ code: 'validation' })
  })

  it('lists recorded hours with the estimate each month would otherwise use', async () => {
    const r = await svc.manHours(hse, { companyId: CO, year: 2026 })
    const a = r.sites.find((s) => s.siteId === SITE_A)!
    expect(a.months).toHaveLength(6)
    expect(a.estimatePerMonth).toBe(19_500)
    expect(r.sites.find((s) => s.siteId === SITE_B)!.months).toHaveLength(0)
  })
})

describe('HSE performance — arithmetic', () => {
  it('leaves a rate empty rather than dividing by zero', () => {
    const r = computeIndicators({
      lostTime: 1, recordable: 0, fatalities: 0, injuries: 1, daysLost: 0, hours: 0, estimatedHours: 0,
      workers: 0, nearMisses: 3, actionsClosed: 0, actionsClosedOnTime: 0, overdueActions: 0, toolboxMeetings: 0,
    })
    expect(r.frequencyRate).toBeNull()
    expect(r.incidenceRate).toBeNull()
    expect(r.nearMissRatio).toBeNull()
    expect(r.onTimeClosure).toBeNull()
  })

  it('accepts only real calendar months', () => {
    expect(parseMonth('2026-03').toISOString()).toBe('2026-03-01T00:00:00.000Z')
    expect(() => parseMonth('2026-13')).toThrow()
    expect(() => parseMonth('26-03')).toThrow()
  })
})
