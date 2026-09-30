import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { DashboardService } from './dashboardService.js'
import type { Caller } from '../domain/caller.js'

/**
 * The dashboard, against a REAL PostgreSQL database.
 *
 * This page is the one an HSE manager opens first, so the tests concentrate on the ways a
 * summary lies: another tenant's rows counted into your total, a closed action still shown
 * as overdue, a near miss sorted above a fatality because the enum was declared that way,
 * a filter that silently reaches nothing.
 *
 * Requires a database. Skipped when DATABASE_URL is absent so CI without one stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const svc = new DashboardService(db)

const CO = 'dash-itest-co'
const OTHER = 'dash-itest-other'
const SITE_A = 'dash-itest-site-a'
const SITE_B = 'dash-itest-site-b'
const OTHER_SITE = 'dash-itest-other-site'
const DEPT = 'dash-itest-dept'

const caller = (role: string, id: string, companyId = CO): Caller => ({
  userId: `dash-${id}`, name: `Dash ${id}`,
  roles: [{ companyId, role: role as never, siteIds: [] }],
})

const admin = caller('admin', 'admin')
const employee = caller('employee', 'employee')
const outsider = caller('admin', 'outsider', OTHER)

const days = (n: number) => new Date(Date.now() + n * 86_400_000)
const ymd = (dte: Date) => dte.toISOString().slice(0, 10)

let seq = 0
const uniq = () => { seq += 1; return `${Date.now().toString(36)}-${seq}` }

async function incident(over: Record<string, unknown> = {}) {
  const n = uniq()
  return db.incident.create({
    data: {
      number: `DASH-${n}`, companyId: CO, siteId: SITE_A,
      title: `Dash incident ${n}`, type: 'injury', severity: 'Minor', severityRank: 1,
      location: 'Yard', occurredAt: days(-2), reporter: 'Tester', stage: 'investigation',
      ...over,
    } as never,
  })
}

async function action(over: Record<string, unknown> = {}) {
  const n = uniq()
  return db.correctiveAction.create({
    data: {
      code: `DASHCA-${n}`, companyId: CO, siteId: SITE_A,
      title: `Dash action ${n}`, owner: 'Owner One', dueDate: days(-3),
      priority: 'High', status: 'open', createdBy: 'tester', ...over,
    } as never,
  })
}

async function permit(over: Record<string, unknown> = {}) {
  const n = uniq()
  return db.permit.create({
    data: {
      code: `DASHPTW-${n}`, companyId: CO, siteId: SITE_A, type: 'hot_work',
      title: `Dash permit ${n}`, location: 'Workshop', applicant: 'Applicant',
      validFrom: days(-1), validTo: days(2), status: 'active', createdBy: 'tester',
      ...over,
    } as never,
  })
}

async function purge() {
  const scope = { companyId: { in: [CO, OTHER] } }
  await db.correctiveAction.deleteMany({ where: scope })
  await db.permit.deleteMany({ where: scope })
  await db.visitor.deleteMany({ where: scope })
  await db.calibration.deleteMany({ where: { asset: { companyId: { in: [CO, OTHER] } } } })
  await db.asset.deleteMany({ where: scope })
  await db.reportRun.deleteMany({ where: scope })
  await db.reportSchedule.deleteMany({ where: scope })
  await db.incident.deleteMany({ where: scope })
}

d('Operational dashboard — integration (real Postgres)', () => {
  beforeAll(async () => {
    for (const [id, name] of [[CO, 'Dash ITest Co'], [OTHER, 'Dash ITest Other']]) {
      await db.company.upsert({ where: { id }, update: {}, create: { id, name } })
    }
    for (const [id, companyId, name] of [
      [SITE_A, CO, 'Dash Site A'], [SITE_B, CO, 'Dash Site B'],
      [OTHER_SITE, OTHER, 'Other Site'],
    ]) {
      await db.site.upsert({ where: { id }, update: {}, create: { id, companyId, name } })
    }
    await db.department.upsert({
      where: { id: DEPT }, update: {},
      // Departments hang off a site, not a company.
      create: { id: DEPT, siteId: SITE_A, name: 'Maintenance' },
    })
    await purge()
  })

  afterAll(async () => {
    await purge()
    await db.company.deleteMany({ where: { id: { in: [CO, OTHER] } } })
    await db.$disconnect()
  })

  // ── Authorization and tenant isolation ────────────────────────────────────

  it('refuses a workspace the caller is not a member of', async () => {
    await expect(svc.overview(outsider, { companyId: CO })).rejects.toMatchObject({ status: 403 })
    await expect(svc.overview(admin, { companyId: OTHER })).rejects.toMatchObject({ status: 403 })
  })

  it('never counts another tenant into your totals', async () => {
    await purge()
    // Two overdue actions here, five next door.
    await action()
    await action()
    for (let i = 0; i < 5; i += 1) {
      await db.correctiveAction.create({
        data: {
          code: `OTHERCA-${uniq()}`, companyId: OTHER, siteId: OTHER_SITE,
          title: 'Other tenant action', owner: 'Someone Else', dueDate: days(-9),
          priority: 'High', status: 'open', createdBy: 'tester',
        } as never,
      })
    }

    const mine = await svc.overview(admin, { companyId: CO })
    expect(mine.kpis.overdueActions).toBe(2)
    expect(mine.actions.byOwner.every((o) => o.owner !== 'Someone Else')).toBe(true)
    expect(mine.attention.every((a) => !a.title.includes('Other tenant'))).toBe(true)
  })

  it('rejects a site id belonging to another tenant instead of widening the view', async () => {
    /*
     * The subtle leak: an unknown site silently dropped from the where clause turns a
     * one-site request into a whole-company total.
     */
    await expect(svc.overview(admin, { companyId: CO, siteId: OTHER_SITE }))
      .rejects.toMatchObject({ status: 404 })
  })

  it('lets an ordinary member see their own workspace', async () => {
    // The dashboard is the landing page; refusing an employee leaves them with nothing.
    const r = await svc.overview(employee, { companyId: CO })
    expect(r.scope.companyName).toBe('Dash ITest Co')
  })

  // ── KPI correctness ───────────────────────────────────────────────────────

  it('counts overdue actions the way the actions register does', async () => {
    await purge()
    await action({ dueDate: days(-5) })                       // overdue
    await action({ dueDate: days(-1), status: 'in_progress' }) // overdue
    await action({ dueDate: days(-2), status: 'completed' })   // done, not overdue
    await action({ dueDate: days(5) })                         // future

    const r = await svc.overview(admin, { companyId: CO })
    expect(r.kpis.overdueActions).toBe(2)
    expect(r.actions.overdue).toBe(2)
  })

  it('separates due today from due this week', async () => {
    await purge()
    const todayNoon = new Date()
    todayNoon.setUTCHours(12, 0, 0, 0)
    await action({ dueDate: todayNoon })
    await action({ dueDate: days(3) })
    await action({ dueDate: days(4) })
    await action({ dueDate: days(20) })

    const r = await svc.overview(admin, { companyId: CO })
    expect(r.actions.dueToday).toBe(1)
    expect(r.actions.dueThisWeek).toBe(2)
    // Today is not double-counted into the week.
    expect(r.actions.overdue).toBe(0)
  })

  it('counts open investigations, not every incident ever raised', async () => {
    await purge()
    await incident({ stage: 'investigation' })
    await incident({ stage: 'rca' })
    await incident({ stage: 'review' })
    await incident({ stage: 'closed' })

    const r = await svc.overview(admin, { companyId: CO })
    expect(r.kpis.openInvestigations).toBe(2)
    expect(r.incidents.awaitingReview).toBe(1)
    expect(r.incidents.open).toBe(3)
  })

  it('counts permits by their real workflow stage', async () => {
    await purge()
    await permit({ status: 'active' })
    await permit({ status: 'active' })
    await permit({ status: 'hse_review' })
    await permit({ status: 'supervisor_review' })
    await permit({ status: 'submitted' })
    await permit({ status: 'closed' })

    const r = await svc.overview(admin, { companyId: CO })
    expect(r.kpis.activePermits).toBe(2)
    // The whole chain before approval, not just one stage.
    expect(r.kpis.permitsAwaitingReview).toBe(3)
    expect(r.permits.byStage.find((s) => s.stage === 'closed')?.count).toBe(1)
  })

  it('does not count archived permits as live work', async () => {
    await purge()
    await permit({ status: 'active' })
    await permit({ status: 'archived' })

    const r = await svc.overview(admin, { companyId: CO })
    const total = r.permits.byStage.reduce((n, s) => n + s.count, 0)
    expect(total).toBe(1)
  })

  // ── Severity ranking ──────────────────────────────────────────────────────

  it('ranks a fatality above a near miss regardless of enum order', async () => {
    /*
     * The enum is append-only, so its declaration order is storage order, not meaning.
     * Sorting by it puts values added later above older, more serious ones.
     */
    await purge()
    await incident({ severity: 'near_miss', severityRank: 0, stage: 'investigation' })
    await incident({ severity: 'fatality', severityRank: 7, stage: 'investigation' })
    await incident({ severity: 'Minor', severityRank: 1, stage: 'investigation' })

    const r = await svc.overview(admin, { companyId: CO })
    expect(r.incidents.bySeverity[0].severity).toBe('fatality')
    expect(r.incidents.bySeverity.map((s) => s.rank)).toEqual([7, 1, 0])
  })

  it('puts a critical incident at the top of the attention queue', async () => {
    await purge()
    // An old routine item that would win on age alone.
    await action({ dueDate: days(-60), title: 'Very old routine action' })
    await incident({ severity: 'fatality', severityRank: 7, stage: 'investigation', title: 'Fall from height' })

    const r = await svc.overview(admin, { companyId: CO })
    expect(r.attention[0].kind).toBe('incident')
    expect(r.attention[0].priority).toBe('critical')
    expect(r.attention[0].title).toBe('Fall from height')
  })

  it('does not treat a minor incident as critical', async () => {
    await purge()
    await incident({ severity: 'Minor', severityRank: 1, stage: 'investigation' })
    const r = await svc.overview(admin, { companyId: CO })
    expect(r.attention.some((a) => a.priority === 'critical')).toBe(false)
  })

  // ── Equipment ─────────────────────────────────────────────────────────────

  async function asset(over: Record<string, unknown> = {}) {
    const n = uniq()
    return db.asset.create({
      data: {
        code: `DASHAST-${n}`, qrKey: `qr-${n}`, companyId: CO, siteId: SITE_A,
        name: `Detector ${n}`, serialNumber: `SN-${n}`, owner: 'Workshop',
        category: 'gas_detector', status: 'in_service', frequency: 'monthly',
        nextDueDate: days(30), createdBy: 'tester', ...over,
      } as never,
    })
  }

  it('counts out-of-service equipment including items under maintenance', async () => {
    await purge()
    await asset({ status: 'in_service' })
    await asset({ status: 'out_of_service' })
    await asset({ status: 'under_maintenance' })

    const r = await svc.overview(admin, { companyId: CO })
    expect(r.equipment.inService).toBe(1)
    expect(r.kpis.equipmentOutOfService).toBe(2)
  })

  it('reads calibration expiry through the same verdict the permit gate uses', async () => {
    await purge()
    const expired = await asset()
    await db.calibration.create({
      data: {
        assetId: expired.id, certificateNumber: 'CAL-OLD', result: 'pass',
        calibratedAt: days(-400), expiresAt: days(-10), recordedBy: 'Lab',
      } as never,
    })
    const valid = await asset()
    await db.calibration.create({
      data: {
        assetId: valid.id, certificateNumber: 'CAL-NEW', result: 'pass',
        calibratedAt: days(-10), expiresAt: days(300), recordedBy: 'Lab',
      } as never,
    })

    const r = await svc.overview(admin, { companyId: CO })
    expect(r.equipment.calibrationOverdue).toBe(1)
    expect(r.attention.some((a) => a.kind === 'equipment' && a.status === 'calibration expired'))
      .toBe(true)
  })

  it('flags an inspection that has already lapsed', async () => {
    await purge()
    await asset({ nextDueDate: days(-4), category: 'ladder' })
    const r = await svc.overview(admin, { companyId: CO })
    expect(r.equipment.inspectionOverdue).toBe(1)
  })

  // ── Visitors ──────────────────────────────────────────────────────────────

  async function visitor(over: Record<string, unknown> = {}) {
    const n = uniq()
    return db.visitor.create({
      data: {
        code: `DASHVIS-${n}`, companyId: CO, siteId: SITE_A, name: `Visitor ${n}`,
        idNumber: `ID${n}`, passKey: `key-${n}`, hostNameAtBooking: 'Host Person',
        createdBy: 'tester',
        expectedArrival: days(-1), expectedDeparture: days(1), status: 'on_site',
        ...over,
      } as never,
    })
  }

  it('counts only people actually inside', async () => {
    await purge()
    await visitor({ status: 'on_site' })
    await visitor({ status: 'checked_in' })
    await visitor({ status: 'checked_out' })
    await visitor({ status: 'pre_registered' })

    const r = await svc.overview(admin, { companyId: CO })
    expect(r.kpis.visitorsOnSite).toBe(2)
  })

  it('raises a visitor who is inside past their expected departure', async () => {
    await purge()
    await visitor({ status: 'on_site', expectedDeparture: days(-1) })
    await visitor({ status: 'on_site', expectedDeparture: days(1) })

    const r = await svc.overview(admin, { companyId: CO })
    expect(r.visitors.overdueCheckout).toBe(1)
    const item = r.attention.find((a) => a.kind === 'visitor')
    expect(item?.priority).toBe('overdue')
    expect(item?.owner).toBe('Host Person')
  })

  it('counts visitors expected today separately from those on site', async () => {
    await purge()
    const laterToday = new Date()
    laterToday.setUTCHours(23, 0, 0, 0)
    await visitor({ status: 'pre_registered', expectedArrival: laterToday })
    await visitor({ status: 'on_site' })

    const r = await svc.overview(admin, { companyId: CO })
    expect(r.visitors.expectedToday).toBe(1)
    expect(r.visitors.onSite).toBe(1)
  })

  // ── Report delivery ───────────────────────────────────────────────────────

  it('surfaces a failed report delivery as something to act on', async () => {
    await purge()
    await db.reportRun.create({
      data: {
        companyId: CO, reportType: 'overdue_actions', trigger: 'scheduled',
        triggeredBy: 'system', status: 'success', deliveryStatus: 'failed',
        failureReason: 'auth_failed: API key is invalid', recipientCount: 3,
      } as never,
    })

    const r = await svc.overview(admin, { companyId: CO })
    expect(r.reports.failed).toBe(1)
    const item = r.attention.find((a) => a.kind === 'report')
    expect(item).toBeTruthy()
    expect(item!.detail).toMatch(/API key is invalid/)
    expect(item!.href).toBe('/reports')
  })

  it('shows the next scheduled report when one is armed', async () => {
    await purge()
    await db.reportSchedule.create({
      data: {
        companyId: CO, name: 'Monday HSE report', reportType: 'overdue_actions',
        frequency: 'weekly', dayOfWeek: 1, timeOfDay: '08:00', timezone: 'Asia/Kuching',
        recipientUserIds: [], enabled: true, nextRunAt: days(3), createdBy: 'tester',
      } as never,
    })

    const r = await svc.overview(admin, { companyId: CO })
    expect(r.reports.nextScheduled?.name).toBe('Monday HSE report')
  })

  it('does not read another tenant report history into this dashboard', async () => {
    await purge()
    await db.reportRun.create({
      data: {
        companyId: OTHER, reportType: 'overdue_actions', trigger: 'manual',
        triggeredBy: 'someone', status: 'success', deliveryStatus: 'failed',
        failureReason: 'other tenant failure', recipientCount: 1,
      } as never,
    })

    const r = await svc.overview(admin, { companyId: CO })
    expect(r.reports.recent).toHaveLength(0)
    expect(r.reports.failed).toBe(0)
  })

  // ── Filters ───────────────────────────────────────────────────────────────

  it('restricts every section to the requested site', async () => {
    await purge()
    await incident({ siteId: SITE_A, stage: 'investigation' })
    await incident({ siteId: SITE_B, stage: 'investigation' })
    await action({ siteId: SITE_A, dueDate: days(-4) })
    await action({ siteId: SITE_B, dueDate: days(-4) })
    await permit({ siteId: SITE_B, status: 'active' })

    const a = await svc.overview(admin, { companyId: CO, siteId: SITE_A })
    expect(a.kpis.openInvestigations).toBe(1)
    expect(a.kpis.overdueActions).toBe(1)
    expect(a.kpis.activePermits).toBe(0)
    expect(a.scope.siteName).toBe('Dash Site A')

    const all = await svc.overview(admin, { companyId: CO })
    expect(all.kpis.openInvestigations).toBe(2)
    expect(all.kpis.activePermits).toBe(1)
  })

  it('applies the date range to what happened in it', async () => {
    await purge()
    await incident({ occurredAt: days(-2) })
    await incident({ occurredAt: days(-200) })

    const recent = await svc.overview(admin, { companyId: CO })
    expect(recent.kpis.incidentsInRange).toBe(1)

    const wide = await svc.overview(admin, {
      companyId: CO, from: ymd(days(-365)), to: ymd(new Date()),
    })
    expect(wide.kpis.incidentsInRange).toBe(2)
  })

  it('refuses a range that runs backwards', async () => {
    await expect(svc.overview(admin, {
      companyId: CO, from: ymd(days(10)), to: ymd(days(-10)),
    })).rejects.toMatchObject({ status: 400 })
  })

  it('filters by department across the sections that record one', async () => {
    await purge()
    await incident({ department: 'Maintenance', stage: 'investigation' })
    await incident({ department: 'Logistics', stage: 'investigation' })
    await permit({ department: 'Maintenance', status: 'active' })
    await permit({ department: 'Logistics', status: 'active' })

    const r = await svc.overview(admin, { companyId: CO, department: 'Maintenance' })
    expect(r.kpis.openInvestigations).toBe(1)
    expect(r.kpis.activePermits).toBe(1)
    expect(r.scope.department).toBe('Maintenance')
  })

  it('says out loud that a department filter reached actions through their incident', async () => {
    /*
     * Actions have no department column. Rather than ignore the filter, they are matched
     * through the incident that raised them - and the response admits it, so the UI can
     * tell the operator instead of showing a number they cannot reconcile.
     */
    await purge()
    const i = await incident({ department: 'Maintenance', stage: 'investigation' })
    await action({ incidentId: i.id, dueDate: days(-3) })
    await action({ dueDate: days(-3) }) // standalone, no department

    const filtered = await svc.overview(admin, { companyId: CO, department: 'Maintenance' })
    expect(filtered.kpis.overdueActions).toBe(1)
    expect(filtered.scope.notes.actionsFilteredByIncidentDepartment).toBe(true)

    const unfiltered = await svc.overview(admin, { companyId: CO })
    expect(unfiltered.kpis.overdueActions).toBe(2)
    expect(unfiltered.scope.notes.actionsFilteredByIncidentDepartment).toBe(false)
  })

  it('matches visitors on the department register rather than a text column', async () => {
    // Visitors point at Department; the others keep a string. Same filter, two shapes.
    await purge()
    await visitor({ status: 'on_site', departmentId: DEPT })
    await visitor({ status: 'on_site' })

    const r = await svc.overview(admin, { companyId: CO, department: 'Maintenance' })
    expect(r.kpis.visitorsOnSite).toBe(1)
  })

  // ── Shape and empty states ────────────────────────────────────────────────

  it('returns real zeroes rather than inventing activity for an empty workspace', async () => {
    await purge()
    const r = await svc.overview(admin, { companyId: CO })

    expect(r.kpis).toEqual({
      activePermits: 0, permitsAwaitingReview: 0, overdueActions: 0,
      openInvestigations: 0, expiringEquipment: 0, equipmentOutOfService: 0,
      visitorsOnSite: 0, incidentsInRange: 0,
    })
    expect(r.attention).toEqual([])
    expect(r.incidents.recent).toEqual([])
    expect(r.reports.nextScheduled).toBeNull()
  })

  it('gives every attention item somewhere to go', async () => {
    await purge()
    await incident({ severity: 'fatality', severityRank: 7, stage: 'investigation' })
    await action({ dueDate: days(-3) })
    await permit({ status: 'hse_review' })
    await visitor({ status: 'on_site', expectedDeparture: days(-1) })

    const r = await svc.overview(admin, { companyId: CO })
    expect(r.attention.length).toBeGreaterThanOrEqual(4)
    for (const item of r.attention) {
      expect(item.href).toMatch(/^\//)
      expect(item.reference).toBeTruthy()
      expect(item.title).toBeTruthy()
    }
  })

  it('orders the queue by operational importance, not by date alone', async () => {
    await purge()
    await permit({ status: 'hse_review' })                    // review - lowest band
    await action({ dueDate: days(-30) })                      // overdue
    await incident({ severity: 'Critical', severityRank: 6, stage: 'investigation' }) // critical

    const r = await svc.overview(admin, { companyId: CO })
    const bands = r.attention.map((a) => a.priority)
    expect(bands[0]).toBe('critical')
    expect(bands.indexOf('overdue')).toBeLessThan(bands.indexOf('review'))
  })

  it('caps the queue but still reports how much is really waiting', async () => {
    await purge()
    for (let i = 0; i < 45; i += 1) await action({ dueDate: days(-(i + 1)) })

    const r = await svc.overview(admin, { companyId: CO })
    // A page that renders 500 rows is a page nobody scrolls; the total stays honest.
    expect(r.attention.length).toBeLessThanOrEqual(40)
    expect(r.kpis.overdueActions).toBe(45)
  })

  it('sorts the most overdue first inside a band', async () => {
    await purge()
    await action({ dueDate: days(-2), title: 'Two days late' })
    await action({ dueDate: days(-40), title: 'Forty days late' })

    const r = await svc.overview(admin, { companyId: CO })
    const overdue = r.attention.filter((a) => a.kind === 'action')
    expect(overdue[0].title).toBe('Forty days late')
    expect(overdue[0].overdueDays).toBeGreaterThan(overdue[1].overdueDays!)
  })

  // ── Agreement with the modules that own the data ──────────────────────────

  it('excludes archived incidents, as every other view does', async () => {
    /*
     * Archiving is reversible bookkeeping, not deletion. The register hides archived rows,
     * so a dashboard that counts them reports a backlog nobody can find - which is how the
     * headline and the page behind it end up disagreeing by hundreds.
     */
    await purge()
    await incident({ stage: 'investigation' })
    await incident({ stage: 'investigation', archived: true })

    const r = await svc.overview(admin, { companyId: CO })
    expect(r.incidents.open).toBe(1)
    expect(r.kpis.openInvestigations).toBe(1)
  })

  it('shows an employee only the incidents they reported', async () => {
    /*
     * The register restricts an employee to their own reports. A dashboard that ignores
     * that shows them the company's whole incident count on the landing page - the wider
     * number is the one that leaks.
     */
    await purge()
    await incident({ stage: 'investigation', reporterId: 'dash-employee' })
    await incident({ stage: 'investigation', reporterId: 'somebody-else' })

    const asEmployee = await svc.overview(employee, { companyId: CO })
    expect(asEmployee.kpis.openInvestigations).toBe(1)

    const asManager = await svc.overview(admin, { companyId: CO })
    expect(asManager.kpis.openInvestigations).toBe(2)
  })

  it('shows an employee only the actions they own', async () => {
    await purge()
    await action({ owner: 'Dash employee', dueDate: days(-4) })
    await action({ owner: 'Someone Else', dueDate: days(-4) })

    const asEmployee = await svc.overview(employee, { companyId: CO })
    expect(asEmployee.kpis.overdueActions).toBe(1)
    expect(asEmployee.attention.every((a) => a.owner !== 'Someone Else')).toBe(true)

    const asManager = await svc.overview(admin, { companyId: CO })
    expect(asManager.kpis.overdueActions).toBe(2)
  })

  it('counts a permit as active only while its window is open', async () => {
    /*
     * The permit board means "active now". A permit whose window closed but which nobody
     * signed off is not live work - reporting it as active tells an HSE manager that jobs
     * are running when none are.
     */
    await purge()
    await permit({ status: 'active', validFrom: days(-1), validTo: days(2) })
    await permit({ status: 'active', validFrom: days(-9), validTo: days(-2) })

    const r = await svc.overview(admin, { companyId: CO })
    expect(r.kpis.activePermits).toBe(1)
    expect(r.permits.active).toBe(1)
  })

  it('raises a permit that lapsed without being closed out', async () => {
    await purge()
    await permit({ status: 'active', validFrom: days(-9), validTo: days(-2) })

    const r = await svc.overview(admin, { companyId: CO })
    expect(r.permits.expiredOpen).toBe(1)
    // The stage strip agrees with the header: neither claims live work that has lapsed.
    expect(r.permits.byStage.find((x) => x.stage === 'active')?.count).toBe(0)
    const item = r.attention.find((a) => a.kind === 'permit' && a.priority === 'overdue')
    expect(item).toBeTruthy()
    expect(item!.status).toMatch(/past its window/)
    expect(item!.overdueDays).toBeGreaterThanOrEqual(1)
  })
})
