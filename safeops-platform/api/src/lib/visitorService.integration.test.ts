import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { VisitorService, checkInBlockers, overdueBy, normalise } from './visitorService.js'
import type { Caller } from './incidentService.js'

/**
 * Integration tests against a REAL PostgreSQL database.
 *
 * The subject is the gate. This register exists to answer one question at 3am with the
 * alarm sounding - who is inside the fence - so the tests are mostly about the ways that
 * answer can go wrong: somebody counted twice, somebody checked out who never arrived,
 * somebody refused entry who walked in anyway, and somebody still inside who is not
 * flagged as overdue.
 *
 * Requires a database: `npm run db:start && npm run prisma:migrate`.
 * Skipped automatically when DATABASE_URL is absent so CI without a DB stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const visitors = new VisitorService(db)

// Unique to this suite. Vitest runs files in parallel and a shared company id means two
// suites delete each other's rows.
const COMPANY = 'vis-itest-co'
const SITE = 'vis-itest-site'

const role = (r: string, id: string): Caller => ({
  userId: `vis-${id}`, name: `ITest ${id}`,
  roles: [{ companyId: COMPANY, role: r as never, siteIds: [] }],
})

const admin = role('admin', 'Admin')
const hse = role('hse_manager', 'HSE')
const officer = role('safety_officer', 'Officer')
const employee = role('employee', 'Employee')

const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600_000)
const iso = (h: number) => hoursFromNow(h).toISOString()

let seq = 0
async function newVisit(over: Record<string, unknown> = {}) {
  seq += 1
  return visitors.create(admin, {
    companyId: COMPANY, siteId: SITE,
    name: `Visitor ${seq}`, idNumber: `IC-${seq}-${Math.random().toString(36).slice(2, 7)}`,
    visitorCompany: 'Acme Engineering',
    expectedArrival: iso(1), expectedDeparture: iso(5),
    ...over,
  } as never)
}

/** Everything the gate demands, short of the check-in itself. */
async function satisfyGate(id: string) {
  for (const key of ['inductionAt', 'ndaAt', 'safetyBriefingAt', 'emergencyProcedureAt', 'siteRulesAt'] as const) {
    await visitors.acknowledge(admin, id, key)
  }
}

async function purge() {
  await db.visitorEvent.deleteMany({ where: { visitor: { companyId: COMPANY } } })
  await db.visitorDocument.deleteMany({ where: { visitor: { companyId: COMPANY } } })
  await db.visitor.deleteMany({ where: { companyId: COMPANY } })
  await db.visitorBlacklist.deleteMany({ where: { companyId: COMPANY } })
  await db.employee.deleteMany({ where: { companyId: COMPANY } })
  await db.notification.deleteMany({ where: { companyId: COMPANY } })
  await db.adminAuditEntry.deleteMany({ where: { companyId: COMPANY } })
}

d('Visitors — integration (real Postgres)', () => {
  beforeAll(async () => {
    await db.company.upsert({
      where: { id: COMPANY }, update: {}, create: { id: COMPANY, name: 'Visitor ITest Co' },
    })
    await db.site.upsert({
      where: { id: SITE }, update: {},
      create: { id: SITE, companyId: COMPANY, name: 'Visitor Site', short: 'VIS', city: 'Bintulu' },
    })
  })

  afterAll(async () => {
    await purge()
    await db.company.deleteMany({ where: { id: COMPANY } })
    await db.counter.deleteMany({ where: { companyId: COMPANY } })
    await db.$disconnect()
  })

  beforeEach(purge)

  // ── Register ─────────────────────────────────────────────────────────────

  it('registers a visit with a per-tenant reference and its own pass key', async () => {
    const v = await newVisit()
    expect(v.code).toMatch(/^VIS-\d+$/)
    expect(v.status).toBe('pre_registered')
    // The pass payload is separate from the code, so a pass can be reissued without
    // renumbering the visit.
    expect(v.passKey).not.toBe(v.code)
    expect(v.passKey.length).toBeGreaterThan(20)
  })

  it('refuses a visit that ends before it starts', async () => {
    await expect(newVisit({ expectedArrival: iso(6), expectedDeparture: iso(2) }))
      .rejects.toThrow(/must end after it starts/i)
  })

  it('refuses a visit with no name or no ID number', async () => {
    await expect(newVisit({ name: '  ' })).rejects.toThrow(/name is required/i)
    await expect(newVisit({ idNumber: '' })).rejects.toThrow(/IC or passport/i)
  })

  it('refuses a site from another workspace', async () => {
    await expect(newVisit({ siteId: 'not-our-site' })).rejects.toThrow(/Unknown site/i)
  })

  it('refuses registration to a role that may not', async () => {
    await expect(visitors.create(employee, {
      companyId: COMPANY, siteId: SITE, name: 'X', idNumber: 'IC-X',
      expectedArrival: iso(1), expectedDeparture: iso(2),
    } as never)).rejects.toMatchObject({ status: 403 })
  })

  it('keeps the host name as text so a host leaving does not erase who signed them in', async () => {
    const host = await db.employee.create({
      data: {
        companyId: COMPANY, siteId: SITE,
        employeeNo: `EMP-V-${Math.random().toString(36).slice(2, 8)}`,
        name: 'Hosting Manager',
      },
    })
    const v = await newVisit({ hostEmployeeId: host.id })
    expect(v.hostNameAtBooking).toBe('Hosting Manager')

    await db.employee.delete({ where: { id: host.id } })
    const after = await db.visitor.findUnique({ where: { id: v.id } })
    // SetNull on the foreign key, but the name stays.
    expect(after?.hostEmployeeId).toBeNull()
    expect(after?.hostNameAtBooking).toBe('Hosting Manager')
  })

  it('refuses an inactive host', async () => {
    const host = await db.employee.create({
      data: {
        companyId: COMPANY, siteId: SITE,
        employeeNo: `EMP-V-${Math.random().toString(36).slice(2, 8)}`,
        name: 'Gone', active: false,
      },
    })
    await expect(newVisit({ hostEmployeeId: host.id })).rejects.toThrow(/no longer active/i)
  })

  // ── Blacklist ────────────────────────────────────────────────────────────

  it('refuses a blacklisted ID at pre-registration and records the attempt', async () => {
    await visitors.addToBlacklist(hse, COMPANY, {
      idNumber: 'IC-BANNED-1', reason: 'Removed from site for tampering with an isolation.',
    })
    const v = await newVisit({ idNumber: 'IC-BANNED-1' })

    // Recorded, not silently dropped: the attempt is what security needs to see.
    expect(v.status).toBe('blacklisted')
    expect(v.deniedReason).toMatch(/tampering/)

    const events = await db.visitorEvent.findMany({ where: { visitorId: v.id } })
    expect(events.some((e) => e.kind === 'blacklisted')).toBe(true)

    const notes = await db.notification.findMany({ where: { companyId: COMPANY } })
    expect(notes.some((n) => /Blacklisted visitor/.test(n.title))).toBe(true)
  })

  it('matches a blacklist entry through spacing and case', async () => {
    await visitors.addToBlacklist(hse, COMPANY, {
      vehicleNumber: 'QAB 1234', reason: 'Unroadworthy.',
    })
    // "qab-1234" is the same truck as "QAB 1234", and a register that cannot see that is
    // a register that lets it through.
    const v = await newVisit({ vehicleNumber: 'qab-1234' })
    expect(v.status).toBe('blacklisted')
  })

  it('ignores a lapsed blacklist entry', async () => {
    const row = await visitors.addToBlacklist(hse, COMPANY, {
      idNumber: 'IC-LAPSED', reason: 'Six month ban.', expiresAt: iso(2),
    })
    await db.visitorBlacklist.update({
      where: { id: row.id }, data: { expiresAt: hoursFromNow(-1) },
    })
    const v = await newVisit({ idNumber: 'IC-LAPSED' })
    expect(v.status).toBe('pre_registered')
  })

  it('ignores a lifted blacklist entry but keeps the record of it', async () => {
    const row = await visitors.addToBlacklist(hse, COMPANY, {
      phone: '+60 12 345 6789', reason: 'Abusive to reception.',
    })
    await visitors.liftBlacklist(hse, row.id)

    const v = await newVisit({ phone: '+60123456789' })
    expect(v.status).toBe('pre_registered')

    // Lifted, not deleted: having been refused outlives the ban.
    const still = await db.visitorBlacklist.findUnique({ where: { id: row.id } })
    expect(still).not.toBeNull()
    expect(still?.active).toBe(false)
  })

  it('refuses a blacklist entry with nothing to match on, or no reason', async () => {
    await expect(visitors.addToBlacklist(hse, COMPANY, { reason: 'Because.' }))
      .rejects.toThrow(/at least one of/i)
    await expect(visitors.addToBlacklist(hse, COMPANY, { idNumber: 'X', reason: '  ' }))
      .rejects.toThrow(/say why/i)
  })

  it('refuses an expiry in the past, which would lapse the moment it took effect', async () => {
    await expect(visitors.addToBlacklist(hse, COMPANY, {
      idNumber: 'X', reason: 'Test', expiresAt: iso(-5),
    })).rejects.toThrow(/lapse in the same moment/i)
  })

  it('refuses blacklisting to a safety officer, because refusing entry is a management act', async () => {
    await expect(visitors.addToBlacklist(officer, COMPANY, { idNumber: 'X', reason: 'Test' }))
      .rejects.toMatchObject({ status: 403 })
  })

  it('turns a visitor away at the gate who was blacklisted after booking', async () => {
    const v = await newVisit({ idNumber: 'IC-LATE-BAN' })
    await satisfyGate(v.id)

    // Booked clean, banned overnight. The gate is the last point at which that matters.
    await visitors.addToBlacklist(hse, COMPANY, {
      idNumber: 'IC-LATE-BAN', reason: 'Banned after the booking was made.',
    })

    await expect(visitors.checkIn(admin, v.id)).rejects.toThrow(/Entry refused/i)

    const after = await db.visitor.findUnique({ where: { id: v.id } })
    expect(after?.status).toBe('blacklisted')
    expect(after?.checkedInAt).toBeNull()
  })

  it('refuses a blacklisted vehicle even when the driver is fine', async () => {
    const v = await newVisit()
    await visitors.addToBlacklist(hse, COMPANY, {
      vehicleNumber: 'BAD-TRUCK-1', reason: 'No valid PUSPAKOM inspection.',
    })
    await expect(visitors.setVehicle(admin, v.id, 'BAD-TRUCK-1'))
      .rejects.toThrow(/refused entry/i)
  })

  // ── Host approval ────────────────────────────────────────────────────────

  it('records who approved, and lets a manager decide when the host cannot', async () => {
    const host = await db.employee.create({
      data: {
        companyId: COMPANY, siteId: SITE,
        employeeNo: `EMP-V-${Math.random().toString(36).slice(2, 8)}`,
        name: 'Absent Host',
      },
    })
    const v = await newVisit({ hostEmployeeId: host.id })

    const after = await visitors.decide(hse, v.id, true, 'Host on leave; approved by HSE.')
    expect(after.approvedBy).toBe(hse.name)
    expect(after.approvedAt).not.toBeNull()
  })

  it('refuses a decision from somebody who is neither the host nor a manager', async () => {
    const v = await newVisit()
    await expect(visitors.decide(employee, v.id, true)).rejects.toMatchObject({ status: 403 })
  })

  it('demands a reason when a visit is refused', async () => {
    const v = await newVisit()
    await expect(visitors.decide(hse, v.id, false)).rejects.toThrow(/say why/i)
  })

  it('denies the visit and notifies when the host refuses', async () => {
    const v = await newVisit()
    const after = await visitors.decide(hse, v.id, false, 'No longer required.')
    expect(after.status).toBe('denied')
    expect(after.deniedReason).toBe('No longer required.')

    const notes = await db.notification.findMany({ where: { companyId: COMPANY } })
    expect(notes.some((n) => /refused/i.test(n.title))).toBe(true)
  })

  it('clears the opposite decision when it is reversed', async () => {
    const v = await newVisit()
    await visitors.decide(hse, v.id, false, 'Refused first.')
    const after = await visitors.decide(hse, v.id, true, 'Reinstated.')
    // Otherwise the record would show both an approval and a refusal standing at once.
    expect(after.approvedAt).not.toBeNull()
    expect(after.rejectedAt).toBeNull()
  })

  // ── Site rules ───────────────────────────────────────────────────────────

  it('holds the gate until every acknowledgement is recorded', async () => {
    const v = await newVisit()
    const before = await visitors.gateStatus(admin, v.id)
    expect(before.blockers).toHaveLength(5)
    expect(before.blockers[0]).toMatch(/induction/i)

    await satisfyGate(v.id)
    expect((await visitors.gateStatus(admin, v.id)).blockers).toEqual([])
  })

  it('records when each acknowledgement was given, not merely that it was', async () => {
    const v = await newVisit()
    await visitors.acknowledge(admin, v.id, 'emergencyProcedureAt')
    const row = await db.visitor.findUnique({ where: { id: v.id } })
    // "When did they get the emergency briefing" is the question after an evacuation.
    expect(row?.emergencyProcedureAt).toBeInstanceOf(Date)
  })

  it('does not move the timestamp when an acknowledgement is recorded twice', async () => {
    const v = await newVisit()
    await visitors.acknowledge(admin, v.id, 'ndaAt')
    const first = (await db.visitor.findUnique({ where: { id: v.id } }))?.ndaAt
    await visitors.acknowledge(admin, v.id, 'ndaAt')
    const second = (await db.visitor.findUnique({ where: { id: v.id } }))?.ndaAt
    expect(second?.getTime()).toBe(first?.getTime())
  })

  it('holds the gate until the host has approved, when a host is named', async () => {
    const host = await db.employee.create({
      data: {
        companyId: COMPANY, siteId: SITE,
        employeeNo: `EMP-V-${Math.random().toString(36).slice(2, 8)}`,
        name: 'Waiting Host',
      },
    })
    const v = await newVisit({ hostEmployeeId: host.id })
    await satisfyGate(v.id)

    const blocked = await visitors.gateStatus(admin, v.id)
    expect(blocked.blockers.some((b) => /host has not approved/i.test(b))).toBe(true)
    await expect(visitors.checkIn(admin, v.id)).rejects.toThrow(/host has not approved/i)

    await visitors.decide(hse, v.id, true)
    expect((await visitors.gateStatus(admin, v.id)).blockers).toEqual([])
  })

  // ── The gate ─────────────────────────────────────────────────────────────

  it('checks a visitor in and puts them on site', async () => {
    const v = await newVisit()
    await satisfyGate(v.id)
    const after = await visitors.checkIn(admin, v.id, { badgeNumber: 'B-101' })

    expect(after.status).toBe('on_site')
    expect(after.checkedInAt).not.toBeNull()
    expect(after.badgeNumber).toBe('B-101')
  })

  it('refuses a second check-in, because the count of who is inside depends on it', async () => {
    const v = await newVisit()
    await satisfyGate(v.id)
    await visitors.checkIn(admin, v.id)
    await expect(visitors.checkIn(admin, v.id)).rejects.toThrow(/already checked in/i)
  })

  it('refuses a check-out for somebody who never arrived', async () => {
    const v = await newVisit()
    await satisfyGate(v.id)
    // Otherwise a visit that never happened reads as a completed one.
    await expect(visitors.checkOut(admin, v.id)).rejects.toThrow(/has not been checked in/i)
  })

  it('refuses a second check-out', async () => {
    const v = await newVisit()
    await satisfyGate(v.id)
    await visitors.checkIn(admin, v.id)
    await visitors.checkOut(admin, v.id)
    await expect(visitors.checkOut(admin, v.id)).rejects.toThrow(/already checked out/i)
  })

  it('answers every mutation with the derived view, not a bare database row', async () => {
    const v = await newVisit()
    await satisfyGate(v.id)
    const after = await visitors.checkIn(admin, v.id, { badgeNumber: 'B-VIEW' })

    // A mutation that returns a raw row makes the typed client a lie, and forces a second
    // round trip before anything can be rendered.
    expect(after.statusLabel).toBe('On site')
    expect(after.onSite).toBe(true)
    expect(after.outstanding).toEqual([])
    expect(after.acknowledgements).toHaveLength(5)

    const out = await visitors.checkOut(admin, v.id)
    expect(out.durationLabel).not.toBeNull()
    expect(out.statusLabel).toBe('Checked out')
  })

  it('works out the duration on the way out', async () => {
    const v = await newVisit()
    await satisfyGate(v.id)
    await visitors.checkIn(admin, v.id)
    await db.visitor.update({
      where: { id: v.id }, data: { checkedInAt: hoursFromNow(-2) },
    })
    await visitors.checkOut(admin, v.id)

    const view = await visitors.get(admin, v.id)
    expect(view.durationMinutes).toBeGreaterThanOrEqual(119)
    expect(view.durationLabel).toMatch(/^2h/)
  })

  it('refuses to hand out a badge that is already with somebody inside', async () => {
    const a = await newVisit()
    await satisfyGate(a.id)
    await visitors.checkIn(admin, a.id, { badgeNumber: 'B-777' })

    const b = await newVisit()
    await satisfyGate(b.id)
    // The badge is how a sweep team knows who they have accounted for.
    await expect(visitors.checkIn(admin, b.id, { badgeNumber: 'B-777' }))
      .rejects.toThrow(/already with/i)
  })

  it('frees the badge once its holder leaves', async () => {
    const a = await newVisit()
    await satisfyGate(a.id)
    await visitors.checkIn(admin, a.id, { badgeNumber: 'B-778' })
    await visitors.checkOut(admin, a.id)

    const b = await newVisit()
    await satisfyGate(b.id)
    const after = await visitors.checkIn(admin, b.id, { badgeNumber: 'B-778' })
    expect(after.badgeNumber).toBe('B-778')
  })

  it('raises a notification when a badge is not returned', async () => {
    const v = await newVisit()
    await satisfyGate(v.id)
    await visitors.checkIn(admin, v.id, { badgeNumber: 'B-909' })
    await db.notification.deleteMany({ where: { companyId: COMPANY } })

    await visitors.checkOut(admin, v.id, { badgeReturned: false })
    const notes = await db.notification.findMany({ where: { companyId: COMPANY } })
    expect(notes.some((n) => /Badge not returned/.test(n.title))).toBe(true)
  })

  it('notifies when a visitor arrives', async () => {
    const v = await newVisit()
    await satisfyGate(v.id)
    await db.notification.deleteMany({ where: { companyId: COMPANY } })
    await visitors.checkIn(admin, v.id)

    const notes = await db.notification.findMany({ where: { companyId: COMPANY } })
    expect(notes.some((n) => /Visitor arrived/.test(n.title))).toBe(true)
  })

  it('refuses the gate to a role that may not work it', async () => {
    const v = await newVisit()
    await expect(visitors.checkIn(employee, v.id)).rejects.toMatchObject({ status: 403 })
  })

  it('refuses to cancel a visit for somebody who is still inside', async () => {
    const v = await newVisit()
    await satisfyGate(v.id)
    await visitors.checkIn(admin, v.id)
    await expect(visitors.cancel(admin, v.id, 'Changed plans'))
      .rejects.toThrow(/on site/i)
  })

  // ── Derived values ───────────────────────────────────────────────────────

  it('reports a visitor as overdue only while they are inside', () => {
    const past = { status: 'on_site' as const, expectedDeparture: hoursFromNow(-2) }
    expect(overdueBy(past)).toBeGreaterThan(110)

    // Somebody who left is not overdue, however late they were.
    expect(overdueBy({ status: 'checked_out', expectedDeparture: hoursFromNow(-2) })).toBeNull()
    expect(overdueBy({ status: 'on_site', expectedDeparture: hoursFromNow(2) })).toBeNull()
  })

  it('is a pure function of the facts, so the screen and the gate cannot disagree', () => {
    const facts = {
      status: 'pre_registered' as const, expectedDeparture: hoursFromNow(4),
      checkedInAt: null, inductionAt: new Date(), ndaAt: null,
      safetyBriefingAt: null, emergencyProcedureAt: null, siteRulesAt: null,
      approvedAt: null, hostEmployeeId: null,
    }
    expect(checkInBlockers(facts)).toEqual(checkInBlockers(facts))
    expect(checkInBlockers(facts)).toHaveLength(4)
  })

  it('normalises spacing and case the same way everywhere', () => {
    expect(normalise('QAB 1234')).toBe(normalise('qab-1234'))
    expect(normalise(null)).toBe('')
  })

  // ── Timeline ─────────────────────────────────────────────────────────────

  it('records the whole visit in one history, newest first', async () => {
    const v = await newVisit()
    await visitors.decide(hse, v.id, true, 'Fine.')
    await satisfyGate(v.id)
    await visitors.checkIn(admin, v.id, { badgeNumber: 'B-1' })
    await visitors.addNote(admin, v.id, 'Escorted to the meeting room.')
    await visitors.checkOut(admin, v.id)

    const kinds = (await visitors.timeline(admin, v.id)).map((e) => e.kind)
    expect(kinds[0]).toBe('checked_out')
    for (const k of ['created', 'approved', 'acknowledgement', 'checked_in', 'badge_issued', 'note_added']) {
      expect(kinds).toContain(k)
    }
  })

  it('records who did it and in what role', async () => {
    const v = await newVisit()
    const [latest] = await visitors.timeline(admin, v.id)
    expect(latest.actor).toBe(admin.name)
    expect(latest.actorRole).toBe('admin')
  })

  // ── The board ────────────────────────────────────────────────────────────

  it('counts who is inside, and counts vehicles rather than visitors with vehicles', async () => {
    const a = await newVisit({ vehicleNumber: 'VAN-1' })
    const b = await newVisit({ vehicleNumber: 'van 1' })   // same van, four people
    const c = await newVisit({ vehicleNumber: 'CAR-2' })
    for (const v of [a, b, c]) {
      await satisfyGate(v.id)
      await visitors.checkIn(admin, v.id)
    }

    const board = await visitors.dashboard(admin, COMPANY)
    expect(board.onSite).toBe(3)
    expect(board.vehiclesOnSite).toBe(2)
    expect(board.checkedInToday).toBe(3)
  })

  it('lists who is inside in arrival order, which is how a roll call is read', async () => {
    const a = await newVisit({ name: 'First In' })
    const b = await newVisit({ name: 'Second In' })
    for (const v of [a, b]) {
      await satisfyGate(v.id)
      await visitors.checkIn(admin, v.id)
    }
    const board = await visitors.dashboard(admin, COMPANY)
    expect(board.onSiteList.map((r) => r.name)).toEqual(['First In', 'Second In'])
  })

  it('counts overdue visitors, and stops counting them once they leave', async () => {
    const v = await newVisit()
    await satisfyGate(v.id)
    await visitors.checkIn(admin, v.id)
    await db.visitor.update({
      where: { id: v.id }, data: { expectedDeparture: hoursFromNow(-1) },
    })

    expect((await visitors.dashboard(admin, COMPANY)).overdue).toBe(1)
    await visitors.checkOut(admin, v.id)
    expect((await visitors.dashboard(admin, COMPANY)).overdue).toBe(0)
  })

  it('breaks down who is inside by their company', async () => {
    const a = await newVisit({ visitorCompany: 'Acme Engineering' })
    const b = await newVisit({ visitorCompany: 'Acme Engineering' })
    const c = await newVisit({ visitorCompany: '' })
    for (const v of [a, b, c]) {
      await satisfyGate(v.id)
      await visitors.checkIn(admin, v.id)
    }
    const board = await visitors.dashboard(admin, COMPANY)
    expect(board.byCompany[0]).toEqual({ name: 'Acme Engineering', value: 2 })
    // Blank is stated rather than dropped: an unattributed person is still inside.
    expect(board.byCompany.some((r) => r.name === 'Not stated' && r.value === 1)).toBe(true)
  })

  it('refuses the board to somebody outside the workspace', async () => {
    const outsider: Caller = {
      userId: 'vis-outsider', name: 'Outsider',
      roles: [{ companyId: 'some-other-co', role: 'admin' as never, siteIds: [] }],
    }
    await expect(visitors.dashboard(outsider, COMPANY)).rejects.toMatchObject({ status: 403 })
  })

  // ── Reads ────────────────────────────────────────────────────────────────

  it('resolves a scanned pass, and refuses one from another workspace', async () => {
    const v = await newVisit()
    const byPass = await visitors.byPassKey(admin, v.passKey)
    expect(byPass.code).toBe(v.code)

    const outsider: Caller = {
      userId: 'vis-outsider-2', name: 'Outsider',
      roles: [{ companyId: 'some-other-co', role: 'admin' as never, siteIds: [] }],
    }
    await expect(visitors.byPassKey(outsider, v.passKey)).rejects.toMatchObject({ status: 403 })
  })

  it('refuses an unrecognised pass', async () => {
    await expect(visitors.byPassKey(admin, 'not-a-real-pass')).rejects.toMatchObject({ status: 404 })
  })

  it('finds a visit by name, ID, company, vehicle, badge and host', async () => {
    const v = await newVisit({
      name: 'Findable Person', idNumber: 'IC-FIND-1',
      visitorCompany: 'Findable Sdn Bhd', vehicleNumber: 'FIND-1',
    })
    await satisfyGate(v.id)
    await visitors.checkIn(admin, v.id, { badgeNumber: 'B-FIND' })

    for (const q of ['Findable Person', 'IC-FIND-1', 'Findable Sdn', 'FIND-1', 'B-FIND', v.code]) {
      const found = await visitors.list(admin, COMPANY, { q })
      expect(found.rows.some((r) => r.id === v.id), `searching for ${q}`).toBe(true)
    }
  })

  it('filters to who is on site, and to who is overdue', async () => {
    const inside = await newVisit()
    await satisfyGate(inside.id)
    await visitors.checkIn(admin, inside.id)
    await newVisit()   // still pre-registered

    expect((await visitors.list(admin, COMPANY, { status: 'on_site' })).total).toBe(1)
    expect((await visitors.list(admin, COMPANY, { status: 'overdue' })).total).toBe(0)

    await db.visitor.update({
      where: { id: inside.id }, data: { expectedDeparture: hoursFromNow(-1) },
    })
    expect((await visitors.list(admin, COMPANY, { status: 'overdue' })).total).toBe(1)
  })

  it('writes an audit entry for everything that happens at the gate', async () => {
    const v = await newVisit()
    await satisfyGate(v.id)
    await visitors.checkIn(admin, v.id)
    await visitors.checkOut(admin, v.id)

    const entries = await db.adminAuditEntry.findMany({
      where: { companyId: COMPANY, module: 'visitors' },
    })
    expect(entries.some((e) => e.action === 'Visitor checked in')).toBe(true)
    expect(entries.some((e) => e.action === 'Visitor checked out')).toBe(true)
    expect(entries.every((e) => e.actor === admin.name)).toBe(true)
  })
})
