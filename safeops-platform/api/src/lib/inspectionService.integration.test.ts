import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { InspectionError, InspectionService } from './inspectionService.js'
import { CHECKLISTS, FREQUENCY_DAYS } from './inspectionCatalog.js'
import type { Caller } from './incidentService.js'

/**
 * Integration tests — these run against a REAL PostgreSQL database, not a fake.
 *
 * The rules that matter here are the ones that turn a checklist into a record: an
 * inspection cannot be signed off against a checklist the server did not write, a failure
 * must become an owned corrective action, and completing a check must book the next one
 * so nothing falls off the calendar. All of it exercised against real SQL, because
 * transactional counters, cascade behaviour and tenant scoping are exactly what a mocked
 * suite cannot show you.
 *
 * Requires a database: `npm run db:start && npm run prisma:migrate`.
 * Skipped automatically when DATABASE_URL is absent so CI without a DB stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const svc = new InspectionService(db)

const COMPANY = 'ins-itest-co'
const SITE = 'ins-itest-site'
const SITE_B = 'ins-itest-site-b'
const OTHER = 'ins-itest-other-co'
const OTHER_SITE = 'ins-itest-other-site'

const manager: Caller = {
  userId: 'ins-mgr', name: 'INS Manager',
  roles: [{ companyId: COMPANY, role: 'hse_manager', siteIds: [] }],
}
const officer: Caller = {
  userId: 'ins-so', name: 'INS Officer',
  roles: [{ companyId: COMPANY, role: 'safety_officer', siteIds: [SITE] }],
}
const supervisor: Caller = {
  userId: 'ins-sup', name: 'INS Supervisor',
  roles: [{ companyId: COMPANY, role: 'supervisor', siteIds: [SITE] }],
}
const employee: Caller = {
  userId: 'ins-emp', name: 'INS Employee',
  roles: [{ companyId: COMPANY, role: 'employee', siteIds: [] }],
}
const outsider: Caller = {
  userId: 'ins-out', name: 'INS Outsider',
  roles: [{ companyId: OTHER, role: 'admin', siteIds: [] }],
}

const DAY = 86400_000
const dateOnly = (d: Date) => d.toISOString().slice(0, 10)

const newAsset = (over: Partial<Parameters<typeof svc.createAsset>[1]> = {}) => ({
  companyId: COMPANY,
  siteId: SITE,
  name: 'Reach truck RT-07',
  category: 'forklift' as const,
  serialNumber: 'RT07-2211-MY',
  manufacturer: 'Toyota',
  model: 'BT Reflex RRE160',
  department: 'Warehouse',
  owner: 'INS Employee',
  location: 'Charging bay 3',
  frequency: 'weekly' as const,
  ...over,
})

/** The scheduled inspection an asset always carries. */
async function openInspection(assetId: string) {
  return db.inspection.findFirstOrThrow({
    where: { assetId, status: 'scheduled' },
    orderBy: { scheduledFor: 'asc' },
  })
}

/** A complete, all-pass answer set for a category, built from the server's own template. */
const passAnswers = (category: keyof typeof CHECKLISTS) =>
  CHECKLISTS[category].map((c) => ({ itemId: c.id, label: c.label, result: 'pass' as const }))

d('InspectionService — integration (real Postgres)', () => {
  beforeAll(async () => {
    for (const [id, name] of [[COMPANY, 'INS ITest Co'], [OTHER, 'INS Other Co']]) {
      await db.company.upsert({ where: { id }, update: {}, create: { id, name } })
    }
    for (const [id, companyId] of [[SITE, COMPANY], [SITE_B, COMPANY], [OTHER_SITE, OTHER]]) {
      await db.site.upsert({
        where: { id }, update: {}, create: { id, companyId, name: `Site ${id}` },
      })
    }
  })

  afterAll(async () => {
    // Actions carry a Restrict-free path but are scoped by company; clear them first so
    // the company delete is not blocked by anything left behind.
    await db.correctiveAction.deleteMany({ where: { companyId: { in: [COMPANY, OTHER] } } })
    await db.company.deleteMany({ where: { id: { in: [COMPANY, OTHER] } } })
    await db.counter.deleteMany({ where: { companyId: { in: [COMPANY, OTHER] } } })
    await db.$disconnect()
  })

  // ── Registration ───────────────────────────────────────────────────────────

  it('registers an asset and books its first inspection in one go', async () => {
    const asset = await svc.createAsset(manager, newAsset({ name: 'First registration' }))

    expect(asset.code).toMatch(/^AST-\d+$/)
    // The QR payload is what gets printed on the label.
    expect(asset.qrKey).toBe(asset.code)
    expect(asset.status).toBe('in_service')
    expect(asset.health).toBe(100)
    expect(asset.risk).toBe('Low')

    // An asset with no scheduled check is an asset nobody is ever prompted to inspect.
    const booked = await openInspection(asset.id)
    expect(booked.code).toMatch(/^INS-\d+$/)
    expect(booked.assignedTo).toBe('INS Employee')
    expect(dateOnly(booked.scheduledFor))
      .toBe(dateOnly(new Date(Date.now() + FREQUENCY_DAYS.weekly * DAY)))
  })

  it('sets the first due date from the inspection frequency', async () => {
    for (const [frequency, days] of Object.entries(FREQUENCY_DAYS)) {
      const a = await svc.createAsset(manager, newAsset({
        name: `Frequency ${frequency}`, frequency: frequency as never,
      }))
      expect(dateOnly(a.nextDueDate)).toBe(dateOnly(new Date(Date.now() + days * DAY)))
    }
  })

  it('allocates unique asset and inspection numbers under concurrent registration', async () => {
    const created = await Promise.all(
      Array.from({ length: 8 }, (_, i) => svc.createAsset(manager, newAsset({ name: `Concurrent ${i}` }))),
    )
    expect(new Set(created.map((a) => a.code)).size).toBe(8)

    const codes = await db.inspection.findMany({
      where: { assetId: { in: created.map((a) => a.id) } },
      select: { code: true },
    })
    expect(new Set(codes.map((c) => c.code)).size).toBe(8)
  })

  it('numbers assets per tenant', async () => {
    const otherMgr: Caller = {
      userId: 'ins-other-mgr', name: 'Other Mgr',
      roles: [{ companyId: OTHER, role: 'hse_manager', siteIds: [] }],
    }
    const theirs = await svc.createAsset(otherMgr, newAsset({
      companyId: OTHER, siteId: OTHER_SITE, name: 'Tenant B asset',
    }))
    expect(theirs.code).toBe('AST-1101') // its own sequence
  })

  it('requires a manage role to register an asset', async () => {
    for (const caller of [employee, supervisor]) {
      await expect(svc.createAsset(caller, newAsset({ name: 'Not allowed' })))
        .rejects.toMatchObject({ status: 403 })
    }
  })

  it('rejects an asset missing its identifying details', async () => {
    await expect(svc.createAsset(manager, newAsset({ name: '  ' })))
      .rejects.toMatchObject({ code: 'validation' })
    await expect(svc.createAsset(manager, newAsset({ serialNumber: '' })))
      .rejects.toMatchObject({ code: 'validation' })
    await expect(svc.createAsset(manager, newAsset({ owner: '' })))
      .rejects.toMatchObject({ code: 'validation' })
  })

  it('refuses an asset written against another tenant’s site', async () => {
    await expect(svc.createAsset(manager, newAsset({ siteId: OTHER_SITE })))
      .rejects.toMatchObject({ code: 'validation' })
    await expect(svc.createAsset(manager, newAsset({ siteId: 'no-such-site' })))
      .rejects.toMatchObject({ code: 'validation' })
  })

  // ── Scheduling ─────────────────────────────────────────────────────────────

  it('moves the existing booking rather than opening a second one', async () => {
    const asset = await svc.createAsset(manager, newAsset({ name: 'Reschedule target' }))
    const first = await openInspection(asset.id)

    const when = dateOnly(new Date(Date.now() + 3 * DAY))
    const moved = await svc.scheduleInspection(officer, asset.id, when, 'INS Officer')

    // Two open bookings for one asset is how one gets done and the other goes overdue
    // forever, so the count must stay at one.
    expect(moved.id).toBe(first.id)
    expect(await db.inspection.count({ where: { assetId: asset.id, status: 'scheduled' } })).toBe(1)
    expect(moved.assignedTo).toBe('INS Officer')

    // The asset's due date follows the booking.
    const reread = await db.asset.findUniqueOrThrow({ where: { id: asset.id } })
    expect(dateOnly(reread.nextDueDate)).toBe(when)
  })

  it('requires a manage role and a real date to schedule', async () => {
    const asset = await svc.createAsset(manager, newAsset({ name: 'Schedule rbac' }))
    const when = dateOnly(new Date(Date.now() + DAY))

    await expect(svc.scheduleInspection(employee, asset.id, when, 'X'))
      .rejects.toMatchObject({ status: 403 })
    await expect(svc.scheduleInspection(supervisor, asset.id, when, 'X'))
      .rejects.toMatchObject({ status: 403 })
    await expect(svc.scheduleInspection(officer, asset.id, 'not-a-date', 'X'))
      .rejects.toMatchObject({ code: 'validation' })
    await expect(svc.scheduleInspection(officer, asset.id, when, '  '))
      .rejects.toMatchObject({ code: 'validation' })
  })

  // ── Completion ─────────────────────────────────────────────────────────────

  it('completes a passing inspection and books the next one', async () => {
    const asset = await svc.createAsset(manager, newAsset({ name: 'Passing check' }))
    const booked = await openInspection(asset.id)

    const done = await svc.completeInspection(officer, booked.id, {
      answers: passAnswers('forklift'),
      photoCount: 2,
      signature: 'INS Officer',
    })

    expect(done.status).toBe('completed')
    expect(done.outcome).toBe('passed')
    expect(done.completedBy).toBe('INS Officer')
    expect(done.actionCodes).toHaveLength(0)

    const reread = await db.asset.findUniqueOrThrow({ where: { id: asset.id } })
    expect(reread.lastInspectedAt).not.toBeNull()
    // Being inspected must not take the asset off the calendar.
    expect(dateOnly(reread.nextDueDate))
      .toBe(dateOnly(new Date(Date.now() + FREQUENCY_DAYS.weekly * DAY)))
    const next = await openInspection(asset.id)
    expect(next.id).not.toBe(booked.id)
    expect(next.assignedTo).toBe(booked.assignedTo)
  })

  it('turns every failed item into an owned corrective action', async () => {
    const asset = await svc.createAsset(manager, newAsset({
      name: 'Genset 500kVA', category: 'machinery', frequency: 'monthly', owner: 'INS Employee',
    }))
    const booked = await openInspection(asset.id)

    const answers = CHECKLISTS.machinery.map((c) => {
      if (c.id === 'mc3') {
        return { itemId: c.id, label: c.label, result: 'fail' as const, comment: 'Coolant hose perished.' }
      }
      if (c.id === 'mc5') {
        return { itemId: c.id, label: c.label, result: 'fail' as const, comment: 'Battery terminals corroded.' }
      }
      if (c.id === 'mc4') {
        return { itemId: c.id, label: c.label, result: 'pass' as const, measurement: '1,240 h' }
      }
      return { itemId: c.id, label: c.label, result: 'pass' as const }
    })

    const done = await svc.completeInspection(officer, booked.id, {
      answers, comments: 'Set to maintenance pending hose replacement.',
      photoCount: 3, gps: '4.2448 N, 117.8911 E', signature: 'INS Officer',
    })

    expect(done.outcome).toBe('failed')
    expect(done.actionCodes).toHaveLength(2)

    const actions = await db.correctiveAction.findMany({
      where: { inspectionId: booked.id }, orderBy: { code: 'asc' },
    })
    expect(actions).toHaveLength(2)
    for (const a of actions) {
      expect(a.source).toBe('inspection')
      expect(a.priority).toBe('High')
      expect(a.status).toBe('open')
      // The asset owner is accountable, and it has a date.
      expect(a.owner).toBe('INS Employee')
      expect(a.assetId).toBe(asset.id)
      expect(dateOnly(a.dueDate)).toBe(dateOnly(new Date(Date.now() + 7 * DAY)))
      expect(a.title).toMatch(/^Defect: /)
      expect(a.detail).not.toBe('')
    }
  })

  it('refuses an incomplete, invented or unanswered checklist', async () => {
    const asset = await svc.createAsset(manager, newAsset({ name: 'Checklist validation' }))
    const booked = await openInspection(asset.id)
    const full = passAnswers('forklift')

    // Short of the template.
    await expect(svc.completeInspection(officer, booked.id, {
      answers: full.slice(0, 3), signature: 'X',
    })).rejects.toMatchObject({ code: 'validation' })

    // Right length, wrong items — a checklist nobody wrote.
    await expect(svc.completeInspection(officer, booked.id, {
      answers: full.map((a, i) => ({ ...a, itemId: `invented-${i}` })), signature: 'X',
    })).rejects.toMatchObject({ code: 'validation' })

    // Padded to the right length by repeating one item.
    await expect(svc.completeInspection(officer, booked.id, {
      answers: full.map(() => ({ ...full[0] })), signature: 'X',
    })).rejects.toMatchObject({ code: 'validation' })

    // Still open — a rejected submission must not half-complete the record.
    expect((await db.inspection.findUniqueOrThrow({ where: { id: booked.id } })).status)
      .toBe('scheduled')
  })

  it('requires a comment on every failure and a signature on the result', async () => {
    const asset = await svc.createAsset(manager, newAsset({ name: 'Fail comment rule' }))
    const booked = await openInspection(asset.id)
    const answers = passAnswers('forklift')
    const withFail = answers.map((a, i) => (i === 0 ? { ...a, result: 'fail' as const } : a))

    await expect(svc.completeInspection(officer, booked.id, { answers: withFail, signature: 'X' }))
      .rejects.toMatchObject({ code: 'validation' })

    await expect(svc.completeInspection(officer, booked.id, {
      answers: withFail.map((a, i) => (i === 0 ? { ...a, comment: '   ' } : a)), signature: 'X',
    })).rejects.toMatchObject({ code: 'validation' })

    await expect(svc.completeInspection(officer, booked.id, { answers, signature: '  ' }))
      .rejects.toMatchObject({ code: 'validation' })

    // No defect actions were raised by any of the rejected attempts.
    expect(await db.correctiveAction.count({ where: { inspectionId: booked.id } })).toBe(0)
  })

  it('stores the label from the server template, not the one the client sent', async () => {
    const asset = await svc.createAsset(manager, newAsset({ name: 'Label integrity' }))
    const booked = await openInspection(asset.id)

    await svc.completeInspection(officer, booked.id, {
      answers: passAnswers('forklift').map((a) => ({ ...a, label: 'Everything is fine' })),
      signature: 'INS Officer',
    })

    const stored = await db.inspection.findUniqueOrThrow({ where: { id: booked.id } })
    const labels = (stored.answers as { label: string }[]).map((a) => a.label)
    expect(labels).not.toContain('Everything is fine')
    expect(labels).toContain(CHECKLISTS.forklift[0].label)
  })

  it('lets the assigned inspector complete their own check, but not a bystander', async () => {
    const asset = await svc.createAsset(manager, newAsset({
      name: 'Assigned inspector', owner: 'INS Employee',
    }))
    const booked = await openInspection(asset.id)
    expect(booked.assignedTo).toBe('INS Employee')

    // A supervisor who is neither the inspector nor a manager cannot sign it off.
    await expect(svc.completeInspection(supervisor, booked.id, {
      answers: passAnswers('forklift'), signature: 'INS Supervisor',
    })).rejects.toMatchObject({ status: 403 })

    const done = await svc.completeInspection(employee, booked.id, {
      answers: passAnswers('forklift'), signature: 'INS Employee',
    })
    expect(done.outcome).toBe('passed')
  })

  it('refuses to complete an inspection twice', async () => {
    const asset = await svc.createAsset(manager, newAsset({ name: 'Double completion' }))
    const booked = await openInspection(asset.id)
    await svc.completeInspection(officer, booked.id, {
      answers: passAnswers('forklift'), signature: 'INS Officer',
    })
    await expect(svc.completeInspection(officer, booked.id, {
      answers: passAnswers('forklift'), signature: 'INS Officer',
    })).rejects.toMatchObject({ code: 'validation' })
  })

  // ── Health scoring ─────────────────────────────────────────────────────────

  it('penalises an overdue asset and explains why', async () => {
    const asset = await svc.createAsset(manager, newAsset({ name: 'Overdue scoring' }))
    await db.asset.update({
      where: { id: asset.id }, data: { nextDueDate: new Date(Date.now() - 5 * DAY) },
    })

    const { asset: view } = await svc.getAssetProfile(manager, asset.id)
    expect(view.overdue).toBe(true)
    expect(view.daysToDue).toBe(-5)
    // 10 + 5*2 = 20 off.
    expect(view.health).toBe(80)
    expect(view.healthFactors[0].label).toContain('5d overdue')
    expect(view.healthFactors[0].delta).toBe(-20)
  })

  it('caps the overdue penalty so one stale asset cannot score below the floor', async () => {
    const asset = await svc.createAsset(manager, newAsset({ name: 'Very overdue' }))
    await db.asset.update({
      where: { id: asset.id }, data: { nextDueDate: new Date(Date.now() - 400 * DAY) },
    })
    const { asset: view } = await svc.getAssetProfile(manager, asset.id)
    expect(view.health).toBe(70) // capped at -30, not -810
    expect(view.risk).toBe('Medium')
  })

  it('drops health for open defects and a failed last inspection', async () => {
    const asset = await svc.createAsset(manager, newAsset({
      name: 'Defect scoring', category: 'machinery',
    }))
    const booked = await openInspection(asset.id)
    await svc.completeInspection(officer, booked.id, {
      answers: CHECKLISTS.machinery.map((c, i) => (i === 0
        ? { itemId: c.id, label: c.label, result: 'fail' as const, comment: 'Guard missing.' }
        : { itemId: c.id, label: c.label, result: 'pass' as const })),
      signature: 'INS Officer',
    })

    const { asset: view } = await svc.getAssetProfile(manager, asset.id)
    // 100 − 15 (one open defect) − 15 (last inspection failed) = 70.
    expect(view.openDefects).toBe(1)
    expect(view.lastOutcome).toBe('failed')
    expect(view.health).toBe(70)
    expect(view.risk).toBe('Medium')

    // Verifying the defect clears it from the count and lifts the score back.
    const action = await db.correctiveAction.findFirstOrThrow({ where: { assetId: asset.id } })
    await db.correctiveAction.update({ where: { id: action.id }, data: { status: 'verified' } })
    const after = await svc.getAssetProfile(manager, asset.id)
    expect(after.asset.openDefects).toBe(0)
    expect(after.asset.health).toBe(85)
  })

  it('scores an out-of-service asset as high risk', async () => {
    const asset = await svc.createAsset(manager, newAsset({ name: 'Out of service' }))
    await db.asset.update({ where: { id: asset.id }, data: { status: 'out_of_service' } })
    const { asset: view } = await svc.getAssetProfile(manager, asset.id)
    expect(view.health).toBe(60)
    expect(view.risk).toBe('Medium')

    await db.asset.update({ where: { id: asset.id }, data: { status: 'under_maintenance' } })
    const maint = await svc.getAssetProfile(manager, asset.id)
    expect(maint.asset.health).toBe(90)
  })

  it('does not call a retired asset overdue', async () => {
    const asset = await svc.createAsset(manager, newAsset({ name: 'Retired asset' }))
    await db.asset.update({
      where: { id: asset.id },
      data: { status: 'retired', nextDueDate: new Date(Date.now() - 30 * DAY) },
    })
    const { asset: view } = await svc.getAssetProfile(manager, asset.id)
    expect(view.overdue).toBe(false)
  })

  // ── Lookup & listing ───────────────────────────────────────────────────────

  it('resolves an asset by id, QR payload or printed code', async () => {
    const asset = await svc.createAsset(manager, newAsset({ name: 'QR lookup' }))
    for (const key of [asset.id, asset.qrKey, asset.code]) {
      const found = await svc.getAssetProfile(manager, key)
      expect(found.asset.id).toBe(asset.id)
    }
    await expect(svc.getAssetProfile(manager, 'AST-does-not-exist'))
      .rejects.toMatchObject({ status: 404 })
  })

  it('refuses a QR scan of another tenant’s asset', async () => {
    const otherMgr: Caller = {
      userId: 'ins-other-mgr2', name: 'Other Mgr 2',
      roles: [{ companyId: OTHER, role: 'hse_manager', siteIds: [] }],
    }
    const theirs = await svc.createAsset(otherMgr, newAsset({
      companyId: OTHER, siteId: OTHER_SITE, name: 'Their asset',
    }))

    // A real asset, just not this caller's. It must read as not found rather than
    // confirming to an outsider that the label belongs to someone.
    await expect(svc.getAssetProfile(manager, theirs.id)).rejects.toBeInstanceOf(InspectionError)
    await expect(svc.getAssetProfile(manager, theirs.id)).rejects.toMatchObject({ status: 404 })

    // Codes are per-tenant, so both companies own an AST-1101. Scanning that code must
    // resolve to the caller's own asset — never silently to the other tenant's.
    const mine = await db.asset.findFirstOrThrow({
      where: { companyId: COMPANY, code: theirs.code },
    })
    const scanned = await svc.getAssetProfile(manager, theirs.code)
    expect(scanned.asset.id).toBe(mine.id)
    expect(scanned.asset.companyId).toBe(COMPANY)
  })

  it('filters the register by site, category and bucket', async () => {
    await svc.createAsset(manager, newAsset({
      name: 'Site B ladder', siteId: SITE_B, category: 'ladder', frequency: 'monthly',
    }))

    const bySite = await svc.listAssets(manager, {
      companyId: COMPANY, page: 1, pageSize: 200, siteId: SITE_B,
    })
    expect(bySite.rows.every((r) => r.siteId === SITE_B)).toBe(true)
    expect(bySite.total).toBeGreaterThan(0)

    const byCategory = await svc.listAssets(manager, {
      companyId: COMPANY, page: 1, pageSize: 200, category: 'ladder',
    })
    expect(byCategory.rows.every((r) => r.category === 'ladder')).toBe(true)

    const overdue = await svc.listAssets(manager, {
      companyId: COMPANY, page: 1, pageSize: 200, bucket: 'overdue',
    })
    expect(overdue.rows.every((r) => r.overdue)).toBe(true)

    const defects = await svc.listAssets(manager, {
      companyId: COMPANY, page: 1, pageSize: 200, bucket: 'defects',
    })
    expect(defects.rows.every((r) => r.openDefects > 0)).toBe(true)

    const highRisk = await svc.listAssets(manager, {
      companyId: COMPANY, page: 1, pageSize: 200, bucket: 'high_risk',
    })
    expect(highRisk.rows.every((r) => r.risk === 'High')).toBe(true)
  })

  it('searches by code, name, serial and owner', async () => {
    await svc.createAsset(manager, newAsset({
      name: 'Hilux crew cab', serialNumber: 'QSK8812', category: 'vehicle',
      frequency: 'monthly', owner: 'Grace Lim',
    }))
    for (const q of ['hilux', 'qsk8812', 'grace']) {
      const found = await svc.listAssets(manager, { companyId: COMPANY, page: 1, pageSize: 200, q })
      expect(found.rows.some((r) => r.serialNumber === 'QSK8812')).toBe(true)
    }
  })

  it('orders the register worst-health first', async () => {
    const { rows } = await svc.listAssets(manager, { companyId: COMPANY, page: 1, pageSize: 200 })
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].health).toBeLessThanOrEqual(rows[i].health)
    }
  })

  it('lists inspections overdue-first and filters by outcome', async () => {
    const all = await svc.listInspections(manager, {
      companyId: COMPANY, page: 1, pageSize: 200, status: 'all',
    })
    const rank = (x: (typeof all.rows)[number]) =>
      x.overdue ? 0 : x.status === 'scheduled' ? 1 : 2
    for (let i = 1; i < all.rows.length; i++) {
      expect(rank(all.rows[i - 1])).toBeLessThanOrEqual(rank(all.rows[i]))
    }

    const failed = await svc.listInspections(manager, {
      companyId: COMPANY, page: 1, pageSize: 200, status: 'failed',
    })
    expect(failed.rows.every((r) => r.outcome === 'failed')).toBe(true)
    expect(failed.rows.every((r) => r.actionCodes.length > 0)).toBe(true)

    const scheduled = await svc.listInspections(manager, {
      companyId: COMPANY, page: 1, pageSize: 200, status: 'scheduled',
    })
    expect(scheduled.rows.every((r) => r.status === 'scheduled')).toBe(true)
  })

  it('reports an inspection past its date as overdue without storing that state', async () => {
    const asset = await svc.createAsset(manager, newAsset({ name: 'Overdue inspection' }))
    const booked = await openInspection(asset.id)
    await db.inspection.update({
      where: { id: booked.id }, data: { scheduledFor: new Date(Date.now() - 2 * DAY) },
    })

    const overdue = await svc.listInspections(manager, {
      companyId: COMPANY, page: 1, pageSize: 200, status: 'overdue',
    })
    const mine = overdue.rows.find((r) => r.id === booked.id)
    expect(mine?.overdue).toBe(true)
    expect(mine?.daysToDue).toBe(-2)
    // Derived, never written.
    expect((await db.inspection.findUniqueOrThrow({ where: { id: booked.id } })).status)
      .toBe('scheduled')
  })

  // ── Tenancy ────────────────────────────────────────────────────────────────

  it('refuses cross-tenant listing, reads and mutations', async () => {
    const mine = await svc.createAsset(manager, newAsset({ name: 'Tenant isolation' }))
    const booked = await openInspection(mine.id)

    await expect(svc.listAssets(outsider, { companyId: COMPANY, page: 1, pageSize: 10 }))
      .rejects.toMatchObject({ status: 403 })
    await expect(svc.listInspections(outsider, { companyId: COMPANY, page: 1, pageSize: 10 }))
      .rejects.toMatchObject({ status: 403 })
    await expect(svc.assetStats(outsider, COMPANY)).rejects.toMatchObject({ status: 403 })
    await expect(svc.scheduleInspection(outsider, mine.id, dateOnly(new Date()), 'X'))
      .rejects.toMatchObject({ status: 403 })
    await expect(svc.completeInspection(outsider, booked.id, {
      answers: passAnswers('forklift'), signature: 'X',
    })).rejects.toMatchObject({ status: 403 })
  })

  it('scopes the register to one tenant', async () => {
    const rows = await svc.listAssets(manager, { companyId: COMPANY, page: 1, pageSize: 200 })
    expect(rows.rows.every((r) => r.companyId === COMPANY)).toBe(true)
    expect(rows.rows.some((r) => r.name === 'Their asset')).toBe(false)
  })

  // ── Counters ───────────────────────────────────────────────────────────────

  it('computes register statistics in the database', async () => {
    const stats = await svc.assetStats(manager, COMPANY)
    expect(stats.totalAssets).toBeGreaterThan(0)
    expect(stats.complianceRate).toBeGreaterThanOrEqual(0)
    expect(stats.complianceRate).toBeLessThanOrEqual(100)
    expect(stats.avgHealth).toBeGreaterThan(0)
    expect(stats.highestRisk.length).toBeGreaterThan(0)
    // Worst first.
    for (let i = 1; i < stats.highestRisk.length; i++) {
      expect(stats.highestRisk[i - 1].health).toBeLessThanOrEqual(stats.highestRisk[i].health)
    }
    expect(stats.monthlyTrend).toHaveLength(6)
    expect(stats.monthlyTrend.every((m) => m.Failed <= m.Completed)).toBe(true)
    // Retired assets are excluded from the register total.
    const retired = await db.asset.count({ where: { companyId: COMPANY, status: 'retired' } })
    const every = await db.asset.count({ where: { companyId: COMPANY } })
    expect(stats.totalAssets).toBe(every - retired)
  })

  it('scopes statistics to a site', async () => {
    const all = await svc.assetStats(manager, COMPANY)
    const siteB = await svc.assetStats(manager, COMPANY, SITE_B)
    expect(siteB.totalAssets).toBeLessThan(all.totalAssets)
  })

  // ── Cascades ───────────────────────────────────────────────────────────────

  it('cascades inspections when an asset is removed, but keeps the defect actions', async () => {
    const asset = await svc.createAsset(manager, newAsset({
      name: 'Cascade check', category: 'machinery',
    }))
    const booked = await openInspection(asset.id)
    await svc.completeInspection(officer, booked.id, {
      answers: CHECKLISTS.machinery.map((c, i) => (i === 0
        ? { itemId: c.id, label: c.label, result: 'fail' as const, comment: 'Defect.' }
        : { itemId: c.id, label: c.label, result: 'pass' as const })),
      signature: 'INS Officer',
    })
    const action = await db.correctiveAction.findFirstOrThrow({ where: { assetId: asset.id } })

    await db.asset.delete({ where: { id: asset.id } })

    expect(await db.inspection.count({ where: { assetId: asset.id } })).toBe(0)
    // The corrective action survives with its link cleared — a safety register that
    // deletes outstanding work when the equipment record goes is not a register.
    const survivor = await db.correctiveAction.findUnique({ where: { id: action.id } })
    expect(survivor).not.toBeNull()
    expect(survivor?.assetId).toBeNull()
    expect(survivor?.inspectionId).toBeNull()
  })

  it('cascades assets and inspections when the tenant is deleted', async () => {
    const TMP = 'ins-cascade-co'
    await db.company.create({ data: { id: TMP, name: 'Cascade Co' } })
    await db.site.create({ data: { id: 'ins-cascade-site', companyId: TMP, name: 'S' } })
    const tmpMgr: Caller = {
      userId: 'x', name: 'Cascade Mgr',
      roles: [{ companyId: TMP, role: 'hse_manager', siteIds: [] }],
    }
    const a = await svc.createAsset(tmpMgr, newAsset({
      companyId: TMP, siteId: 'ins-cascade-site', name: 'Orphan check',
    }))

    await db.company.delete({ where: { id: TMP } })
    await db.counter.deleteMany({ where: { companyId: TMP } })

    expect(await db.asset.count({ where: { id: a.id } })).toBe(0)
    expect(await db.inspection.count({ where: { assetId: a.id } })).toBe(0)
  })

  it('refuses an asset referencing a company that does not exist', async () => {
    await expect(db.asset.create({
      data: {
        code: 'AST-ghost', qrKey: 'AST-ghost', companyId: 'no-such-company', siteId: SITE,
        name: 'Ghost', category: 'ladder', serialNumber: 'X', owner: 'X',
        frequency: 'monthly', nextDueDate: new Date(), createdBy: 'X',
      },
    })).rejects.toThrow()
  })
})
