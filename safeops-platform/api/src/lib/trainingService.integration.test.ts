import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { TrainingError, TrainingService } from './trainingService.js'
import { TRAINING_COURSES, courseApplies } from './trainingCatalog.js'
import type { Caller } from '../domain/caller.js'

/**
 * Integration tests — these run against a REAL PostgreSQL database, not a fake.
 *
 * The thing worth protecting here is that competency is derived, never stored: a
 * certificate lapses by the passage of time, and a renewal supersedes its predecessor
 * without anyone editing a flag. That only holds if the derivation runs over real rows,
 * which is what these exercise, along with roster scoping expressed as SQL and the
 * transactional numbering behind certificate numbers.
 *
 * Requires a database: `npm run db:start && npm run prisma:migrate`.
 * Skipped automatically when DATABASE_URL is absent so CI without a DB stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const svc = new TrainingService(db)

const COMPANY = 'trn-itest-co'
const SITE = 'trn-itest-site'
const SITE_B = 'trn-itest-site-b'
const OTHER = 'trn-itest-other-co'
const OTHER_SITE = 'trn-itest-other-site'

const manager: Caller = {
  userId: 'trn-mgr', name: 'TRN Manager',
  roles: [{ companyId: COMPANY, role: 'hse_manager', siteIds: [] }],
}
const officer: Caller = {
  userId: 'trn-so', name: 'TRN Officer',
  roles: [{ companyId: COMPANY, role: 'safety_officer', siteIds: [SITE] }],
}
const supervisor: Caller = {
  userId: 'trn-sup', name: 'TRN Supervisor',
  roles: [{ companyId: COMPANY, role: 'supervisor', siteIds: [SITE] }],
}
/** Named to match a seeded employee, so "employee sees only themselves" is testable. */
const employee: Caller = {
  userId: 'trn-emp', name: 'Maintenance Mike',
  roles: [{ companyId: COMPANY, role: 'employee', siteIds: [] }],
}
const outsider: Caller = {
  userId: 'trn-out', name: 'TRN Outsider',
  roles: [{ companyId: OTHER, role: 'admin', siteIds: [] }],
}

const DAY = 86400_000
const dateOnly = (d: Date) => d.toISOString().slice(0, 10)

/** Safety Induction — mandatory, applies to everyone, 24-month validity. */
const INDUCTION = TRAINING_COURSES.find((c) => c.id === 'trn-101')!
/** Working at Height — mandatory, Maintenance only. */
const HEIGHT = TRAINING_COURSES.find((c) => c.id === 'trn-102')!

let mike = ''   // Maintenance — matches two mandatory courses
let wendy = ''  // Warehouse — different course set
let otherEmp = ''

async function makeEmployee(
  id: string, name: string, department: string, companyId = COMPANY, siteId = SITE,
) {
  const row = await db.employee.upsert({
    where: { id },
    update: { name, department, companyId, siteId },
    create: { id, employeeNo: `EMP-${id}`, name, department, companyId, siteId, position: 'Technician' },
  })
  return row.id
}

/** Issues a certificate directly — the shortcut for setting up expiry scenarios. */
async function issueCert(employeeId: string, courseId: string, opts: {
  issueDaysAgo?: number; expiresInDays?: number | null; companyId?: string
} = {}) {
  const n = Math.floor(Math.random() * 1e9)
  return db.certificate.create({
    data: {
      number: `CERT-TEST-${n}`,
      qrKey: `CERT-TEST-${n}`,
      employeeId,
      companyId: opts.companyId ?? COMPANY,
      courseId,
      courseName: TRAINING_COURSES.find((c) => c.id === courseId)?.name ?? 'Course',
      issueDate: new Date(Date.now() - (opts.issueDaysAgo ?? 0) * DAY),
      expiryDate:
        opts.expiresInDays === null
          ? null
          : new Date(Date.now() + (opts.expiresInDays ?? 365) * DAY),
      issuedBy: 'TRN Manager',
    },
  })
}

d('TrainingService — integration (real Postgres)', () => {
  beforeAll(async () => {
    for (const [id, name] of [[COMPANY, 'TRN ITest Co'], [OTHER, 'TRN Other Co']]) {
      await db.company.upsert({ where: { id }, update: {}, create: { id, name } })
    }
    for (const [id, companyId] of [[SITE, COMPANY], [SITE_B, COMPANY], [OTHER_SITE, OTHER]]) {
      await db.site.upsert({
        where: { id }, update: {}, create: { id, companyId, name: `Site ${id}` },
      })
    }
    mike = await makeEmployee('trn-e1', 'Maintenance Mike', 'Maintenance')
    wendy = await makeEmployee('trn-e2', 'Warehouse Wendy', 'Warehouse', COMPANY, SITE_B)
    otherEmp = await makeEmployee('trn-e3', 'Other Olive', 'Maintenance', OTHER, OTHER_SITE)
  })

  afterAll(async () => {
    await db.correctiveAction.deleteMany({ where: { companyId: { in: [COMPANY, OTHER] } } })
    await db.company.deleteMany({ where: { id: { in: [COMPANY, OTHER] } } })
    await db.counter.deleteMany({ where: { companyId: { in: [COMPANY, OTHER] } } })
    await db.$disconnect()
  })

  // ── Course applicability ───────────────────────────────────────────────────

  it('applies a course to a department by keyword, not exact name', () => {
    // "Warehouse & Stores" has to match a course scoped to "Warehouse".
    expect(courseApplies({ applies: ['Warehouse'] }, 'Warehouse & Stores')).toBe(true)
    expect(courseApplies({ applies: ['M&E'] }, 'M&E Installation')).toBe(true)
    expect(courseApplies({ applies: ['Maintenance'] }, 'Production')).toBe(false)
    // Empty means the whole workforce.
    expect(courseApplies({ applies: [] }, 'Anything')).toBe(true)
  })

  it('lists the standard catalogue plus the workspace’s own courses', async () => {
    const before = await svc.listCourses(manager, COMPANY)
    expect(before.length).toBe(TRAINING_COURSES.length)

    const made = await svc.createCourse(manager, COMPANY, {
      name: 'Night Shift Awareness', category: 'safety', mandatory: false,
      validityMonths: 12, durationHours: 2, deliveryModes: ['online'], applies: ['Maintenance'],
    })
    expect(made.code).toMatch(/^TRN-\d+$/)

    const after = await svc.listCourses(manager, COMPANY)
    expect(after.length).toBe(TRAINING_COURSES.length + 1)
    // Applicability is computed against the real roster.
    const mine = after.find((c) => c.id === made.id)!
    expect(mine.requiredEmployees).toBe(1) // only Mike is Maintenance
    expect(mine.compliancePct).toBe(0)
  })

  it('requires a reviewer role and a positive duration to author a course', async () => {
    for (const caller of [officer, supervisor, employee]) {
      await expect(svc.createCourse(caller, COMPANY, {
        name: 'Not allowed', category: 'safety', mandatory: false,
        validityMonths: null, durationHours: 1, deliveryModes: ['online'],
      })).rejects.toMatchObject({ status: 403 })
    }
    await expect(svc.createCourse(manager, COMPANY, {
      name: '  ', category: 'safety', mandatory: false,
      validityMonths: null, durationHours: 1, deliveryModes: ['online'],
    })).rejects.toMatchObject({ code: 'validation' })
    await expect(svc.createCourse(manager, COMPANY, {
      name: 'Zero hours', category: 'safety', mandatory: false,
      validityMonths: null, durationHours: 0, deliveryModes: ['online'],
    })).rejects.toMatchObject({ code: 'validation' })
  })

  // ── Derived competency ─────────────────────────────────────────────────────

  it('derives competency status from the certificate expiry, never a stored flag', async () => {
    await issueCert(mike, INDUCTION.id, { expiresInDays: 400 })
    let m = await svc.trainingMatrix(manager, COMPANY)
    let row = m.employees.find((e) => e.employeeId === mike)!
    expect(row.cells[INDUCTION.id].status).toBe('competent')

    // Inside the 90-day window it reads as expiring, without anything being written.
    await db.certificate.updateMany({
      where: { employeeId: mike, courseId: INDUCTION.id },
      data: { expiryDate: new Date(Date.now() + 30 * DAY) },
    })
    m = await svc.trainingMatrix(manager, COMPANY)
    row = m.employees.find((e) => e.employeeId === mike)!
    expect(row.cells[INDUCTION.id].status).toBe('expiring')

    await db.certificate.updateMany({
      where: { employeeId: mike, courseId: INDUCTION.id },
      data: { expiryDate: new Date(Date.now() - DAY) },
    })
    m = await svc.trainingMatrix(manager, COMPANY)
    row = m.employees.find((e) => e.employeeId === mike)!
    expect(row.cells[INDUCTION.id].status).toBe('expired')
    // A lapsed mandatory competency is At Risk whatever the percentage says.
    expect(row.hasExpiredMandatory).toBe(true)
    expect(row.level).toBe('At Risk')
  })

  it('treats a certificate with no expiry as permanently competent', async () => {
    await db.certificate.deleteMany({ where: { employeeId: wendy } })
    await issueCert(wendy, INDUCTION.id, { expiresInDays: null })
    const m = await svc.trainingMatrix(manager, COMPANY)
    const row = m.employees.find((e) => e.employeeId === wendy)!
    expect(row.cells[INDUCTION.id].status).toBe('competent')
    expect(row.cells[INDUCTION.id].expiryDate).toBeNull()
  })

  it('supersedes an older certificate with the most recently issued one', async () => {
    await db.certificate.deleteMany({ where: { employeeId: wendy } })
    // An old lapsed one, then a fresh renewal.
    await issueCert(wendy, INDUCTION.id, { issueDaysAgo: 800, expiresInDays: -30 })
    await issueCert(wendy, INDUCTION.id, { issueDaysAgo: 1, expiresInDays: 700 })

    const m = await svc.trainingMatrix(manager, COMPANY)
    const row = m.employees.find((e) => e.employeeId === wendy)!
    // The renewal wins; the lapsed predecessor is not counted twice or at all.
    expect(row.cells[INDUCTION.id].status).toBe('competent')

    const certs = await svc.listCertificates(manager, { companyId: COMPANY })
    const hers = certs.filter((c) => c.employeeId === wendy && c.courseId === INDUCTION.id)
    expect(hers).toHaveLength(1)
    expect(hers[0].status).toBe('competent')
  })

  it('counts a missing certificate as a gap and scores the employee accordingly', async () => {
    await db.certificate.deleteMany({ where: { employeeId: mike } })
    const m = await svc.trainingMatrix(manager, COMPANY)
    const row = m.employees.find((e) => e.employeeId === mike)!

    expect(row.requiredCount).toBeGreaterThan(0)
    expect(row.competentCount).toBe(0)
    expect(row.gapCount).toBe(row.requiredCount)
    expect(row.compliancePct).toBe(0)
    expect(row.cells[HEIGHT.id].status).toBe('missing')
    expect(row.level).toBe('At Risk')
  })

  it('grades competency level from the compliance percentage', async () => {
    await db.certificate.deleteMany({ where: { employeeId: mike } })
    // Every applicable course, custom ones included — the workspace's own courses are
    // part of the requirement, so certifying only the built-ins is not full compliance.
    const all = await svc.allCourses(COMPANY)
    const required = all.filter((c) => courseApplies(c, 'Maintenance'))
    for (const c of required) await issueCert(mike, c.id, { expiresInDays: 400 })

    const m = await svc.trainingMatrix(manager, COMPANY)
    const row = m.employees.find((e) => e.employeeId === mike)!
    expect(row.compliancePct).toBe(100)
    expect(row.level).toBe('Fully Competent')
    expect(row.hasExpiredMandatory).toBe(false)
  })

  it('orders the matrix weakest first', async () => {
    const m = await svc.trainingMatrix(manager, COMPANY)
    for (let i = 1; i < m.employees.length; i++) {
      expect(m.employees[i - 1].compliancePct).toBeLessThanOrEqual(m.employees[i].compliancePct)
    }
    // Only courses that apply to somebody appear as columns — built-in or workspace-authored.
    const all = await svc.allCourses(COMPANY)
    expect(m.courses.length).toBeGreaterThan(0)
    expect(m.courses.every((c) => all.some((t) => t.id === c.id))).toBe(true)
  })

  // ── Roster scoping ─────────────────────────────────────────────────────────

  it('scopes the roster: a supervisor sees their sites, an employee sees only themselves', async () => {
    const asManager = await svc.trainingMatrix(manager, COMPANY)
    expect(asManager.employees.length).toBeGreaterThanOrEqual(2)

    // Supervisor is limited to SITE; Wendy is at SITE_B.
    const asSupervisor = await svc.trainingMatrix(supervisor, COMPANY)
    expect(asSupervisor.employees.every((e) => e.siteId === SITE)).toBe(true)
    expect(asSupervisor.employees.some((e) => e.employeeId === wendy)).toBe(false)

    // An employee sees one row — their own.
    const asEmployee = await svc.trainingMatrix(employee, COMPANY)
    expect(asEmployee.employees).toHaveLength(1)
    expect(asEmployee.employees[0].employeeId).toBe(mike)
  })

  it('refuses a direct fetch of an employee outside the caller’s scope', async () => {
    // Wendy is at SITE_B, the supervisor is scoped to SITE.
    await expect(svc.getEmployeeTraining(supervisor, wendy)).rejects.toMatchObject({ status: 403 })
    // But their own site is fine.
    const own = await svc.getEmployeeTraining(supervisor, mike)
    expect(own.competency.employeeId).toBe(mike)
  })

  it('builds an employee profile with required courses, renewals and history', async () => {
    await db.certificate.deleteMany({ where: { employeeId: mike } })
    await issueCert(mike, INDUCTION.id, { expiresInDays: 45 })

    const p = await svc.getEmployeeTraining(manager, mike)
    expect(p.competency.employeeId).toBe(mike)
    expect(p.required.some((r) => r.course.id === HEIGHT.id && r.status === 'missing')).toBe(true)
    expect(p.certificates).toHaveLength(1)
    expect(p.upcomingRenewals).toHaveLength(1)
    expect(p.upcomingRenewals[0].daysToExpiry).toBe(45)
    expect(p.history.some((h) => h.kind === 'certified')).toBe(true)
  })

  // ── Sessions ───────────────────────────────────────────────────────────────

  it('schedules a session with a per-tenant reference and seats', async () => {
    const s = await svc.createSession(officer, {
      companyId: COMPANY, siteId: SITE, courseId: HEIGHT.id,
      trainer: 'TRN Officer', venue: 'Training room 1', mode: 'physical',
      scheduledFor: dateOnly(new Date(Date.now() + 7 * DAY)),
      maxParticipants: 10, enrolled: [mike],
    })
    expect(s.code).toMatch(/^SES-\d+$/)
    expect(s.status).toBe('scheduled')
    expect(s.enrolledCount).toBe(1)
    expect(s.seatsLeft).toBe(9)
    // Duration comes from the course, not the request.
    expect(s.durationHours).toBe(HEIGHT.durationHours)
  })

  it('refuses a session over capacity, with a bad course, or a foreign site', async () => {
    const base = {
      companyId: COMPANY, siteId: SITE, courseId: HEIGHT.id,
      trainer: 'T', venue: 'V', mode: 'physical' as const,
      scheduledFor: dateOnly(new Date()), maxParticipants: 1,
    }
    await expect(svc.createSession(officer, { ...base, enrolled: [mike, wendy] }))
      .rejects.toMatchObject({ code: 'validation' })
    await expect(svc.createSession(officer, { ...base, courseId: 'trn-nope' }))
      .rejects.toMatchObject({ code: 'validation' })
    await expect(svc.createSession(officer, { ...base, siteId: OTHER_SITE }))
      .rejects.toMatchObject({ code: 'validation' })
    await expect(svc.createSession(officer, { ...base, trainer: '  ' }))
      .rejects.toMatchObject({ code: 'validation' })
    // Someone else's employee cannot be booked onto this tenant's session.
    await expect(svc.createSession(officer, { ...base, maxParticipants: 5, enrolled: [otherEmp] }))
      .rejects.toMatchObject({ code: 'validation' })
  })

  it('requires a manage role to schedule and to enrol', async () => {
    const base = {
      companyId: COMPANY, siteId: SITE, courseId: HEIGHT.id,
      trainer: 'T', venue: 'V', mode: 'physical' as const,
      scheduledFor: dateOnly(new Date()), maxParticipants: 5,
    }
    for (const caller of [employee, supervisor]) {
      await expect(svc.createSession(caller, base)).rejects.toMatchObject({ status: 403 })
    }
    const s = await svc.createSession(officer, base)
    await expect(svc.enrollSession(employee, s.id, [mike])).rejects.toMatchObject({ status: 403 })
  })

  it('enrols idempotently and stops at capacity', async () => {
    const s = await svc.createSession(officer, {
      companyId: COMPANY, siteId: SITE, courseId: INDUCTION.id,
      trainer: 'TRN Officer', venue: 'Room 2', mode: 'physical',
      scheduledFor: dateOnly(new Date(Date.now() + 3 * DAY)), maxParticipants: 2,
    })

    const once = await svc.enrollSession(officer, s.id, [mike])
    expect(once.enrolledCount).toBe(1)
    // Enrolling the same person twice is a mistake, not a second seat.
    const twice = await svc.enrollSession(officer, s.id, [mike])
    expect(twice.enrolledCount).toBe(1)

    const full = await svc.enrollSession(officer, s.id, [wendy])
    expect(full.seatsLeft).toBe(0)
    await expect(svc.enrollSession(officer, s.id, [otherEmp]))
      .rejects.toMatchObject({ code: 'validation' })
  })

  it('flags a scheduled session past its date as overdue without storing that state', async () => {
    const s = await svc.createSession(officer, {
      companyId: COMPANY, siteId: SITE, courseId: INDUCTION.id,
      trainer: 'TRN Officer', venue: 'Room 3', mode: 'physical',
      scheduledFor: dateOnly(new Date(Date.now() - 5 * DAY)), maxParticipants: 5,
    })
    expect(s.overdue).toBe(true)
    expect(s.daysToStart).toBe(-5)
    expect((await db.trainingSession.findUniqueOrThrow({ where: { id: s.id } })).status)
      .toBe('scheduled')
  })

  // ── Completion & certificates ──────────────────────────────────────────────

  it('issues a certificate to everyone who attended and passed, and nobody else', async () => {
    await db.certificate.deleteMany({ where: { employeeId: { in: [mike, wendy] } } })
    const s = await svc.createSession(officer, {
      companyId: COMPANY, siteId: SITE, courseId: INDUCTION.id,
      trainer: 'TRN Officer', venue: 'Room 4', mode: 'physical',
      scheduledFor: dateOnly(new Date()), maxParticipants: 5, enrolled: [mike, wendy],
    })

    const r = await svc.completeSession(officer, s.id, {
      attendance: [
        { employeeId: mike, present: true, result: 'pass', score: 92 },
        { employeeId: wendy, present: true, result: 'fail', score: 40 },
      ],
      signature: 'TRN Officer',
    })

    expect(r.session.status).toBe('completed')
    expect(r.session.passedCount).toBe(1)
    expect(r.certificates).toHaveLength(1)

    const cert = r.certificates[0]
    expect(cert.employeeId).toBe(mike)
    expect(cert.number).toMatch(/^CERT-\d{4}-\d{4}$/)
    expect(cert.qrKey).toBe(cert.number)
    expect(cert.score).toBe(92)
    expect(cert.issuedBy).toBe('TRN Officer')
    // Expiry comes from the course validity at the moment of issue.
    const expected = new Date()
    expected.setUTCMonth(expected.getUTCMonth() + INDUCTION.validityMonths!)
    expect(dateOnly(cert.expiryDate!)).toBe(dateOnly(expected))
    // The one who failed gets nothing.
    expect(await db.certificate.count({ where: { employeeId: wendy, sessionId: s.id } })).toBe(0)
  })

  it('issues no certificate for a course with no expiry other than a permanent one', async () => {
    const permanent = await svc.createCourse(manager, COMPANY, {
      name: 'One-off Briefing', category: 'induction', mandatory: false,
      validityMonths: null, durationHours: 1, deliveryModes: ['online'], applies: ['Maintenance'],
    })
    const s = await svc.createSession(officer, {
      companyId: COMPANY, siteId: SITE, courseId: permanent.id,
      trainer: 'TRN Officer', venue: 'Online', mode: 'online',
      scheduledFor: dateOnly(new Date()), maxParticipants: 5, enrolled: [mike],
    })
    const r = await svc.completeSession(officer, s.id, {
      attendance: [{ employeeId: mike, present: true, result: 'pass' }],
      signature: 'TRN Officer',
    })
    expect(r.certificates[0].expiryDate).toBeNull()
    expect(r.certificates[0].status).toBe('competent')
  })

  it('refuses completion without a result, a signature, attendance, or twice', async () => {
    const s = await svc.createSession(officer, {
      companyId: COMPANY, siteId: SITE, courseId: INDUCTION.id,
      trainer: 'TRN Officer', venue: 'Room 5', mode: 'physical',
      scheduledFor: dateOnly(new Date()), maxParticipants: 5, enrolled: [mike],
    })

    // Present but ungraded — "attended" is not a competency.
    await expect(svc.completeSession(officer, s.id, {
      attendance: [{ employeeId: mike, present: true, result: null }], signature: 'X',
    })).rejects.toMatchObject({ code: 'validation' })

    await expect(svc.completeSession(officer, s.id, {
      attendance: [{ employeeId: mike, present: true, result: 'pass' }], signature: '  ',
    })).rejects.toMatchObject({ code: 'validation' })

    await expect(svc.completeSession(officer, s.id, { attendance: [], signature: 'X' }))
      .rejects.toMatchObject({ code: 'validation' })

    // Somebody who was never on the sheet cannot be certified.
    await expect(svc.completeSession(officer, s.id, {
      attendance: [{ employeeId: wendy, present: true, result: 'pass' }], signature: 'X',
    })).rejects.toMatchObject({ code: 'validation' })

    // Nothing was half-written by any of the rejections.
    expect((await db.trainingSession.findUniqueOrThrow({ where: { id: s.id } })).status)
      .toBe('scheduled')
    expect(await db.certificate.count({ where: { sessionId: s.id } })).toBe(0)

    await svc.completeSession(officer, s.id, {
      attendance: [{ employeeId: mike, present: true, result: 'pass' }], signature: 'TRN Officer',
    })
    await expect(svc.completeSession(officer, s.id, {
      attendance: [{ employeeId: mike, present: true, result: 'pass' }], signature: 'X',
    })).rejects.toMatchObject({ code: 'validation' })
  })

  it('lets the named trainer close their own session but not a bystander', async () => {
    const s = await svc.createSession(officer, {
      companyId: COMPANY, siteId: SITE, courseId: INDUCTION.id,
      trainer: 'Maintenance Mike', venue: 'Room 6', mode: 'physical',
      scheduledFor: dateOnly(new Date()), maxParticipants: 5, enrolled: [mike],
    })
    await expect(svc.completeSession(supervisor, s.id, {
      attendance: [{ employeeId: mike, present: true, result: 'pass' }], signature: 'X',
    })).rejects.toMatchObject({ status: 403 })

    // `employee` is named Maintenance Mike — the trainer on this session.
    const done = await svc.completeSession(employee, s.id, {
      attendance: [{ employeeId: mike, present: true, result: 'pass' }],
      signature: 'Maintenance Mike',
    })
    expect(done.session.status).toBe('completed')
  })

  it('allocates unique certificate numbers under concurrent completion', async () => {
    const sessions = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        svc.createSession(officer, {
          companyId: COMPANY, siteId: SITE, courseId: INDUCTION.id,
          trainer: 'TRN Officer', venue: `Room C${i}`, mode: 'physical',
          scheduledFor: dateOnly(new Date()), maxParticipants: 5, enrolled: [mike],
        }),
      ),
    )
    const results = await Promise.all(
      sessions.map((s) => svc.completeSession(officer, s.id, {
        attendance: [{ employeeId: mike, present: true, result: 'pass' }],
        signature: 'TRN Officer',
      })),
    )
    const numbers = results.flatMap((r) => r.certificates.map((c) => c.number))
    expect(numbers).toHaveLength(5)
    expect(new Set(numbers).size).toBe(5)
  })

  it('numbers certificates uniquely across tenants, not just within one', async () => {
    // Regression: the sequence was per-tenant like every other reference, so two
    // workspaces both reached CERT-2026-2000 and the second insert collided. Certificate
    // numbers are quoted to outsiders and verified by number alone, so they have to be
    // unique across the deployment.
    const otherMgr: Caller = {
      userId: 'trn-other-mgr', name: 'Other Mgr',
      roles: [{ companyId: OTHER, role: 'hse_manager', siteIds: [] }],
    }
    const theirs = await svc.createSession(otherMgr, {
      companyId: OTHER, siteId: OTHER_SITE, courseId: INDUCTION.id,
      trainer: 'Other Mgr', venue: 'Their room', mode: 'physical',
      scheduledFor: dateOnly(new Date()), maxParticipants: 5, enrolled: [otherEmp],
    })
    const theirResult = await svc.completeSession(otherMgr, theirs.id, {
      attendance: [{ employeeId: otherEmp, present: true, result: 'pass' }],
      signature: 'Other Mgr',
    })

    const mine = await svc.createSession(officer, {
      companyId: COMPANY, siteId: SITE, courseId: INDUCTION.id,
      trainer: 'TRN Officer', venue: 'My room', mode: 'physical',
      scheduledFor: dateOnly(new Date()), maxParticipants: 5, enrolled: [mike],
    })
    const myResult = await svc.completeSession(officer, mine.id, {
      attendance: [{ employeeId: mike, present: true, result: 'pass' }],
      signature: 'TRN Officer',
    })

    expect(theirResult.certificates[0].number).not.toBe(myResult.certificates[0].number)

    // And each number still resolves to exactly one certificate.
    const v = await svc.verifyCertificate(theirResult.certificates[0].number)
    expect(v.certificate?.number).toBe(theirResult.certificates[0].number)
  })

  // ── Certificate register & verification ────────────────────────────────────

  it('orders the register lapsed-first and filters by status', async () => {
    const rows = await svc.listCertificates(manager, { companyId: COMPANY })
    const rank = { expired: 0, expiring: 1, competent: 2 } as const
    for (let i = 1; i < rows.length; i++) {
      expect(rank[rows[i - 1].status]).toBeLessThanOrEqual(rank[rows[i].status])
    }
    const competent = await svc.listCertificates(manager, {
      companyId: COMPANY, status: 'competent',
    })
    expect(competent.every((c) => c.status === 'competent')).toBe(true)
  })

  it('scopes the certificate register to what the caller may see', async () => {
    const asSupervisor = await svc.listCertificates(supervisor, { companyId: COMPANY })
    expect(asSupervisor.every((c) => c.siteId === SITE)).toBe(true)
  })

  it('returns only what the printed certificate shows', async () => {
    // This endpoint answers without a session, and certificate numbers are sequential.
    // Returning the full row made every tenant's workforce directory — names, emails,
    // sites, departments and internal ids — enumerable by anyone who could count.
    const cert = await issueCert(mike, INDUCTION.id, { expiresInDays: 200 })
    const v = await svc.verifyCertificate(cert.number)

    expect(Object.keys(v.certificate ?? {}).sort()).toEqual([
      'courseName', 'daysToExpiry', 'expiryDate', 'holder',
      'issueDate', 'issuedBy', 'number', 'status',
    ])
    const serialised = JSON.stringify(v)
    for (const leaked of [COMPANY, cert.id, mike, 'siteId', 'department', 'email']) {
      expect(serialised).not.toContain(leaked)
    }
  })

  it('verifies a certificate by number or QR key without a session', async () => {
    const cert = await issueCert(mike, INDUCTION.id, { expiresInDays: 400 })

    for (const key of [cert.number, cert.qrKey, cert.number.toLowerCase()]) {
      const v = await svc.verifyCertificate(key)
      expect(v.valid).toBe(true)
      expect(v.certificate?.number).toBe(cert.number)
    }

    const missing = await svc.verifyCertificate('CERT-9999-0001')
    expect(missing.valid).toBe(false)
    expect(missing.reason).toMatch(/counterfeit or mistyped/i)
    expect(missing.certificate).toBeUndefined()

    const blank = await svc.verifyCertificate('   ')
    expect(blank.valid).toBe(false)
  })

  it('reports an expired certificate as invalid and an expiring one as valid', async () => {
    const expired = await issueCert(wendy, HEIGHT.id, { expiresInDays: -10 })
    const v = await svc.verifyCertificate(expired.number)
    expect(v.valid).toBe(false)
    expect(v.reason).toMatch(/expired on/i)
    expect(v.certificate?.status).toBe('expired')

    const soon = await issueCert(wendy, INDUCTION.id, { expiresInDays: 20 })
    const v2 = await svc.verifyCertificate(soon.number)
    expect(v2.valid).toBe(true)
    expect(v2.reason).toMatch(/expires in 20 days/i)
  })

  // ── Escalation ─────────────────────────────────────────────────────────────

  it('turns a competency gap into an owned corrective action', async () => {
    const action = await svc.raiseTrainingAction(manager, mike, HEIGHT.id)

    expect(action.code).toMatch(/^CA-\d+$/)
    expect(action.source).toBe('training')
    expect(action.priority).toBe('High')
    expect(action.owner).toBe('Maintenance Mike')
    expect(action.title).toContain(HEIGHT.name)
    expect(dateOnly(action.dueDate)).toBe(dateOnly(new Date(Date.now() + 21 * DAY)))
    expect(action.companyId).toBe(COMPANY)
    expect(action.siteId).toBe(SITE)
  })

  it('requires a reviewer role and a real employee and course to escalate', async () => {
    for (const caller of [officer, supervisor, employee]) {
      await expect(svc.raiseTrainingAction(caller, mike, HEIGHT.id))
        .rejects.toMatchObject({ status: 403 })
    }
    await expect(svc.raiseTrainingAction(manager, 'no-such-employee', HEIGHT.id))
      .rejects.toMatchObject({ status: 404 })
    await expect(svc.raiseTrainingAction(manager, mike, 'no-such-course'))
      .rejects.toMatchObject({ status: 404 })
  })

  // ── Tenancy ────────────────────────────────────────────────────────────────

  it('refuses cross-tenant reads and mutations', async () => {
    await expect(svc.trainingMatrix(outsider, COMPANY)).rejects.toMatchObject({ status: 403 })
    await expect(svc.listCourses(outsider, COMPANY)).rejects.toMatchObject({ status: 403 })
    await expect(svc.listSessions(outsider, { companyId: COMPANY })).rejects.toMatchObject({ status: 403 })
    await expect(svc.listCertificates(outsider, { companyId: COMPANY })).rejects.toMatchObject({ status: 403 })
    await expect(svc.trainingStats(outsider, COMPANY)).rejects.toMatchObject({ status: 403 })
    await expect(svc.listEmployees(outsider, COMPANY)).rejects.toMatchObject({ status: 403 })
    // A guessed employee id must not resolve for an outsider.
    await expect(svc.getEmployeeTraining(outsider, mike)).rejects.toMatchObject({ status: 403 })
    await expect(svc.raiseTrainingAction(outsider, mike, HEIGHT.id)).rejects.toMatchObject({ status: 403 })
  })

  it('scopes the roster and matrix to one tenant', async () => {
    const roster = await svc.listEmployees(manager, COMPANY)
    expect(roster.every((e) => e.companyId === COMPANY)).toBe(true)
    expect(roster.some((e) => e.id === otherEmp)).toBe(false)
  })

  it('reports an employee that does not exist as not found', async () => {
    await expect(svc.getEmployeeTraining(manager, 'no-such-employee'))
      .rejects.toBeInstanceOf(TrainingError)
    await expect(svc.getEmployeeTraining(manager, 'no-such-employee'))
      .rejects.toMatchObject({ status: 404 })
  })

  // ── Counters ───────────────────────────────────────────────────────────────

  it('computes programme statistics in the database', async () => {
    const stats = await svc.trainingStats(manager, COMPANY)

    expect(stats.totalEmployees).toBeGreaterThan(0)
    expect(stats.compliancePct).toBeGreaterThanOrEqual(0)
    expect(stats.compliancePct).toBeLessThanOrEqual(100)
    expect(stats.mandatoryPct).toBeGreaterThanOrEqual(0)
    expect(stats.mandatoryPct).toBeLessThanOrEqual(100)
    expect(stats.monthlyHours).toHaveLength(6)
    // The expiry breakdown bands are cumulative slices, so none can be negative.
    expect(stats.expiryBreakdown.every((b) => b.value >= 0)).toBe(true)
    expect(stats.expiring30).toBeLessThanOrEqual(stats.expiring60)
    expect(stats.expiring60).toBeLessThanOrEqual(stats.expiring90)
    expect(stats.byDepartment.every((d) => d.value >= 0 && d.value <= 100)).toBe(true)
  })

  it('counts delivered training hours from attendance, not enrolment', async () => {
    const before = await svc.trainingStats(manager, COMPANY)
    const s = await svc.createSession(officer, {
      companyId: COMPANY, siteId: SITE, courseId: INDUCTION.id,
      trainer: 'TRN Officer', venue: 'Room H', mode: 'physical',
      scheduledFor: dateOnly(new Date()), maxParticipants: 5, enrolled: [mike, wendy],
    })
    // Two enrolled, one turned up — only the one who attended counts.
    await svc.completeSession(officer, s.id, {
      attendance: [
        { employeeId: mike, present: true, result: 'pass' },
        { employeeId: wendy, present: false, result: null },
      ],
      signature: 'TRN Officer',
    })
    const after = await svc.trainingStats(manager, COMPANY)
    expect(after.trainingHoursMonth).toBe(before.trainingHoursMonth + INDUCTION.durationHours)
  })

  // ── Cascades ───────────────────────────────────────────────────────────────

  it('cascades enrolments and certificates when an employee is removed', async () => {
    const tmp = await makeEmployee('trn-tmp', 'Temp Tina', 'Maintenance')
    const s = await svc.createSession(officer, {
      companyId: COMPANY, siteId: SITE, courseId: INDUCTION.id,
      trainer: 'TRN Officer', venue: 'Room T', mode: 'physical',
      scheduledFor: dateOnly(new Date()), maxParticipants: 5, enrolled: [tmp],
    })
    await svc.completeSession(officer, s.id, {
      attendance: [{ employeeId: tmp, present: true, result: 'pass' }], signature: 'TRN Officer',
    })
    expect(await db.certificate.count({ where: { employeeId: tmp } })).toBe(1)

    await db.employee.delete({ where: { id: tmp } })

    expect(await db.sessionEnrolment.count({ where: { employeeId: tmp } })).toBe(0)
    expect(await db.certificate.count({ where: { employeeId: tmp } })).toBe(0)
    // The session itself survives — it happened.
    expect(await db.trainingSession.count({ where: { id: s.id } })).toBe(1)
  })

  it('cascades the whole training record when the tenant is deleted', async () => {
    const TMP = 'trn-cascade-co'
    // Upserted rather than created: a run that failed part-way leaves the tenant behind,
    // and a test that only passes on a clean database is a test nobody can re-run.
    await db.company.upsert({ where: { id: TMP }, update: {}, create: { id: TMP, name: 'Cascade Co' } })
    await db.site.upsert({
      where: { id: 'trn-cascade-site' }, update: {},
      create: { id: 'trn-cascade-site', companyId: TMP, name: 'S' },
    })
    const emp = await makeEmployee('trn-cascade-e', 'Cascade Carl', 'Maintenance', TMP, 'trn-cascade-site')
    const tmpMgr: Caller = {
      userId: 'x', name: 'Cascade Mgr',
      roles: [{ companyId: TMP, role: 'hse_manager', siteIds: [] }],
    }
    const s = await svc.createSession(tmpMgr, {
      companyId: TMP, siteId: 'trn-cascade-site', courseId: INDUCTION.id,
      trainer: 'Cascade Mgr', venue: 'V', mode: 'physical',
      scheduledFor: dateOnly(new Date()), maxParticipants: 5, enrolled: [emp],
    })
    await svc.completeSession(tmpMgr, s.id, {
      attendance: [{ employeeId: emp, present: true, result: 'pass' }], signature: 'Cascade Mgr',
    })

    await db.company.delete({ where: { id: TMP } })
    await db.counter.deleteMany({ where: { companyId: TMP } })

    expect(await db.employee.count({ where: { id: emp } })).toBe(0)
    expect(await db.trainingSession.count({ where: { id: s.id } })).toBe(0)
    expect(await db.certificate.count({ where: { companyId: TMP } })).toBe(0)
  })

  it('refuses an employee referencing a company that does not exist', async () => {
    await expect(db.employee.create({
      data: { id: 'ghost', employeeNo: 'EMP-GHOST', companyId: 'no-such-company', siteId: SITE, name: 'Ghost', department: 'X' },
    })).rejects.toThrow()
  })
})
