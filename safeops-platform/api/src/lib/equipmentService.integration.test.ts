import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { EquipmentService, assessFitness } from './equipmentService.js'
import { InspectionService } from './inspectionService.js'
import { PermitService } from './permitService.js'
import { PermitReviewService } from './permitReview.js'
import { IncidentService } from './incidentService.js'
import type { Caller } from '../domain/caller.js'
import { todayDate } from '../domain/businessDay.js'

/**
 * Integration tests against a REAL PostgreSQL database.
 *
 * The subject is the permit gate. Everything else here — calibration records, fitness
 * verdicts — exists to serve the one question asked at a permit desk: may this instrument
 * be taken onto this job. So the tests are mostly about equipment that looks available and
 * is not, and about the gap between approval and start-of-work, which is where a
 * certificate can lapse without anybody touching the permit.
 *
 * Requires a database: `npm run db:start && npm run prisma:migrate`.
 * Skipped automatically when DATABASE_URL is absent so CI without a DB stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const equipment = new EquipmentService(db)
const assets = new InspectionService(db)
const permits = new PermitService(db)
const review = new PermitReviewService(db)
const incidents = new IncidentService(db)

// Unique to this suite. Vitest runs files in parallel, and a shared company id means two
// suites delete each other's rows — which has already cost a debugging session once.
const COMPANY = 'equip-itest-co'
const SITE = 'equip-itest-site'

const role = (r: string, id: string): Caller => ({
  userId: `equip-${id}`, name: `ITest ${id}`,
  roles: [{ companyId: COMPANY, role: r as never, siteIds: [] }],
})

const admin = role('admin', 'Admin')
const hse = role('hse_manager', 'HSE')
const officer = role('safety_officer', 'Officer')
const supervisor = role('supervisor', 'Supervisor')
const employee = role('employee', 'Employee')
const ceo = role('ceo', 'Ceo')

const daysFromNow = (n: number) => new Date(Date.now() + n * 86400_000)
// A date-only value n days from today's local date (APP_TIMEZONE), as the forms send it.
const isoDays = (n: number) => new Date(todayDate().getTime() + n * 86400_000).toISOString().slice(0, 10)
const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600_000).toISOString()

let seq = 0
async function newAsset(over: Partial<Parameters<typeof assets.createAsset>[1]> = {}) {
  seq += 1
  return assets.createAsset(admin, {
    companyId: COMPANY, siteId: SITE,
    name: `Detector ${seq}`, category: 'gas_detector',
    serialNumber: `SN-EQ-${seq}-${Math.random().toString(36).slice(2, 7)}`,
    owner: 'ITest Admin', frequency: 'monthly',
    ...over,
  } as never)
}

/** A calibration valid for the next year, which is the normal case. */
async function calibrate(assetId: string, over: Record<string, unknown> = {}) {
  return equipment.recordCalibration(admin, assetId, {
    calibratedAt: isoDays(-1), expiresAt: isoDays(365),
    certificateNumber: `CERT-${Math.random().toString(36).slice(2, 8)}`,
    vendor: 'Kuching Calibration Services',
    ...over,
  } as never)
}

/** An approved cold-work permit with the people and toolbox gate already satisfied. */
async function approvedPermit() {
  const p = await permits.create(admin, {
    companyId: COMPANY, siteId: SITE, type: 'cold_work',
    title: 'Survey the vessel', location: 'Tank farm',
    validFrom: hoursFromNow(1), validTo: hoursFromNow(6),
  } as never)
  await permits.submit(admin, p.id)
  await review.advance(admin, p.id, 'Entering review.')
  await review.advance(supervisor, p.id, 'Method and crew are right.')
  await review.advance(hse, p.id, 'Controls adequate.')
  await review.advance(ceo, p.id, 'Plant is free.')

  const worker = await db.employee.create({
    data: {
      companyId: COMPANY, siteId: SITE,
      employeeNo: `EMP-EQ-${Math.random().toString(36).slice(2, 8)}`,
      name: 'Gate Worker', medicalExpiry: daysFromNow(200),
    },
  })
  const attendee = await db.permitAttendee.create({
    data: { permitId: p.id, employeeId: worker.id, nameAtAssignment: worker.name, addedBy: 'ITest' },
  })
  await db.permit.update({ where: { id: p.id }, data: { toolboxAt: new Date(), toolboxBy: 'ITest' } })
  await db.permitAttendee.update({ where: { id: attendee.id }, data: { toolboxAckAt: new Date() } })
  return p
}

/** Children before parents: both link tables are ON DELETE RESTRICT against Asset. */
async function purge() {
  await db.permitEquipment.deleteMany({ where: { permit: { companyId: COMPANY } } })
  await db.incidentEquipment.deleteMany({ where: { incident: { companyId: COMPANY } } })
  await db.permit.deleteMany({ where: { companyId: COMPANY } })
  await db.incident.deleteMany({ where: { companyId: COMPANY } })
  await db.workOrder.deleteMany({ where: { asset: { companyId: COMPANY } } })
  await db.assetEvent.deleteMany({ where: { asset: { companyId: COMPANY } } })
  await db.calibration.deleteMany({ where: { asset: { companyId: COMPANY } } })
  await db.asset.deleteMany({ where: { companyId: COMPANY } })
  await db.employee.deleteMany({ where: { companyId: COMPANY } })
  await db.adminAuditEntry.deleteMany({ where: { companyId: COMPANY } })
}

async function newIncident() {
  return incidents.create(admin, {
    companyId: COMPANY, siteId: SITE,
    title: 'Equipment involved event', type: 'property_damage', severity: 'Minor',
    location: 'Tank farm', occurredAt: new Date().toISOString(),
  } as never)
}

d('Equipment — integration (real Postgres)', () => {
  beforeAll(async () => {
    await db.company.upsert({ where: { id: COMPANY }, update: {}, create: { id: COMPANY, name: 'Equipment ITest Co' } })
    await db.site.upsert({
      where: { id: SITE }, update: {},
      create: { id: SITE, companyId: COMPANY, name: 'Equipment Site', short: 'EQP', city: 'Bintulu' },
    })
  })

  afterAll(async () => {
    await purge()
    await db.company.deleteMany({ where: { id: COMPANY } })
    await db.counter.deleteMany({ where: { companyId: COMPANY } })
    await db.$disconnect()
  })

  beforeEach(purge)

  // ── Calibration ──────────────────────────────────────────────────────────

  it('records a certificate and reports the days left on it', async () => {
    const a = await newAsset()
    const c = await calibrate(a.id, { expiresAt: isoDays(30) })

    expect(c.certificateNumber).toMatch(/^CERT-/)
    expect(c.expired).toBe(false)
    expect(c.daysToExpiry).toBe(30)

    const list = await equipment.listCalibrations(admin, a.id)
    expect(list).toHaveLength(1)
  })

  it('refuses a certificate that expires before it was issued', async () => {
    const a = await newAsset()
    await expect(calibrate(a.id, { calibratedAt: isoDays(0), expiresAt: isoDays(-5) }))
      .rejects.toThrow(/cannot expire before/i)
  })

  it('refuses a calibration dated in the future', async () => {
    const a = await newAsset()
    await expect(calibrate(a.id, { calibratedAt: isoDays(10), expiresAt: isoDays(400) }))
      .rejects.toThrow(/before it has happened/i)
  })

  it('refuses calibration to a role that may not record it', async () => {
    const a = await newAsset()
    await expect(equipment.recordCalibration(employee, a.id, {
      calibratedAt: isoDays(-1), expiresAt: isoDays(365), certificateNumber: 'CERT-X',
    })).rejects.toMatchObject({ status: 403 })
  })

  it('takes equipment out of service when the calibration fails', async () => {
    const a = await newAsset()
    await calibrate(a.id, { result: 'fail' })

    const after = await db.asset.findUnique({ where: { id: a.id }, select: { status: true } })
    expect(after?.status).toBe('out_of_service')

    // And the reason the issuer sees is the status, not a stale certificate date.
    const f = await equipment.fitness(admin, a.id)
    expect(f.fit).toBe(false)
    expect(f.code).toBe('out_of_service')
  })

  it('supersedes an old certificate with a newer one rather than stacking', async () => {
    const a = await newAsset()
    await calibrate(a.id, { calibratedAt: isoDays(-400), expiresAt: isoDays(-35) })
    expect((await equipment.fitness(admin, a.id)).fit).toBe(false)

    await calibrate(a.id, { calibratedAt: isoDays(-2), expiresAt: isoDays(363) })
    const f = await equipment.fitness(admin, a.id)
    expect(f.fit).toBe(true)
    expect(f.daysToCalibration).toBe(363)
  })

  it('writes an audit entry for every calibration', async () => {
    const a = await newAsset()
    await calibrate(a.id)
    const entries = await db.adminAuditEntry.findMany({ where: { companyId: COMPANY, module: 'equipment' } })
    expect(entries.some((e) => /Calibration recorded/.test(e.action))).toBe(true)
  })

  // ── Fitness ──────────────────────────────────────────────────────────────

  it('holds a measuring instrument unfit until it has a certificate', async () => {
    const a = await newAsset()
    const before = await equipment.fitness(admin, a.id)
    expect(before.fit).toBe(false)
    expect(before.code).toBe('calibration_missing')
    // A sentence, not a boolean: the issuer has to know what to do about it.
    expect(before.reason).toMatch(/no calibration certificate/i)

    await calibrate(a.id)
    expect((await equipment.fitness(admin, a.id)).fit).toBe(true)
  })

  it('does not require calibration of a category that does not measure anything', async () => {
    const a = await newAsset({ category: 'ladder', name: 'Step ladder' })
    const f = await equipment.fitness(admin, a.id)
    expect(f.calibrationRequired).toBe(false)
    expect(f.fit).toBe(true)
  })

  it('requires calibration of any asset flagged for it, whatever its category', async () => {
    const a = await newAsset({ category: 'machinery', name: 'Torque rig' })
    await db.asset.update({ where: { id: a.id }, data: { requiresCalibration: true } })
    const f = await equipment.fitness(admin, a.id)
    expect(f.fit).toBe(false)
    expect(f.code).toBe('calibration_missing')
  })

  it('reports status ahead of dates, so a scrapped item is not described as overdue', () => {
    const f = assessFitness({
      code: 'AST-9', name: 'Old detector', status: 'disposed',
      nextDueDate: daysFromNow(-90), requiresCalibration: true,
      category: 'gas_detector', calibrations: [],
    })
    expect(f.code).toBe('disposed')
    expect(f.reason).toMatch(/disposed/i)
  })

  it('is a pure function of the facts, so the gate and the register cannot disagree', () => {
    const facts = {
      code: 'AST-1', name: 'Detector', status: 'active',
      nextDueDate: daysFromNow(20), requiresCalibration: false,
      category: 'gas_detector' as const,
      calibrations: [{ expiresAt: daysFromNow(-1), certificateNumber: 'C1', result: 'pass' }],
    }
    expect(assessFitness(facts)).toEqual(assessFitness(facts))
    expect(assessFitness(facts).code).toBe('calibration_expired')
  })

  // ── The permit gate ──────────────────────────────────────────────────────

  it('refuses to book equipment that is not fit, at the moment of booking', async () => {
    const p = await approvedPermit()
    const a = await newAsset()   // no certificate

    await expect(equipment.addToPermit(admin, p.id, a.id, 'Atmosphere monitoring'))
      .rejects.toThrow(/no calibration certificate/i)
  })

  it('books fit equipment and records it on the permit timeline', async () => {
    const p = await approvedPermit()
    const a = await newAsset()
    await calibrate(a.id)

    await equipment.addToPermit(admin, p.id, a.id, 'Atmosphere monitoring')

    const list = await equipment.listForPermit(admin, p.id)
    expect(list).toHaveLength(1)
    expect(list[0].fit).toBe(true)
    expect(list[0].purpose).toBe('Atmosphere monitoring')

    const events = await db.permitEvent.findMany({ where: { permitId: p.id } })
    expect(events.some((e) => e.action === 'Equipment booked')).toBe(true)
  })

  it('refuses the same item twice on one permit', async () => {
    const p = await approvedPermit()
    const a = await newAsset()
    await calibrate(a.id)
    await equipment.addToPermit(admin, p.id, a.id, 'Monitoring')
    await expect(equipment.addToPermit(admin, p.id, a.id, 'Again')).rejects.toThrow(/already on this permit/i)
  })

  it('refuses equipment from another workspace', async () => {
    const p = await approvedPermit()
    const foreign = await db.asset.findFirst({ where: { companyId: { not: COMPANY } }, select: { id: true } })
    if (foreign) {
      await expect(equipment.addToPermit(admin, p.id, foreign.id, 'Monitoring'))
        .rejects.toThrow(/not in this workspace/i)
    }
  })

  it('blocks activation when a booked certificate lapses after approval', async () => {
    const p = await approvedPermit()
    const a = await newAsset()
    await calibrate(a.id, { expiresAt: isoDays(2) })
    await equipment.addToPermit(admin, p.id, a.id, 'Atmosphere monitoring')

    // Everything else is satisfied: without the equipment check this permit would start.
    expect((await review.status(admin, p.id)).activationBlockers).toEqual([])

    // The certificate lapses overnight. Nobody touched the permit.
    await db.calibration.updateMany({ where: { assetId: a.id }, data: { expiresAt: daysFromNow(-1) } })

    const blockers = (await review.status(admin, p.id)).activationBlockers
    expect(blockers.some((b) => /calibration expired/i.test(b))).toBe(true)

    await expect(permits.activate(officer, p.id)).rejects.toThrow(/calibration expired/i)
  })

  it('blocks activation when booked equipment is taken out of service after approval', async () => {
    const p = await approvedPermit()
    const a = await newAsset()
    await calibrate(a.id)
    await equipment.addToPermit(admin, p.id, a.id, 'Monitoring')

    await db.asset.update({ where: { id: a.id }, data: { status: 'out_of_service' } })

    await expect(permits.activate(officer, p.id)).rejects.toThrow(/out of service/i)
  })

  it('blocks activation when a booked item falls overdue for inspection', async () => {
    const p = await approvedPermit()
    const a = await newAsset()
    await calibrate(a.id)
    await equipment.addToPermit(admin, p.id, a.id, 'Monitoring')

    /*
     * Well past due rather than a day past due, deliberately. The reminder scheduler
     * sweeps every overdue in-service asset across all workspaces within a 45-day
     * lookback, and vitest runs suites in parallel — a fixture one day overdue lands in
     * that sweep and changes another suite's counts. Outside the window it tests the same
     * thing without reaching into a neighbour.
     */
    await db.asset.update({ where: { id: a.id }, data: { nextDueDate: daysFromNow(-120) } })

    await expect(permits.activate(officer, p.id)).rejects.toThrow(/inspection was due/i)
  })

  it('lets the permit start once the equipment is put right', async () => {
    const p = await approvedPermit()
    const a = await newAsset()
    await calibrate(a.id)
    await equipment.addToPermit(admin, p.id, a.id, 'Monitoring')
    await db.calibration.updateMany({ where: { assetId: a.id }, data: { expiresAt: daysFromNow(-1) } })
    await expect(permits.activate(officer, p.id)).rejects.toThrow(/calibration expired/i)

    // Recalibrated on the morning of the job.
    await calibrate(a.id, { expiresAt: isoDays(180) })

    const started = await permits.activate(officer, p.id)
    expect(started.status).toBe('active')
  })

  it('names the offending item, because "equipment not fit" is not actionable', async () => {
    const p = await approvedPermit()
    const a = await newAsset({ name: 'Detector Bravo' })
    await calibrate(a.id)
    await equipment.addToPermit(admin, p.id, a.id, 'Monitoring')
    await db.calibration.updateMany({ where: { assetId: a.id }, data: { expiresAt: daysFromNow(-3) } })

    const [blocker] = (await review.status(admin, p.id)).activationBlockers
    expect(blocker).toContain(a.code)
  })

  it('unbooking clears the blocker and lets the permit start', async () => {
    const p = await approvedPermit()
    const a = await newAsset()
    await calibrate(a.id)
    const link = await equipment.addToPermit(admin, p.id, a.id, 'Monitoring')
    await db.calibration.updateMany({ where: { assetId: a.id }, data: { expiresAt: daysFromNow(-1) } })

    await equipment.removeFromPermit(admin, link.id)
    expect((await permits.activate(officer, p.id)).status).toBe('active')
  })

  it('will not delete an asset that is named on a permit', async () => {
    const p = await approvedPermit()
    const a = await newAsset()
    await calibrate(a.id)
    await equipment.addToPermit(admin, p.id, a.id, 'Monitoring')

    // Restrict at the database level: equipment named on a permit is part of its record.
    await expect(db.asset.delete({ where: { id: a.id } })).rejects.toThrow()
  })

  // ── The picker ───────────────────────────────────────────────────────────

  it('returns unfit equipment with its reason rather than hiding it', async () => {
    const p = await approvedPermit()
    const good = await newAsset({ name: 'Detector Good' })
    await calibrate(good.id)
    const bad = await newAsset({ name: 'Detector Bad' })

    const options = await equipment.selectableFor(admin, p.id)
    const g = options.find((o) => o.id === good.id)!
    const b = options.find((o) => o.id === bad.id)!

    expect(g.fit).toBe(true)
    expect(b.fit).toBe(false)
    // An issuer who cannot find the detector assumes the system is wrong and takes it anyway.
    expect(b.blockedReason).toMatch(/no calibration certificate/i)
  })

  it('marks what is already booked so it is not offered twice', async () => {
    const p = await approvedPermit()
    const a = await newAsset()
    await calibrate(a.id)
    await equipment.addToPermit(admin, p.id, a.id, 'Monitoring')

    const options = await equipment.selectableFor(admin, p.id)
    expect(options.find((o) => o.id === a.id)?.alreadyBooked).toBe(true)
  })

  it('leaves disposed and retired equipment out of the picker entirely', async () => {
    const p = await approvedPermit()
    const a = await newAsset()
    await db.asset.update({ where: { id: a.id }, data: { status: 'disposed' } })

    const options = await equipment.selectableFor(admin, p.id)
    expect(options.find((o) => o.id === a.id)).toBeUndefined()
  })

  it('refuses the picker to somebody outside the workspace', async () => {
    const p = await approvedPermit()
    const outsider: Caller = {
      userId: 'equip-outsider', name: 'Outsider',
      roles: [{ companyId: 'some-other-co', role: 'admin' as never, siteIds: [] }],
    }
    await expect(equipment.selectableFor(outsider, p.id)).rejects.toMatchObject({ status: 403 })
  })
  // -- Maintenance ----------------------------------------------------------

  it('raises a work order with a per-tenant reference', async () => {
    const a = await newAsset()
    const wo = await equipment.raiseWorkOrder(admin, a.id, {
      kind: 'preventive', description: 'Replace sensor cell', assignedTo: 'Ahmad Zaki',
      dueAt: isoDays(7),
    })
    expect(wo.code).toMatch(/^WO-\d+$/)
    expect(wo.status).toBe('open')
    expect(wo.overdue).toBe(false)
  })

  it('takes the equipment out of service for emergency work without being asked', async () => {
    const a = await newAsset()
    await equipment.raiseWorkOrder(admin, a.id, { kind: 'emergency', description: 'Sensor dead' })

    const after = await db.asset.findUnique({ where: { id: a.id }, select: { status: true } })
    expect(after?.status).toBe('under_maintenance')

    // Which the permit gate then honours, so the next shift cannot book it.
    const f = await equipment.fitness(admin, a.id)
    expect(f.fit).toBe(false)
    expect(f.code).toBe('under_maintenance')
  })

  it('leaves preventive work in service, because planned work is not a defect', async () => {
    const a = await newAsset()
    await calibrate(a.id)
    await equipment.raiseWorkOrder(admin, a.id, { kind: 'preventive', description: 'Annual service' })
    expect((await equipment.fitness(admin, a.id)).fit).toBe(true)
  })

  it('reports a work order past its due date as overdue', async () => {
    const a = await newAsset()
    const wo = await equipment.raiseWorkOrder(admin, a.id, {
      kind: 'corrective', description: 'Fix hose', dueAt: isoDays(-3),
    })
    expect(wo.overdue).toBe(true)
  })

  it('records downtime and cost, and keeps money in whole sen', async () => {
    const a = await newAsset()
    const wo = await equipment.raiseWorkOrder(admin, a.id, { kind: 'corrective', description: 'Fix hose' })
    const done = await equipment.updateWorkOrder(admin, wo.id, {
      status: 'completed', downtimeMinutes: 195, cost: 1234.56,
      partsUsed: 'Hose assembly x1', closingNote: 'Hose replaced and pressure tested.',
      returnToService: true,
    })
    expect(done.downtimeMinutes).toBe(195)
    expect(done.cost).toBe(1234.56)

    const row = await db.workOrder.findUnique({ where: { id: wo.id }, select: { costSen: true } })
    expect(row?.costSen).toBe(123456)
  })

  it('refuses to close a work order without saying what was done', async () => {
    const a = await newAsset()
    const wo = await equipment.raiseWorkOrder(admin, a.id, { kind: 'corrective', description: 'Fix hose' })
    await expect(equipment.updateWorkOrder(admin, wo.id, { status: 'completed' }))
      .rejects.toThrow(/what was done/i)
  })

  it('refuses to edit a completed work order, the same as a completed inspection', async () => {
    const a = await newAsset()
    const wo = await equipment.raiseWorkOrder(admin, a.id, { kind: 'corrective', description: 'Fix hose' })
    await equipment.updateWorkOrder(admin, wo.id, { status: 'completed', closingNote: 'Done.' })
    await expect(equipment.updateWorkOrder(admin, wo.id, { status: 'in_progress' }))
      .rejects.toThrow(/already completed/i)
  })

  it('does not return equipment to service just because the job was closed', async () => {
    const a = await newAsset()
    const wo = await equipment.raiseWorkOrder(admin, a.id, { kind: 'emergency', description: 'Sensor dead' })

    // Closed without returnToService: the part was ordered, not fitted.
    await equipment.updateWorkOrder(admin, wo.id, {
      status: 'completed', closingNote: 'Replacement cell on order.',
    })
    const after = await db.asset.findUnique({ where: { id: a.id }, select: { status: true } })
    expect(after?.status).toBe('under_maintenance')
  })

  it('refuses maintenance to a role that may not raise it', async () => {
    const a = await newAsset()
    await expect(equipment.raiseWorkOrder(employee, a.id, { kind: 'corrective', description: 'x' }))
      .rejects.toMatchObject({ status: 403 })
  })

  it('refuses negative downtime and negative cost', async () => {
    const a = await newAsset()
    const wo = await equipment.raiseWorkOrder(admin, a.id, { kind: 'corrective', description: 'Fix' })
    await expect(equipment.updateWorkOrder(admin, wo.id, { downtimeMinutes: -5 }))
      .rejects.toThrow(/cannot be negative/i)
    await expect(equipment.updateWorkOrder(admin, wo.id, { cost: -1 }))
      .rejects.toThrow(/cannot be negative/i)
  })

  it('blocks a permit whose equipment went onto emergency maintenance after approval', async () => {
    const p = await approvedPermit()
    const a = await newAsset()
    await calibrate(a.id)
    await equipment.addToPermit(admin, p.id, a.id, 'Monitoring')

    await equipment.raiseWorkOrder(admin, a.id, { kind: 'emergency', description: 'Sensor dead' })

    await expect(permits.activate(officer, p.id)).rejects.toThrow(/under maintenance/i)
  })

  // -- Incident link --------------------------------------------------------

  it('links equipment to an incident and shows it from both sides', async () => {
    const a = await newAsset({ category: 'harness', name: 'Harness H-12' })
    const inc = await newIncident()

    await equipment.linkToIncident(admin, inc.id, a.id, 'Lanyard stitching parted under load')

    const onIncident = await equipment.listForIncident(admin, inc.id)
    expect(onIncident).toHaveLength(1)
    expect(onIncident[0].involvement).toMatch(/stitching parted/)

    const onAsset = await equipment.incidentsFor(admin, a.id)
    expect(onAsset).toHaveLength(1)
    expect(onAsset[0].number).toBe(inc.number)
  })

  it('refuses the same equipment twice on one incident', async () => {
    const a = await newAsset()
    const inc = await newIncident()
    await equipment.linkToIncident(admin, inc.id, a.id, 'x')
    await expect(equipment.linkToIncident(admin, inc.id, a.id, 'again'))
      .rejects.toThrow(/already on this incident/i)
  })

  it('refuses equipment from another workspace on an incident', async () => {
    const inc = await newIncident()
    const foreign = await db.asset.findFirst({ where: { companyId: { not: COMPANY } }, select: { id: true } })
    if (foreign) {
      await expect(equipment.linkToIncident(admin, inc.id, foreign.id, 'x'))
        .rejects.toThrow(/not in this workspace/i)
    }
  })

  it('will not delete equipment that is named on an incident', async () => {
    const a = await newAsset()
    const inc = await newIncident()
    await equipment.linkToIncident(admin, inc.id, a.id, 'x')
    // Restrict: naming it on an investigation makes it part of that record.
    await expect(db.asset.delete({ where: { id: a.id } })).rejects.toThrow()
  })

  it('unlinks and leaves the timeline entry behind', async () => {
    const a = await newAsset()
    const inc = await newIncident()
    const link = await equipment.linkToIncident(admin, inc.id, a.id, 'x')
    await equipment.unlinkFromIncident(admin, link.id)

    expect(await equipment.incidentsFor(admin, a.id)).toHaveLength(0)
    // The history says it was linked and then removed. Both happened.
    const t = await equipment.timeline(admin, a.id)
    expect(t.filter((e) => e.kind === 'incident')).toHaveLength(2)
  })

  // -- Timeline -------------------------------------------------------------

  it('opens the history with the registration, so nothing is undated', async () => {
    const a = await newAsset()
    const t = await equipment.timeline(admin, a.id)
    expect(t).toHaveLength(1)
    expect(t[0].kind).toBe('created')
    expect(t[0].summary).toContain(a.code)
  })

  it('records calibration, maintenance, permit use and incidents in one history', async () => {
    const p = await approvedPermit()
    const a = await newAsset()
    await calibrate(a.id)
    await equipment.addToPermit(admin, p.id, a.id, 'Monitoring')
    await equipment.raiseWorkOrder(admin, a.id, { kind: 'preventive', description: 'Service' })
    const inc = await newIncident()
    await equipment.linkToIncident(admin, inc.id, a.id, 'Alarmed during entry')

    const kinds = (await equipment.timeline(admin, a.id)).map((e) => e.kind)
    expect(kinds).toContain('created')
    expect(kinds).toContain('calibration')
    expect(kinds).toContain('permit')
    expect(kinds).toContain('maintenance')
    expect(kinds).toContain('incident')
  })

  it('reads newest first, because the last thing that happened is the question', async () => {
    const a = await newAsset()
    await calibrate(a.id)
    const t = await equipment.timeline(admin, a.id)
    expect(t[0].kind).toBe('calibration')
    expect(t[t.length - 1].kind).toBe('created')
  })

  it('records who did it, not just what happened', async () => {
    const a = await newAsset()
    await calibrate(a.id)
    const [latest] = await equipment.timeline(admin, a.id)
    expect(latest.actor).toBe(admin.name)
    expect(latest.actorRole).toBe('admin')
  })

  it('writes the status change as its own line when a calibration fails', async () => {
    const a = await newAsset()
    await calibrate(a.id, { result: 'fail' })
    const t = await equipment.timeline(admin, a.id)
    expect(t.some((e) => e.kind === 'status_change' && /calibration failed/i.test(e.summary))).toBe(true)
  })

  it('refuses the history to somebody outside the workspace', async () => {
    const a = await newAsset()
    const outsider: Caller = {
      userId: 'equip-outsider-2', name: 'Outsider',
      roles: [{ companyId: 'some-other-co', role: 'admin' as never, siteIds: [] }],
    }
    await expect(equipment.timeline(outsider, a.id)).rejects.toMatchObject({ status: 403 })
  })
  // -- Dashboard ------------------------------------------------------------

  it('counts the register, criticals and the two out-of-action states', async () => {
    await newAsset({ name: 'A' })
    const crit = await newAsset({ name: 'B' })
    await db.asset.update({ where: { id: crit.id }, data: { critical: true } })
    const broken = await newAsset({ name: 'C' })
    await db.asset.update({ where: { id: broken.id }, data: { status: 'out_of_service' } })
    const down = await newAsset({ name: 'D' })
    await equipment.raiseWorkOrder(admin, down.id, { kind: 'emergency', description: 'Down' })

    const s = await equipment.dashboard(admin, COMPANY)
    expect(s.total).toBe(4)
    expect(s.critical).toBe(1)
    expect(s.outOfService).toBe(1)
    expect(s.underMaintenance).toBe(1)
  })

  it('leaves disposed and retired equipment out of every tile', async () => {
    const a = await newAsset()
    await db.asset.update({ where: { id: a.id }, data: { status: 'disposed' } })
    const s = await equipment.dashboard(admin, COMPANY)
    // Counting a scrapped item as available and as out of service are both wrong.
    expect(s.total).toBe(0)
    expect(s.outOfService).toBe(0)
  })

  it('counts a missing certificate as expired, never as due soon', async () => {
    await newAsset()
    const s = await equipment.dashboard(admin, COMPANY)
    expect(s.calibrationExpired).toBe(1)
    expect(s.calibrationDue).toBe(0)
  })

  it('counts only the newest certificate, so a superseded lapse is not still overdue', async () => {
    const a = await newAsset()
    await calibrate(a.id, { calibratedAt: isoDays(-400), expiresAt: isoDays(-35) })
    await calibrate(a.id, { calibratedAt: isoDays(-2), expiresAt: isoDays(363) })

    const s = await equipment.dashboard(admin, COMPANY)
    expect(s.calibrationExpired).toBe(0)
    expect(s.calibrationDue).toBe(0)
  })

  it('warns on a certificate inside the notice window', async () => {
    const a = await newAsset()
    await calibrate(a.id, { expiresAt: isoDays(5) })
    const s = await equipment.dashboard(admin, COMPANY)
    expect(s.calibrationDue).toBe(1)
    expect(s.calibrationExpired).toBe(0)
  })

  it('counts open and overdue work orders separately', async () => {
    const a = await newAsset()
    await equipment.raiseWorkOrder(admin, a.id, { kind: 'preventive', description: 'Later', dueAt: isoDays(7) })
    await equipment.raiseWorkOrder(admin, a.id, { kind: 'preventive', description: 'Late', dueAt: isoDays(-3) })

    const s = await equipment.dashboard(admin, COMPANY)
    expect(s.maintenanceOpen).toBe(2)
    expect(s.maintenanceOverdue).toBe(1)
  })

  it('breaks the register down by category and by site name', async () => {
    await newAsset({ category: 'gas_detector' })
    await newAsset({ category: 'gas_detector' })
    await newAsset({ category: 'ladder' })

    const s = await equipment.dashboard(admin, COMPANY)
    expect(s.byCategory[0]).toEqual({ name: 'gas_detector', value: 2 })
    // The site's name, not its id: nobody reads a cuid off a dashboard.
    expect(s.bySite[0]).toEqual({ name: 'Equipment Site', value: 3 })
  })

  it('lists recent maintenance newest first', async () => {
    const a = await newAsset()
    await equipment.raiseWorkOrder(admin, a.id, { kind: 'preventive', description: 'First' })
    await equipment.raiseWorkOrder(admin, a.id, { kind: 'corrective', description: 'Second' })

    const s = await equipment.dashboard(admin, COMPANY)
    expect(s.recentMaintenance[0].description).toBe('Second')
    expect(s.recentMaintenance[0].assetCode).toBe(a.code)
  })

  it('refuses the board to somebody outside the workspace', async () => {
    const outsider: Caller = {
      userId: 'equip-outsider-3', name: 'Outsider',
      roles: [{ companyId: 'some-other-co', role: 'admin' as never, siteIds: [] }],
    }
    await expect(equipment.dashboard(outsider, COMPANY)).rejects.toMatchObject({ status: 403 })
  })
  // -- Register edit and assignment -----------------------------------------

  const makeEmployee = (name = 'Holder One') => db.employee.create({
    data: {
      companyId: COMPANY, siteId: SITE,
      employeeNo: `EMP-H-${Math.random().toString(36).slice(2, 8)}`,
      name, medicalExpiry: daysFromNow(200),
    },
  })

  it('records both values on every edited field, not just that something changed', async () => {
    const a = await newAsset({ name: 'Old name', model: 'MK1' })
    await equipment.updateAsset(admin, a.id, { name: 'New name', model: 'MK2' })

    const [edit] = await equipment.timeline(admin, a.id)
    expect(edit.summary).toBe('Record edited.')
    // "Serial number: SN-1 to SN-2" is what tells an auditor it is the same physical object.
    expect(edit.detail).toContain('Name: Old name to New name')
    expect(edit.detail).toContain('Model: MK1 to MK2')
  })

  it('writes nothing to the history when nothing actually changed', async () => {
    const a = await newAsset({ name: 'Same' })
    const before = (await equipment.timeline(admin, a.id)).length
    await equipment.updateAsset(admin, a.id, { name: 'Same' })
    expect((await equipment.timeline(admin, a.id)).length).toBe(before)
  })

  it('assigns to an employee and records it as an assignment, not an edit', async () => {
    const a = await newAsset()
    const e = await makeEmployee('Ahmad Zaki')
    await equipment.updateAsset(admin, a.id, { assignedEmployeeId: e.id })

    const holder = await equipment.holderOf(admin, a.id)
    expect(holder).toMatchObject({ kind: 'employee', name: 'Ahmad Zaki' })

    const [event] = await equipment.timeline(admin, a.id)
    expect(event.kind).toBe('assigned')
    expect(event.summary).toBe('Assigned to Ahmad Zaki.')
  })

  it('returns equipment to the pool when the holder is cleared', async () => {
    const a = await newAsset()
    const e = await makeEmployee()
    await equipment.updateAsset(admin, a.id, { assignedEmployeeId: e.id })
    await equipment.updateAsset(admin, a.id, { assignedEmployeeId: null })

    expect(await equipment.holderOf(admin, a.id)).toBeNull()
    expect((await equipment.timeline(admin, a.id))[0].summary).toBe('Returned to the pool.')
  })

  it('refuses two holders at once', async () => {
    const a = await newAsset()
    const e = await makeEmployee()
    await expect(equipment.updateAsset(admin, a.id, {
      assignedEmployeeId: e.id, assignedContractorWorkerId: 'someone-else',
    })).rejects.toThrow(/held by one person/i)
  })

  it('clears the other holder when reassigned, so it never claims two', async () => {
    const a = await newAsset()
    const e1 = await makeEmployee('First')
    const e2 = await makeEmployee('Second')
    await equipment.updateAsset(admin, a.id, { assignedEmployeeId: e1.id })
    await equipment.updateAsset(admin, a.id, { assignedEmployeeId: e2.id })

    const row = await db.asset.findUnique({
      where: { id: a.id },
      select: { assignedEmployeeId: true, assignedContractorWorkerId: true },
    })
    expect(row?.assignedEmployeeId).toBe(e2.id)
    expect(row?.assignedContractorWorkerId).toBeNull()
  })

  it('refuses a holder from another workspace', async () => {
    const a = await newAsset()
    const foreign = await db.employee.findFirst({
      where: { companyId: { not: COMPANY } }, select: { id: true },
    })
    if (foreign) {
      await expect(equipment.updateAsset(admin, a.id, { assignedEmployeeId: foreign.id }))
        .rejects.toThrow(/not in this workspace/i)
    }
  })

  it('refuses an inactive holder', async () => {
    const a = await newAsset()
    const e = await makeEmployee('Left The Company')
    await db.employee.update({ where: { id: e.id }, data: { active: false } })
    await expect(equipment.updateAsset(admin, a.id, { assignedEmployeeId: e.id }))
      .rejects.toThrow(/no longer active/i)
  })

  it('refuses editing to a role that may not', async () => {
    const a = await newAsset()
    await expect(equipment.updateAsset(employee, a.id, { name: 'Renamed' }))
      .rejects.toMatchObject({ status: 403 })
  })

  it('refuses to blank a name or a serial number', async () => {
    const a = await newAsset()
    await expect(equipment.updateAsset(admin, a.id, { name: '  ' })).rejects.toThrow(/name is required/i)
    await expect(equipment.updateAsset(admin, a.id, { serialNumber: '' })).rejects.toThrow(/serial number is required/i)
  })

  it('takes the critical flag and the notes at registration', async () => {
    const a = await assets.createAsset(admin, {
      companyId: COMPANY, siteId: SITE, name: 'Critical winch', category: 'crane',
      serialNumber: `SN-CRIT-${Math.random().toString(36).slice(2, 7)}`,
      owner: 'ITest Admin', frequency: 'monthly',
      critical: true, notes: 'Statutory item, six-monthly thorough examination.',
    } as never)

    const row = await db.asset.findUnique({
      where: { id: a.id }, select: { critical: true, notes: true },
    })
    expect(row?.critical).toBe(true)
    expect(row?.notes).toMatch(/thorough examination/)
  })

  it('records the assignment when equipment is issued at registration', async () => {
    const e = await makeEmployee('Issued Day One')
    const a = await assets.createAsset(admin, {
      companyId: COMPANY, siteId: SITE, name: 'Issued detector', category: 'gas_detector',
      serialNumber: `SN-ISS-${Math.random().toString(36).slice(2, 7)}`,
      owner: 'ITest Admin', frequency: 'monthly',
      assignedEmployeeId: e.id,
    } as never)

    // Without this, an item issued on day one looks as though it was never given to anybody.
    const t = await equipment.timeline(admin, a.id)
    expect(t.some((x) => x.kind === 'assigned' && /Issued Day One/.test(x.summary))).toBe(true)
    expect(await equipment.holderOf(admin, a.id)).toMatchObject({ name: 'Issued Day One' })
  })

  it('refuses two holders at registration as well as on edit', async () => {
    const e = await makeEmployee()
    await expect(assets.createAsset(admin, {
      companyId: COMPANY, siteId: SITE, name: 'Two holders', category: 'ladder',
      serialNumber: `SN-TWO-${Math.random().toString(36).slice(2, 7)}`,
      owner: 'ITest Admin', frequency: 'monthly',
      assignedEmployeeId: e.id, assignedContractorWorkerId: 'someone',
    } as never)).rejects.toThrow(/held by one person/i)
  })

  // -- Current permit -------------------------------------------------------

  it('reports the live permit an item is booked onto', async () => {
    const p = await approvedPermit()
    const a = await newAsset()
    await calibrate(a.id)
    await equipment.addToPermit(admin, p.id, a.id, 'Monitoring')

    // Approved is not live: the item is committed, not in use.
    expect(await equipment.currentPermit(admin, a.id)).toBeNull()

    await permits.activate(officer, p.id)
    const current = await equipment.currentPermit(admin, a.id)
    expect(current).toMatchObject({ code: p.code, status: 'active', purpose: 'Monitoring' })
  })

  it('stops reporting a permit once it is no longer live', async () => {
    const p = await approvedPermit()
    const a = await newAsset()
    await calibrate(a.id)
    await equipment.addToPermit(admin, p.id, a.id, 'Monitoring')
    await permits.activate(officer, p.id)
    expect(await equipment.currentPermit(admin, a.id)).not.toBeNull()

    await db.permit.update({ where: { id: p.id }, data: { status: 'closed' } })
    // Equipment on a permit that closed last week is not in use, and saying it is keeps a
    // usable detector on the shelf all week.
    expect(await equipment.currentPermit(admin, a.id)).toBeNull()
  })

  it('counts equipment booked to a live permit on the board, once per item', async () => {
    const p = await approvedPermit()
    const a = await newAsset()
    await calibrate(a.id)
    await equipment.addToPermit(admin, p.id, a.id, 'Monitoring')
    await permits.activate(officer, p.id)

    const s = await equipment.dashboard(admin, COMPANY)
    expect(s.bookedToPermit).toBe(1)
  })

  it('lists the newest equipment and the work orders coming due', async () => {
    const a = await newAsset({ name: 'Newest item' })
    await equipment.raiseWorkOrder(admin, a.id, {
      kind: 'preventive', description: 'Six monthly', dueAt: isoDays(5),
    })
    await equipment.raiseWorkOrder(admin, a.id, {
      kind: 'preventive', description: 'Already late', dueAt: isoDays(-5),
    })

    const s = await equipment.dashboard(admin, COMPANY)
    expect(s.newest[0].name).toBe('Newest item')
    // Upcoming means still ahead of you; the overdue one has its own tile.
    expect(s.upcomingWorkOrders).toHaveLength(1)
    expect(s.upcomingWorkOrders[0].description).toBe('Six monthly')
  })
})
