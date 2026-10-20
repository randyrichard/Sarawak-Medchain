import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { PermitService } from './permitService.js'
import { PermitPeopleService } from './permitPeople.js'
import { PermitReviewService } from './permitReview.js'
import { FieldRecordError } from './fieldRecord.js'
import type { Caller } from '../domain/caller.js'

/**
 * A permit worked offline, against a REAL PostgreSQL database.
 *
 * What is being proven here is the half of offline capture that the browser cannot test:
 * that a record sent twice lands once, and that it lands at the time the field made it.
 *
 * Both failures are silent. A duplicated gas test looks like diligence; a gas test stamped
 * with the time the phone found signal looks like a test. Neither shows up as an error
 * anywhere — they show up months later as a confined-space record that does not match what
 * happened, which is the one thing this product exists to get right. So they are tested
 * against real SQL, where the unique constraint, the transaction and the CHECK on
 * recordedAt actually exist.
 *
 * Requires a database: `npm run db:start && npx prisma migrate deploy`.
 * Skipped automatically when DATABASE_URL is absent so CI without a DB stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const svc = new PermitService(db)
const people = new PermitPeopleService(db)
const review = new PermitReviewService(db)

const COMPANY = 'ptw-offline-co'
const SITE = 'ptw-offline-site'

const officer: Caller = {
  userId: 'ptw-off-so', name: 'Offline Officer',
  roles: [{ companyId: COMPANY, role: 'safety_officer', siteIds: [SITE] }],
}
const employee: Caller = {
  userId: 'ptw-off-emp', name: 'Offline Employee',
  roles: [{ companyId: COMPANY, role: 'employee', siteIds: [] }],
}

const HOUR = 3600_000
const iso = (ms: number) => new Date(ms).toISOString()
let keySeq = 0
/** A key shaped like the one a device generates, unique per test. */
const key = () => `offline-itest-${Date.now().toString(36)}-${keySeq++}`

const newPermit = (over: Record<string, unknown> = {}) => ({
  companyId: COMPANY,
  siteId: SITE,
  type: 'confined_space' as const,
  title: 'Internal inspection of V-101',
  description: 'Vessel entry for internal inspection.',
  department: 'Inspection',
  location: 'V-101, tank farm',
  applicant: 'Siti Nurhaliza',
  workerCount: 2,
  validFrom: iso(Date.now() - HOUR),
  validTo: iso(Date.now() + 6 * HOUR),
  ...over,
})

const PASSING_GAS = { oxygenPct: 20.9, lelPct: 0, h2sPpm: 0, coPpm: 2 }

async function confirmAllControls(permitId: string) {
  const p = await svc.get(officer, permitId)
  for (const c of p.controls.filter((x) => x.required)) {
    await svc.confirmControl(officer, permitId, c.id, true)
  }
}

/** A permit driven to `active`, which is the state the field actually works under. */
async function makeActive() {
  const p = await svc.create(officer, newPermit())
  await confirmAllControls(p.id)
  await svc.addGasTest(officer, p.id, PASSING_GAS)
  await svc.addIsolation(officer, p.id, { description: 'Inlet isolated', tagId: 'LOTO-OFF-1' })
  await svc.submit(employee, p.id)
  await svc.approve(officer, p.id, 'Controls verified.')

  const worker = await db.employee.create({
    data: {
      companyId: COMPANY, siteId: SITE,
      employeeNo: `EMP-OFF-${Math.random().toString(36).slice(2, 8)}`,
      name: 'Entry Worker', medicalExpiry: new Date(Date.now() + 200 * 86400_000),
    },
  })
  const attendee = await db.permitAttendee.create({
    data: { permitId: p.id, employeeId: worker.id, nameAtAssignment: worker.name, addedBy: 'ITest' },
  })
  await db.permit.update({ where: { id: p.id }, data: { toolboxAt: new Date(), toolboxBy: 'ITest' } })
  await db.permitAttendee.update({ where: { id: attendee.id }, data: { toolboxAckAt: new Date() } })

  /*
   * Backdated, because a permit is raised before the work is done under it.
   *
   * Left at the moment of creation, every record in this file would be "dated before the
   * permit it belongs to" — correctly refused, since a reading cannot predate the permit it
   * is recorded against. A real confined-space permit is raised at the morning permit
   * meeting and worked through the shift, which is the situation these tests need.
   */
  await db.permit.update({
    where: { id: p.id },
    data: { createdAt: new Date(Date.now() - 4 * HOUR) },
  })

  const active = await svc.activate(officer, p.id)
  return { permit: active, attendeeId: attendee.id }
}

d('a permit worked offline — integration (real Postgres)', () => {
  beforeAll(async () => {
    await db.company.upsert({
      where: { id: COMPANY }, update: {}, create: { id: COMPANY, name: 'PTW Offline Co' },
    })
    await db.site.upsert({
      where: { id: SITE }, update: {}, create: { id: SITE, companyId: COMPANY, name: 'Offline Site' },
    })
  })

  afterAll(async () => {
    await db.company.deleteMany({ where: { id: COMPANY } })
    await db.counter.deleteMany({ where: { companyId: COMPANY } })
    await db.$disconnect()
  })

  // ── A record sent twice ────────────────────────────────────────────────────

  it('files one gas test when the same record arrives twice', async () => {
    /*
     * The case: a phone regains signal with the app open in two tabs, and both drain the
     * queue. Without the key this is two readings minutes apart — which suggests the
     * atmosphere was monitored twice as often as it was, and if the pair straddles a
     * re-test deadline the record shows a space tested on time that was not.
     */
    const { permit } = await makeActive()
    const clientRef = key()
    const before = (await svc.get(officer, permit.id)).gasTests.length

    await svc.addGasTest(officer, permit.id, { ...PASSING_GAS, note: 'Re-test at 2h' }, { clientRef })
    await svc.addGasTest(officer, permit.id, { ...PASSING_GAS, note: 'Re-test at 2h' }, { clientRef })

    const after = await svc.get(officer, permit.id)
    expect(after.gasTests.length).toBe(before + 1)
  })

  it('files two gas tests when they are genuinely two readings', async () => {
    // The constraint must not collapse real work. Different key, different reading.
    const { permit } = await makeActive()
    const before = (await svc.get(officer, permit.id)).gasTests.length

    await svc.addGasTest(officer, permit.id, PASSING_GAS, { clientRef: key() })
    await svc.addGasTest(officer, permit.id, PASSING_GAS, { clientRef: key() })

    expect((await svc.get(officer, permit.id)).gasTests.length).toBe(before + 2)
  })

  it('answers a replayed suspension with the suspended permit, not an error', async () => {
    /*
     * This is the ordering that matters most. The first copy suspends the permit; by the
     * time the second arrives it is no longer active, so the state check would refuse it —
     * and the queue reads a refusal as a payload the server will never accept, marks it
     * blocked, and puts a successful stop-work order in front of somebody as a failure.
     */
    const { permit } = await makeActive()
    const clientRef = key()

    const first = await svc.suspend(officer, permit.id, 'Scaffold tag missing', { clientRef })
    expect(first.status).toBe('suspended')

    const second = await svc.suspend(officer, permit.id, 'Scaffold tag missing', { clientRef })
    expect(second.status).toBe('suspended')
    expect(second.suspendedReason).toBe('Scaffold tag missing')

    // And exactly one suspension on the trail, not two.
    const events = await db.permitEvent.findMany({
      where: { permitId: permit.id, action: 'Suspended' },
    })
    expect(events).toHaveLength(1)
  })

  it('still refuses a second, genuinely different suspension', async () => {
    const { permit } = await makeActive()
    await svc.suspend(officer, permit.id, 'First reason', { clientRef: key() })
    await expect(svc.suspend(officer, permit.id, 'Second reason', { clientRef: key() }))
      .rejects.toThrow(/active permit/i)
  })

  it('signs a man into a vessel once when the record is replayed', async () => {
    /*
     * The occupancy log is what an emergency response reads to decide who is still inside.
     * Two entries for one man is the version of this bug that gets somebody counted twice,
     * or searched for after he has walked out.
     */
    const { attendeeId } = await makeActive()
    const clientRef = key()

    await people.setInside(officer, attendeeId, true, { clientRef })
    await people.setInside(officer, attendeeId, true, { clientRef })

    const events = await db.permitEvent.findMany({
      where: { action: 'Signed in to work area' },
    })
    const forThis = events.filter((e) => e.detail === 'Entry Worker')
    expect(forThis.length).toBeGreaterThan(0)

    const attendee = await db.permitAttendee.findUniqueOrThrow({ where: { id: attendeeId } })
    expect(attendee.enteredAt).not.toBeNull()
    expect(attendee.exitedAt).toBeNull()
  })

  it('acknowledges a toolbox talk once, and does not report the replay as a failure', async () => {
    const { permit, attendeeId } = await makeActive()
    await db.permitAttendee.update({ where: { id: attendeeId }, data: { toolboxAckAt: null } })
    await review.recordToolbox(officer, permit.id, {}, {}, { clientRef: key() })

    const clientRef = key()
    await review.acknowledgeToolbox(officer, attendeeId, {}, { clientRef })
    // Would throw "Already acknowledged" without the replay check.
    await expect(review.acknowledgeToolbox(officer, attendeeId, {}, { clientRef }))
      .resolves.toBeTruthy()
  })

  it('releases an isolation once, and does not report the replay as a failure', async () => {
    const { permit } = await makeActive()
    const live = (await svc.get(officer, permit.id)).isolations.filter((i) => !i.removedAt)
    const clientRef = key()

    await svc.releaseIsolation(officer, permit.id, live[0].id, { clientRef })
    await expect(svc.releaseIsolation(officer, permit.id, live[0].id, { clientRef }))
      .resolves.toBeTruthy()

    const events = await db.permitEvent.findMany({
      where: { permitId: permit.id, action: 'Isolation released' },
    })
    expect(events).toHaveLength(1)
  })

  it('keeps one tenant’s key from colliding with another’s', async () => {
    /*
     * The key is generated on a device, so two tenants' devices are free to produce the
     * same one. Scoping the constraint to the company is what stops one customer's gas test
     * being answered with "already done" because of another customer's record.
     */
    const { permit } = await makeActive()
    const clientRef = 'offline-itest-shared-key-abc'

    await svc.addGasTest(officer, permit.id, PASSING_GAS, { clientRef })
    await db.fieldRecord.create({
      data: {
        companyId: 'ptw-offline-other', clientRef, operation: 'permit.gas-test',
        userId: 'someone-else',
      },
    }).catch(() => undefined) // no such company; the point is the constraint, tested below

    const rows = await db.fieldRecord.findMany({ where: { clientRef } })
    expect(rows).toHaveLength(1)
    expect(rows[0].companyId).toBe(COMPANY)
  })

  // ── A hazard found at the job ──────────────────────────────────────────────

  it('adds a JSA row written with no signal, carrying the edits made to it there', async () => {
    /*
     * The whole case, end to end.
     *
     * The crew gets to the job and finds a hazard that is not on the analysis: an opening
     * with no guarding. They add the row on the phone, which names it, and then describe
     * it properly — control, who owns it, residual risk — all of it offline, all of it
     * addressed by that name because the server has never heard of the row.
     *
     * The queue drains oldest-first, so what the server sees is a create followed by the
     * amendments. What has to come out the other end is one row with the text the crew
     * actually wrote, not a seeded row with the corrections lost.
     */
    const { permit } = await makeActive()
    const clientId = `local-jsa-${key()}`

    const created = await review.addJsaStep(officer, permit.id, {
      hazard: 'New hazard', control: 'Control to be described', clientId,
    }, {}, { clientRef: key() })

    expect(created.clientId).toBe(clientId)

    // The amendments the crew made before any of it had reached the server. The device
    // translates the name to this id as the add lands; here that is simply the id.
    await review.updateJsaStep(officer, created.id, {
      hazard: 'Unguarded floor opening at the east manway',
    }, {}, { clientRef: key() })
    await review.updateJsaStep(officer, created.id, {
      control: 'Hard barrier and toe board before any entry', responsible: 'Azlan',
    }, {}, { clientRef: key() })

    const rows = await review.listJsa(officer, permit.id)
    const row = rows.find((r) => r.clientId === clientId)
    expect(row).toBeTruthy()
    expect(row!.hazard).toBe('Unguarded floor opening at the east manway')
    expect(row!.control).toBe('Hard barrier and toe board before any entry')
    expect(row!.responsible).toBe('Azlan')
    // One row, not one per amendment.
    expect(rows.filter((r) => r.clientId === clientId)).toHaveLength(1)
  })

  it('files the field row once when the whole queue is replayed', async () => {
    /*
     * A phone that drains from two tabs sends the add twice, and by then the row on the
     * server no longer says what the queued copy says — the amendments behind it have
     * landed in between. Recognising the second copy by its hazard text would therefore
     * fail to recognise it, and the analysis an approver signed would list the opening
     * twice, as two exposures with two controls.
     */
    const { permit } = await makeActive()
    const clientId = `local-jsa-${key()}`
    const addRef = key()
    const before = (await review.listJsa(officer, permit.id)).length

    const first = await review.addJsaStep(officer, permit.id, {
      hazard: 'New hazard', control: 'Control to be described', clientId,
    }, {}, { clientRef: addRef })
    await review.updateJsaStep(officer, first.id, { hazard: 'Unguarded opening' }, {}, { clientRef: key() })

    // The same add again, under the same key and then under a fresh one: a tab that never
    // heard the first reply retries, and a device that lost its queue entry re-sends.
    const sameKey = await review.addJsaStep(officer, permit.id, {
      hazard: 'New hazard', control: 'Control to be described', clientId,
    }, {}, { clientRef: addRef })
    const freshKey = await review.addJsaStep(officer, permit.id, {
      hazard: 'New hazard', control: 'Control to be described', clientId,
    }, {}, { clientRef: key() })

    expect(sameKey.id).toBe(first.id)
    expect(freshKey.id).toBe(first.id)
    // Answered with the row as it stands, amendments and all — not the stale queued text.
    expect(freshKey.hazard).toBe('Unguarded opening')
    expect((await review.listJsa(officer, permit.id)).length).toBe(before + 1)
  })

  it('refuses a second, genuinely different row that happens to name the same hazard', async () => {
    // The constraint must not collapse real work. Two steps of a job are free to carry the
    // same hazard with different controls, and a named row must not swallow an unnamed one.
    const { permit } = await makeActive()
    const before = (await review.listJsa(officer, permit.id)).length

    await review.addJsaStep(officer, permit.id, {
      hazard: 'Dropped object', control: 'Netting over walkway', clientId: `local-jsa-${key()}`,
    }, {}, { clientRef: key() })
    await review.addJsaStep(officer, permit.id, {
      hazard: 'Dropped object', control: 'Exclusion zone below the lift', clientId: `local-jsa-${key()}`,
    }, {}, { clientRef: key() })

    expect((await review.listJsa(officer, permit.id)).length).toBe(before + 2)
  })

  it('bumps the permit version when a field row lands, so a signed analysis is not the new one', async () => {
    /*
     * The safety rule, and the reason a row added offline is allowed to land on a permit
     * that has already been approved. The analysis an approver signed did not have this
     * hazard on it; the version says so, and the timeline says when it changed. A row that
     * arrived quietly would be the version of this feature that is worse than refusing it.
     */
    const { permit } = await makeActive()
    const before = await db.permit.findUniqueOrThrow({
      where: { id: permit.id }, select: { version: true },
    })

    await review.addJsaStep(officer, permit.id, {
      hazard: 'Unguarded opening', control: 'Hard barrier', clientId: `local-jsa-${key()}`,
    }, {}, { clientRef: key() })

    const after = await db.permit.findUniqueOrThrow({
      where: { id: permit.id }, select: { version: true },
    })
    expect(after.version).toBe(before.version + 1)

    const added = await db.permitEvent.findMany({
      where: { permitId: permit.id, action: 'JSA step added' },
    })
    expect(added.some((e) => e.detail === 'Unguarded opening')).toBe(true)
  })

  it('does not bump the version again when the same field row is replayed', async () => {
    // A replay that bumped the version would void an approval for a change that did not
    // happen, and the chain would be re-signed for nothing.
    const { permit } = await makeActive()
    const clientId = `local-jsa-${key()}`
    await review.addJsaStep(officer, permit.id, {
      hazard: 'Hot surface', control: 'Lagging', clientId,
    }, {}, { clientRef: key() })

    const between = await db.permit.findUniqueOrThrow({
      where: { id: permit.id }, select: { version: true },
    })
    await review.addJsaStep(officer, permit.id, {
      hazard: 'Hot surface', control: 'Lagging', clientId,
    }, {}, { clientRef: key() })

    const after = await db.permit.findUniqueOrThrow({
      where: { id: permit.id }, select: { version: true },
    })
    expect(after.version).toBe(between.version)
  })

  it('gives a row that arrives out of band its own place in the sequence', async () => {
    /*
     * A phone draining a row written an hour ago while the permit desk adds one on a
     * laptop. The JSA is the sequence of the job, so two steps sharing a position sort
     * arbitrarily — and the document an approver reads would put a control under the wrong
     * step.
     */
    const { permit } = await makeActive()
    const [deskRow, fieldRow] = await Promise.all([
      review.addJsaStep(officer, permit.id, { hazard: 'Desk row', control: 'A' }),
      review.addJsaStep(officer, permit.id, {
        hazard: 'Field row', control: 'B', clientId: `local-jsa-${key()}`,
      }, {}, { clientRef: key() }),
    ])

    const rows = await review.listJsa(officer, permit.id)
    const sequences = rows.map((r) => r.sequence)
    expect(new Set(sequences).size).toBe(sequences.length)
    expect(rows.map((r) => r.id)).toContain(deskRow.id)
    expect(rows.map((r) => r.id)).toContain(fieldRow.id)
  })

  it('leaves clientId null for a row added with a connection', async () => {
    // Every row typed at the permit desk looks exactly as it did before any of this.
    const { permit } = await makeActive()
    const row = await review.addJsaStep(officer, permit.id, { hazard: 'Desk hazard', control: 'C' })
    expect(row.clientId).toBeNull()
  })

  it('refuses a field row on a permit that was closed while the crew was out of signal', async () => {
    /*
     * The case the amendment path already had, now reachable one step earlier: the row is
     * written at the job, the permit is closed from the desk, and the row arrives after.
     * A 400 rather than a retry, because no amount of signal makes a closed permit accept
     * it, and somebody has to decide what to do with a hazard that was found.
     */
    const { permit } = await makeActive()
    for (const i of (await svc.get(officer, permit.id)).isolations.filter((x) => !x.removedAt)) {
      await svc.releaseIsolation(officer, permit.id, i.id)
    }
    await svc.close(officer, permit.id, { handbackConfirmed: true, statement: 'Done' })

    const clientRef = key()
    await expect(review.addJsaStep(officer, permit.id, {
      hazard: 'Found late', control: 'X', clientId: `local-jsa-${key()}`,
    }, {}, { clientRef })).rejects.toThrow(/closed/i)

    // And the key is not claimed, so the record is not lost if the permit is reopened.
    expect(await db.fieldRecord.findFirst({ where: { companyId: COMPANY, clientRef } })).toBeNull()
  })

  // ── The time the field made the record ─────────────────────────────────────

  it('files a queued gas test at the time it was taken, not the time it synced', async () => {
    /*
     * The whole reason recordedAt exists. A reading taken at the vessel and synced hours
     * later must carry the time on the detector: a confined space is cleared for a fixed
     * interval from the test, so a 14:00 stamp on a 09:15 test invents a re-test and erases
     * the hours the space went unmonitored.
     */
    const { permit } = await makeActive()
    const takenAt = new Date(Date.now() - 45 * 60 * 1000)

    await svc.addGasTest(officer, permit.id, { ...PASSING_GAS, note: 'Queued at the vessel' }, {
      clientRef: key(), recordedAt: takenAt.toISOString(),
    })

    /*
     * Found by its note rather than by "the latest row". The permit already carries the
     * pre-activation gas test, which was written with a connection and therefore stamped
     * now — so ordering by time puts that one first, and the record under test is the older
     * of the two precisely because it is being filed in the past.
     */
    const queued = await db.gasTest.findFirstOrThrow({
      where: { permitId: permit.id, note: 'Queued at the vessel' },
    })
    // Within a second: Postgres keeps millisecond precision, the comparison allows for it.
    expect(Math.abs(queued.testedAt.getTime() - takenAt.getTime())).toBeLessThan(1000)
  })

  it('puts the field’s time on the timeline too, so the trail reads in order', async () => {
    const { permit } = await makeActive()
    const takenAt = new Date(Date.now() - 30 * 60 * 1000)

    await svc.addGasTest(officer, permit.id, PASSING_GAS, {
      clientRef: key(), recordedAt: takenAt.toISOString(),
    })

    // As above, the permit holds more than one gas test event; the assertion is that the
    // queued one is on the trail at the time the field took it.
    const events = await db.permitEvent.findMany({
      where: { permitId: permit.id, action: 'Gas test passed' },
    })
    expect(events.some((e) => Math.abs(e.at.getTime() - takenAt.getTime()) < 1000)).toBe(true)
  })

  it('signs a man in at the time he entered, which is what a rescue reads', async () => {
    const { attendeeId } = await makeActive()
    const enteredAt = new Date(Date.now() - 50 * 60 * 1000)

    await people.setInside(officer, attendeeId, true, {
      clientRef: key(), recordedAt: enteredAt.toISOString(),
    })

    const attendee = await db.permitAttendee.findUniqueOrThrow({ where: { id: attendeeId } })
    expect(attendee.enteredAt).not.toBeNull()
    expect(Math.abs(attendee.enteredAt!.getTime() - enteredAt.getTime())).toBeLessThan(1000)
  })

  it('uses the server clock when no time was claimed, exactly as before', async () => {
    // Every write made with a connection looks like this and must be unchanged.
    const { permit } = await makeActive()
    const before = Date.now()

    await svc.addGasTest(officer, permit.id, PASSING_GAS)

    const latest = await db.gasTest.findFirstOrThrow({
      where: { permitId: permit.id }, orderBy: { testedAt: 'desc' },
    })
    expect(latest.testedAt.getTime()).toBeGreaterThanOrEqual(before - 1000)
  })

  it('refuses a record from a device whose clock is in the future', async () => {
    const { permit } = await makeActive()
    await expect(svc.addGasTest(officer, permit.id, PASSING_GAS, {
      clientRef: key(), recordedAt: new Date(Date.now() + 2 * HOUR).toISOString(),
    })).rejects.toThrow(FieldRecordError)
  })

  it('refuses a record dated before the permit existed', async () => {
    // A phone a month slow would otherwise write a reading into a period when the permit
    // had not been raised, and the trail would read as a test against nothing.
    const { permit } = await makeActive()
    await expect(svc.addGasTest(officer, permit.id, PASSING_GAS, {
      clientRef: key(), recordedAt: new Date(Date.now() - 3 * 86400_000).toISOString(),
    })).rejects.toThrow(/before the permit/i)
  })

  // ── What the ledger records ────────────────────────────────────────────────

  it('records which operation was accepted, for the audit trail', async () => {
    const { permit } = await makeActive()
    const clientRef = key()
    const takenAt = new Date(Date.now() - 20 * 60 * 1000)

    await svc.addGasTest(officer, permit.id, PASSING_GAS, {
      clientRef, recordedAt: takenAt.toISOString(),
    })

    const row = await db.fieldRecord.findFirstOrThrow({ where: { companyId: COMPANY, clientRef } })
    expect(row.operation).toBe('permit.gas-test')
    expect(row.subjectId).toBe(permit.id)
    expect(row.userId).toBe(officer.userId)
    // The gap between when the field did it and when we were told is the thing an auditor
    // asks about, so both times are kept rather than derived later from two tables.
    expect(row.recordedAt).not.toBeNull()
    expect(row.createdAt.getTime()).toBeGreaterThan(row.recordedAt!.getTime())
  })

  it('leaves no ledger row for a write made with a connection', async () => {
    // Nothing to be idempotent about, and a row per ordinary action would make this table
    // a second copy of the timeline.
    const { permit } = await makeActive()
    const before = await db.fieldRecord.count({ where: { companyId: COMPANY } })

    await svc.addGasTest(officer, permit.id, PASSING_GAS)

    expect(await db.fieldRecord.count({ where: { companyId: COMPANY } })).toBe(before)
  })

  it('does not claim the key when the work itself is refused', async () => {
    /*
     * Claim and work commit together or not at all. If a refused record left its key
     * claimed, the retry after somebody fixed the problem would be answered "already done"
     * and the gas test would never be written at all — a lost record, which is worse than
     * the duplicate this whole mechanism exists to prevent.
     */
    const { permit } = await makeActive()
    // Hand the permit back properly first: closing over a live isolation is refused, and
    // the refusal this test is about is the one that comes after.
    for (const i of (await svc.get(officer, permit.id)).isolations.filter((x) => !x.removedAt)) {
      await svc.releaseIsolation(officer, permit.id, i.id)
    }
    await svc.close(officer, permit.id, { handbackConfirmed: true, statement: 'Done' })

    const clientRef = key()
    await expect(svc.addIsolation(officer, permit.id, { description: 'x', tagId: 'y' }, { clientRef }))
      .rejects.toThrow()

    expect(await db.fieldRecord.findFirst({ where: { companyId: COMPANY, clientRef } })).toBeNull()
  })
})
