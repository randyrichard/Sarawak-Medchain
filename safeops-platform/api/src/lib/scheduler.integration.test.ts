import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { Scheduler } from './scheduler.js'
import { todayDate } from '../domain/businessDay.js'

/**
 * Integration tests — these run against a REAL PostgreSQL database, not a fake.
 *
 * The properties worth protecting:
 *
 *  1. The sweep actually raises something. This is the whole point: the product states a
 *     reminder policy on screen, and until now nothing enforced it.
 *  2. It is idempotent. The sweep runs every fifteen minutes. If a second pass re-raised
 *     what the first one did, a customer would have ninety-six copies of every reminder
 *     by the end of the day and would turn notifications off, which is worse than never
 *     having had them.
 *
 * Requires a database: `npm run db:start && npm run prisma:migrate`.
 * Skipped automatically when DATABASE_URL is absent so CI without a DB stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const scheduler = new Scheduler(db)

const COMPANY = 'sched-itest-co'
const SITE = 'sched-itest-site'

const DAY = 86400_000
// A date-only value n days from *today's local date* (APP_TIMEZONE) - the day the reminders
// count from. Built from the UTC date, these went wrong between 00:00 and 08:00 Malaysia time.
const inDays = (n: number) => new Date(todayDate().getTime() + n * DAY)

/** Every notification href raised for this workspace — the dedupe keys. */
const hrefs = async () =>
  (await db.notification.findMany({ where: { companyId: COMPANY }, select: { href: true } }))
    .map((n) => n.href)
    .filter((h): h is string => h !== null)

d('Scheduler — integration (real Postgres)', () => {
  beforeAll(async () => {
    await db.company.upsert({
      where: { id: COMPANY }, update: {}, create: { id: COMPANY, name: 'Scheduler ITest Co' },
    })
    await db.site.upsert({
      where: { id: SITE }, update: {},
      create: { id: SITE, companyId: COMPANY, name: 'ITest Site', short: 'ITest', city: 'Kuching' },
    })
  })

  afterAll(async () => {
    await db.company.deleteMany({ where: { id: COMPANY } })
    await db.$disconnect()
  })

  beforeEach(async () => {
    await db.notification.deleteMany({ where: { companyId: COMPANY } })
    await db.visitorEvent.deleteMany({ where: { visitor: { companyId: COMPANY } } })
    await db.visitor.deleteMany({ where: { companyId: COMPANY } })
    await db.correctiveAction.deleteMany({ where: { companyId: COMPANY } })
    await db.workOrder.deleteMany({ where: { asset: { companyId: COMPANY } } })
    await db.calibration.deleteMany({ where: { asset: { companyId: COMPANY } } })
    await db.assetEvent.deleteMany({ where: { asset: { companyId: COMPANY } } })
    await db.asset.deleteMany({ where: { companyId: COMPANY } })
    await db.certificate.deleteMany({ where: { companyId: COMPANY } })
    await db.employee.deleteMany({ where: { companyId: COMPANY } })
  })

  const makeAction = (code: string, dueInDays: number, status: 'open' | 'in_progress' | 'verified' = 'open') =>
    db.correctiveAction.create({
      data: {
        code, companyId: COMPANY, siteId: SITE, title: `Action ${code}`,
        owner: 'Owner One', dueDate: inDays(dueInDays), status, createdBy: 'itest',
      },
    })

  // ── Corrective actions ─────────────────────────────────────────────────────

  it('chases an action at seven, three and one days out — and not on other days', async () => {
    await makeAction('CA-D7', 7)
    await makeAction('CA-D3', 3)
    await makeAction('CA-D1', 1)
    await makeAction('CA-D5', 5) // between thresholds: silence is correct
    await makeAction('CA-D30', 30)

    await scheduler.sweepActions()

    const keys = await hrefs()
    expect(keys.filter((h) => h.includes('due=7'))).toHaveLength(1)
    expect(keys.filter((h) => h.includes('due=3'))).toHaveLength(1)
    expect(keys.filter((h) => h.includes('due=1'))).toHaveLength(1)
    // Five and thirty days out are not reminder days.
    expect(keys).toHaveLength(3)
  })

  it('announces the due date on the day', async () => {
    await makeAction('CA-TODAY', 0)
    await scheduler.sweepActions()
    const notes = await db.notification.findMany({ where: { companyId: COMPANY } })
    expect(notes).toHaveLength(1)
    expect(notes[0].title).toContain('due today')
  })

  it('escalates an overdue action once per threshold, not once per sweep', async () => {
    await makeAction('CA-LATE', -8)

    await scheduler.sweepActions()
    const first = await hrefs()
    // Overdue, plus the three-day and seven-day escalations.
    expect(first.some((h) => h.includes('overdue=1'))).toBe(true)
    expect(first.some((h) => h.includes('escalated=3'))).toBe(true)
    expect(first.some((h) => h.includes('escalated=7'))).toBe(true)
    expect(first).toHaveLength(3)

    // The sweep runs every fifteen minutes. A second pass must add nothing.
    await scheduler.sweepActions()
    await scheduler.sweepActions()
    expect(await hrefs()).toHaveLength(3)
  })

  it('escalates only as far as the action has actually slipped', async () => {
    await makeAction('CA-LATE4', -4)
    await scheduler.sweepActions()
    const keys = await hrefs()
    expect(keys.some((h) => h.includes('escalated=3'))).toBe(true)
    // Four days late has not reached the seven-day escalation.
    expect(keys.some((h) => h.includes('escalated=7'))).toBe(false)
  })

  it('leaves settled actions alone', async () => {
    await makeAction('CA-DONE', -20, 'verified')
    await scheduler.sweepActions()
    expect(await hrefs()).toHaveLength(0)
  })

  it('ignores ancient backlog rather than emptying it into the bell', async () => {
    // Measured against a year of imported history, an unbounded sweep raised 3,361
    // notifications in one pass. Something a year overdue is a backlog for the register,
    // not news for today.
    await makeAction('CA-ANCIENT', -300)
    await makeAction('CA-RECENT', -2)

    await scheduler.sweepActions()

    const notes = await db.notification.findMany({ where: { companyId: COMPANY } })
    expect(notes.every((n) => n.title.includes('CA-RECENT'))).toBe(true)
    expect(notes.some((n) => n.title.includes('CA-ANCIENT'))).toBe(false)
  })

  it('caps a first run per workspace, then continues on the next sweep', async () => {
    // 260 actions all newly overdue: more than the per-workspace ceiling of 200.
    await db.correctiveAction.createMany({
      data: Array.from({ length: 260 }, (_, i) => ({
        code: `CA-BULK-${i}`, companyId: COMPANY, siteId: SITE, title: `Bulk ${i}`,
        owner: 'Owner One', dueDate: inDays(-1), status: 'open' as const, createdBy: 'itest',
      })),
    })

    // Counted for this workspace only — the sweep spans every tenant, and other test
    // files run against the same database.
    await scheduler.sweepActions()
    const afterFirst = (await hrefs()).length
    expect(afterFirst).toBeGreaterThan(0)
    expect(afterFirst).toBeLessThanOrEqual(200)

    // The next sweep picks up where this one stopped rather than repeating it.
    await scheduler.sweepActions()
    const keys = await hrefs()
    expect(keys.length).toBeGreaterThan(afterFirst)
    expect(new Set(keys).size).toBe(keys.length) // still no duplicates
    // Two sweeps over 260 rows is several hundred round trips, and the whole integration
    // suite shares one database — the default five seconds is not enough under that load.
  }, 30_000)

  it('does not let one workspace consume another workspace\'s budget', async () => {
    // The starvation case: a tenant carrying a large backlog must not silence a tenant
    // carrying one urgent item. A single global ceiling would do exactly that, because
    // the sweep works in due-date order across every company.
    const NOISY = 'sched-itest-noisy'
    const NOISY_SITE = 'sched-itest-noisy-site'
    await db.company.upsert({
      where: { id: NOISY }, update: {}, create: { id: NOISY, name: 'Noisy Neighbour' },
    })
    await db.site.upsert({
      where: { id: NOISY_SITE }, update: {},
      create: { id: NOISY_SITE, companyId: NOISY, name: 'Noisy Site', short: 'Noisy', city: 'Kuching' },
    })

    try {
      // The noisy tenant: 400 actions, all older than the quiet tenant's, so due-date
      // order reaches every one of them first.
      await db.correctiveAction.createMany({
        data: Array.from({ length: 400 }, (_, i) => ({
          code: `CA-NOISY-${i}`, companyId: NOISY, siteId: NOISY_SITE, title: `Noisy ${i}`,
          owner: 'Noisy Owner', dueDate: inDays(-30), status: 'open' as const, createdBy: 'itest',
        })),
      })
      // The quiet tenant: one action, due more recently.
      await makeAction('CA-QUIET', -1)

      await scheduler.sweepActions()

      const quiet = await db.notification.findMany({ where: { companyId: COMPANY } })
      const noisy = await db.notification.count({ where: { companyId: NOISY } })

      // The quiet tenant is heard despite being last in due-date order...
      expect(quiet.some((n) => n.title.includes('CA-QUIET'))).toBe(true)
      // ...and the noisy one is held to its own ceiling.
      expect(noisy).toBeLessThanOrEqual(200)
    } finally {
      await db.company.deleteMany({ where: { id: NOISY } })
    }
  }, 30_000)

  it('raises against the workspace that owns the action', async () => {
    await makeAction('CA-TENANT', -1)
    await scheduler.sweepActions()
    const notes = await db.notification.findMany({ where: { companyId: COMPANY } })
    expect(notes).toHaveLength(1)
    expect(notes[0].companyId).toBe(COMPANY)
  })

  // ── Inspections ────────────────────────────────────────────────────────────

  it('raises an overdue inspection once, and again after the date rolls forward', async () => {
    const asset = await db.asset.create({
      data: {
        code: 'AST-ITEST', qrKey: 'AST-ITEST', companyId: COMPANY, siteId: SITE,
        name: 'ITest pump', category: 'machinery', serialNumber: 'SN-1',
        owner: 'Owner One', frequency: 'monthly', nextDueDate: inDays(-3), createdBy: 'itest',
      },
    })

    await scheduler.sweepInspections()
    await scheduler.sweepInspections()
    expect(await hrefs()).toHaveLength(1)

    // Inspected, so the due date moves. The next lapse is a different event.
    await db.asset.update({ where: { id: asset.id }, data: { nextDueDate: inDays(-1) } })
    await scheduler.sweepInspections()
    expect(await hrefs()).toHaveLength(2)
  })

  it('ignores an asset that is not yet due', async () => {
    await db.asset.create({
      data: {
        code: 'AST-OK', qrKey: 'AST-OK', companyId: COMPANY, siteId: SITE,
        name: 'ITest ladder', category: 'ladder', serialNumber: 'SN-2',
        owner: 'Owner One', frequency: 'monthly', nextDueDate: inDays(9), createdBy: 'itest',
      },
    })
    await scheduler.sweepInspections()
    expect(await hrefs()).toHaveLength(0)
  })

  // ── Certificates ───────────────────────────────────────────────────────────

  const makeEmployee = () =>
    db.employee.create({
      data: {
        companyId: COMPANY, siteId: SITE, name: 'Aminah ITest', position: 'Operator',
        // Unique per call: employee numbers are unique within a company.
        employeeNo: `EMP-SCH-${Math.random().toString(36).slice(2, 8)}`,
      },
    })

  it('warns at each expiry band and flags a lapse', async () => {
    const emp = await makeEmployee()
    const cert = (n: string, courseId: string, expiresInDays: number) =>
      db.certificate.create({
        data: {
          number: n, qrKey: n, employeeId: emp.id, companyId: COMPANY,
          courseId, courseName: `Course ${courseId}`,
          issueDate: inDays(-400), expiryDate: inDays(expiresInDays), issuedBy: 'itest',
        },
      })

    await cert('CERT-ITEST-90', 'c90', 90)
    await cert('CERT-ITEST-30', 'c30', 30)
    await cert('CERT-ITEST-45', 'c45', 45) // between bands: silence is correct
    await cert('CERT-ITEST-EXP', 'cexp', -5)

    await scheduler.sweepCertificates()

    const keys = await hrefs()
    expect(keys.some((h) => h.includes('expiring=90'))).toBe(true)
    expect(keys.some((h) => h.includes('expiring=30'))).toBe(true)
    expect(keys.some((h) => h.includes('expired=1'))).toBe(true)
    expect(keys).toHaveLength(3)
  })

  it('warns about the current certificate, not the one it replaced', async () => {
    const emp = await makeEmployee()
    // An old certificate that lapsed, and the renewal that superseded it.
    await db.certificate.create({
      data: {
        number: 'CERT-OLD', qrKey: 'CERT-OLD', employeeId: emp.id, companyId: COMPANY,
        courseId: 'same', courseName: 'Working at Height',
        issueDate: inDays(-800), expiryDate: inDays(-40), issuedBy: 'itest',
      },
    })
    await db.certificate.create({
      data: {
        number: 'CERT-NEW', qrKey: 'CERT-NEW', employeeId: emp.id, companyId: COMPANY,
        courseId: 'same', courseName: 'Working at Height',
        issueDate: inDays(-10), expiryDate: inDays(30), issuedBy: 'itest',
      },
    })

    await scheduler.sweepCertificates()

    const notes = await db.notification.findMany({ where: { companyId: COMPANY } })
    // One warning, for the renewal's own expiry band. Nothing about the superseded row.
    expect(notes).toHaveLength(1)
    expect(notes[0].detail).toContain('CERT-NEW')
  })

  it('ignores a certificate with no expiry', async () => {
    const emp = await makeEmployee()
    await db.certificate.create({
      data: {
        number: 'CERT-FOREVER', qrKey: 'CERT-FOREVER', employeeId: emp.id, companyId: COMPANY,
        courseId: 'perm', courseName: 'Induction',
        issueDate: inDays(-100), expiryDate: null, issuedBy: 'itest',
      },
    })
    await scheduler.sweepCertificates()
    expect(await hrefs()).toHaveLength(0)
  })

  // ── The whole pass ─────────────────────────────────────────────────────────

  it('runs every sweep and stays idempotent across passes', async () => {
    await makeAction('CA-ALL', -10)
    await db.asset.create({
      data: {
        code: 'AST-ALL', qrKey: 'AST-ALL', companyId: COMPANY, siteId: SITE,
        name: 'ITest genset', category: 'machinery', serialNumber: 'SN-3',
        owner: 'Owner One', frequency: 'monthly', nextDueDate: inDays(-2), createdBy: 'itest',
      },
    })
    const emp = await makeEmployee()
    await db.certificate.create({
      data: {
        number: 'CERT-ALL', qrKey: 'CERT-ALL', employeeId: emp.id, companyId: COMPANY,
        courseId: 'all', courseName: 'LOTO',
        issueDate: inDays(-400), expiryDate: inDays(-1), issuedBy: 'itest',
      },
    })

    /*
     * runOnce sweeps every workspace, so its return counts include whatever other suites
     * happen to have in the table at that moment - vitest runs test files in parallel.
     * Asserting an exact global count made this fail intermittently for reasons that had
     * nothing to do with the scheduler. The subject is that a full pass raises this
     * workspace's three notifications and then raises nothing further, so that is what is
     * asserted: our own rows, and idempotency measured against them.
     */
    const first = await scheduler.runOnce()
    expect(first.actions).toBeGreaterThan(0)
    expect(first.inspections).toBeGreaterThanOrEqual(1)
    expect(first.certificates).toBeGreaterThanOrEqual(1)

    const raised = await hrefs()
    expect(raised.some((h) => h.includes('CA-ALL') || h.includes('/actions'))).toBe(true)
    expect(raised.some((h) => h.includes('/assets'))).toBe(true)
    expect(raised.some((h) => h.includes('/training') || h.includes('/employees'))).toBe(true)

    // A second pass must add nothing for this workspace.
    await scheduler.runOnce()
    expect(await hrefs()).toHaveLength(raised.length)
  })
  // -- Calibration ----------------------------------------------------------

  /** A detector with one certificate, expiring in `n` days. */
  const makeDetector = async (code: string, expiresInDays: number | null, over: Record<string, unknown> = {}) => {
    const asset = await db.asset.create({
      data: {
        code, qrKey: code, companyId: COMPANY, siteId: SITE,
        name: `ITest detector ${code}`, category: 'gas_detector', serialNumber: `SN-${code}`,
        owner: 'Owner One', frequency: 'monthly', nextDueDate: inDays(200), createdBy: 'itest',
        ...over,
      },
    })
    if (expiresInDays !== null) {
      await db.calibration.create({
        data: {
          assetId: asset.id, calibratedAt: inDays(-30), expiresAt: inDays(expiresInDays),
          certificateNumber: `CAL-${code}`, recordedBy: 'itest',
        },
      })
    }
    return asset
  }

  it('warns at thirty, fourteen, seven and one day out — and not on other days', async () => {
    await makeDetector('AST-C30', 30)
    await makeDetector('AST-C14', 14)
    await makeDetector('AST-C7', 7)
    await makeDetector('AST-C1', 1)
    await makeDetector('AST-C9', 9)   // between thresholds: silence is correct
    await makeDetector('AST-C60', 60)

    await scheduler.sweepCalibrations()
    expect(await hrefs()).toHaveLength(4)
  })

  it('chases an instrument that is already out of calibration', async () => {
    await makeDetector('AST-CX', -3)
    expect(await scheduler.sweepCalibrations()).toBe(1)

    const [n] = await db.notification.findMany({ where: { companyId: COMPANY } })
    expect(n.title).toMatch(/Calibration expired/)
    // The consequence, not just the fact: this is what makes someone act on it.
    expect(n.detail).toMatch(/cannot be booked onto a permit/i)
  })

  it('says so when the instrument is safety-critical', async () => {
    await makeDetector('AST-CC', -1, { critical: true })
    await scheduler.sweepCalibrations()
    const [n] = await db.notification.findMany({ where: { companyId: COMPANY } })
    expect(n.detail).toMatch(/^Critical equipment\./)
  })

  it('counts only the newest certificate, so a superseded lapse is not chased forever', async () => {
    const a = await makeDetector('AST-CS', -40)
    await db.calibration.create({
      data: {
        assetId: a.id, calibratedAt: inDays(-2), expiresAt: inDays(300),
        certificateNumber: 'CAL-NEW', recordedBy: 'itest',
      },
    })
    expect(await scheduler.sweepCalibrations()).toBe(0)
  })

  it('leaves disposed and retired instruments alone', async () => {
    await makeDetector('AST-CD', -5, { status: 'disposed' })
    await makeDetector('AST-CR', -5, { status: 'retired' })
    expect(await scheduler.sweepCalibrations()).toBe(0)
  })

  it('does not chase a category that needs no calibration', async () => {
    await makeDetector('AST-CL', -5, { category: 'ladder' })
    expect(await scheduler.sweepCalibrations()).toBe(0)
  })

  it('chases an item flagged for calibration whatever its category', async () => {
    await makeDetector('AST-CF', -5, { category: 'machinery', requiresCalibration: true })
    expect(await scheduler.sweepCalibrations()).toBe(1)
  })

  it('raises the lapse again after a recalibration lapses, because it is a new event', async () => {
    const a = await makeDetector('AST-CN', -2)
    await scheduler.sweepCalibrations()
    expect(await scheduler.sweepCalibrations()).toBe(0)   // same certificate, no repeat

    await db.calibration.create({
      data: {
        assetId: a.id, calibratedAt: inDays(-20), expiresAt: inDays(-1),
        certificateNumber: 'CAL-NEXT', recordedBy: 'itest',
      },
    })
    expect(await scheduler.sweepCalibrations()).toBe(1)
  })

  // -- Maintenance ----------------------------------------------------------

  const makeWorkOrder = async (code: string, dueInDays: number, over: Record<string, unknown> = {}) => {
    const asset = await db.asset.create({
      data: {
        code: `AST-${code}`, qrKey: `AST-${code}`, companyId: COMPANY, siteId: SITE,
        name: `ITest rig ${code}`, category: 'machinery', serialNumber: `SN-${code}`,
        owner: 'Owner One', frequency: 'monthly', nextDueDate: inDays(200), createdBy: 'itest',
      },
    })
    return db.workOrder.create({
      data: {
        code, assetId: asset.id, kind: 'preventive', description: `Work ${code}`,
        dueAt: inDays(dueInDays), raisedBy: 'itest', ...over,
      },
    })
  }

  it('chases only work orders that are past due and still open', async () => {
    await makeWorkOrder('WO-LATE', -3)
    await makeWorkOrder('WO-SOON', 3)
    await makeWorkOrder('WO-DONE', -3, { status: 'completed' })
    await makeWorkOrder('WO-VOID', -3, { status: 'cancelled' })

    expect(await scheduler.sweepMaintenance()).toBe(1)
  })

  it('does not raise the same overdue work order twice', async () => {
    await makeWorkOrder('WO-ONCE', -5)
    /*
     * Counted against this workspace's notifications, not the sweep's global return value.
     * The sweeps run across every company and vitest runs test files in parallel, so
     * another suite's overdue work order lands in the same pass - which made this fail for
     * reasons that had nothing to do with deduplication. The subject is that a second pass
     * adds nothing for our row, and that is what is measured.
     */
    await scheduler.sweepMaintenance()
    const after = (await hrefs()).length
    expect(after).toBeGreaterThan(0)

    await scheduler.sweepMaintenance()
    expect(await hrefs()).toHaveLength(after)
  })

  // -- Out of service -------------------------------------------------------

  it('raises equipment sitting out of service, once, not nightly', async () => {
    await makeDetector('AST-OOS', 200, { status: 'out_of_service' })
    // Measured against this workspace, for the same reason as the work-order sweep above.
    await scheduler.sweepOutOfService()
    const after = (await hrefs()).length
    expect(after).toBeGreaterThan(0)

    // A daily reminder that it is still broken is noise, and noise gets everything ignored.
    await scheduler.sweepOutOfService()
    expect(await hrefs()).toHaveLength(after)
  })

  it('names critical equipment differently, because it is read differently', async () => {
    await makeDetector('AST-OOC', 200, { status: 'out_of_service', critical: true })
    await scheduler.sweepOutOfService()
    const [n] = await db.notification.findMany({ where: { companyId: COMPANY } })
    expect(n.title).toMatch(/^Critical equipment out of service/)
  })

  it('leaves in-service equipment alone', async () => {
    await makeDetector('AST-OK', 200)
    expect(await scheduler.sweepOutOfService()).toBe(0)
  })
  // -- Visitors -------------------------------------------------------------

  const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600_000)

  let visitSeq = 0
  const makeVisit = async (over: Record<string, unknown> = {}) => {
    visitSeq += 1
    return db.visitor.create({
      data: {
        code: `VIS-IT-${visitSeq}`,
        passKey: `pass-itest-${visitSeq}-${Math.random().toString(36).slice(2, 8)}`,
        companyId: COMPANY, siteId: SITE,
        name: `ITest visitor ${visitSeq}`, idNumber: `IC-IT-${visitSeq}`,
        expectedArrival: hoursFromNow(-4), expectedDeparture: hoursFromNow(-1),
        status: 'on_site', checkedInAt: hoursFromNow(-3),
        createdBy: 'itest',
        ...over,
      },
    })
  }

  it('chases a visitor who is still on site past their departure time', async () => {
    await makeVisit()
    expect(await scheduler.sweepOverdueVisitors()).toBe(1)

    const [n] = await db.notification.findMany({ where: { companyId: COMPANY } })
    expect(n.title).toMatch(/still on site/i)
    expect(n.detail).toMatch(/has not checked out/i)
  })

  it('does not chase a visitor who is still within their window', async () => {
    await makeVisit({ expectedDeparture: hoursFromNow(2) })
    expect(await scheduler.sweepOverdueVisitors()).toBe(0)
  })

  it('does not chase a visitor who has already left', async () => {
    await makeVisit({ status: 'checked_out', checkedOutAt: hoursFromNow(-1) })
    expect(await scheduler.sweepOverdueVisitors()).toBe(0)
  })

  it('raises the overdue visitor once, not on every pass', async () => {
    await makeVisit()
    expect(await scheduler.sweepOverdueVisitors()).toBe(1)
    // Re-raised hourly, this becomes noise, and noise is what gets the real one dismissed.
    expect(await scheduler.sweepOverdueVisitors()).toBe(0)
  })

  it('chases a badge that left with somebody', async () => {
    await makeVisit({
      status: 'checked_out', checkedOutAt: hoursFromNow(-1),
      badgeNumber: 'B-LOST', badgeReturnedAt: null,
    })
    expect(await scheduler.sweepOutstandingBadges()).toBe(1)

    const [n] = await db.notification.findMany({ where: { companyId: COMPANY } })
    expect(n.title).toMatch(/Badge not returned: B-LOST/)
  })

  it('leaves a returned badge alone', async () => {
    await makeVisit({
      status: 'checked_out', checkedOutAt: hoursFromNow(-1),
      badgeNumber: 'B-OK', badgeReturnedAt: hoursFromNow(-1),
    })
    expect(await scheduler.sweepOutstandingBadges()).toBe(0)
  })

  it('expires a booking nobody turned up for', async () => {
    await makeVisit({ status: 'pre_registered', checkedInAt: null })
    expect(await scheduler.sweepExpiredVisits()).toBe(1)

    const row = await db.visitor.findFirst({ where: { companyId: COMPANY } })
    // Otherwise "expected today" is a list of people who never came.
    expect(row?.status).toBe('expired')
  })

  it('does not expire a booking that is still ahead', async () => {
    await makeVisit({
      status: 'pre_registered', checkedInAt: null,
      expectedArrival: hoursFromNow(1), expectedDeparture: hoursFromNow(4),
    })
    expect(await scheduler.sweepExpiredVisits()).toBe(0)
  })

  it('never expires somebody who is actually inside', async () => {
    await makeVisit()   // on_site, past their departure
    expect(await scheduler.sweepExpiredVisits()).toBe(0)
    // They are the overdue sweep's problem, and losing them here would lose them entirely.
    expect(await scheduler.sweepOverdueVisitors()).toBe(1)
  })
})
