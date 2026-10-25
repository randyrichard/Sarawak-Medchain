import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'
import { PrismaClient } from '@prisma/client'
import { createApp } from '../app.js'
import { signAccessToken } from '../lib/tokens.js'

/**
 * DOSH notification over real HTTP, as the restricted login.
 *
 * The subject is the statutory duty: that a notifiable incident carries its seven-day
 * deadline from the day it happened, that the decision and the notification are recorded
 * with who made them, that only the people who answer for it can make them, and that the
 * year's figures for the JKKP 8 summary come from those decisions and nothing else.
 *
 * Requires a database. Skipped when DATABASE_URL is absent so CI without one stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const CO = 'dosh-itest-co'
const OTHER = 'dosh-itest-other'
const SITE = 'dosh-itest-site'
const OTHER_SITE = 'dosh-itest-other-site'
const DAY = 86_400_000

let server: Server
let base = ''

const tokenFor = (role: string, companyId = CO) => signAccessToken({
  sub: `dosh-${role}-${companyId}`, email: `${role}@dosh-itest.example`, name: `Dosh ${role}`,
  roles: [{ companyId, role: role as never, siteIds: [] }], mustChangePassword: false,
}).token

const call = (path: string, role = 'hse_manager', init: RequestInit = {}, companyId = CO) => fetch(`${base}${path}`, {
  ...init,
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenFor(role, companyId)}`, ...(init.headers ?? {}) },
})
const put = (id: string, body: unknown, role = 'hse_manager') =>
  call(`/incidents/${id}/dosh`, role, { method: 'PUT', body: JSON.stringify(body) })
const json = async (res: Response): Promise<any> => res.json()

let seq = 0
async function incident(over: Record<string, unknown> = {}, companyId = CO, siteId = SITE) {
  seq += 1
  return db.incident.create({
    data: {
      companyId, siteId, number: `INC-D${seq}`, title: `Dosh ITest ${seq}`, type: 'injury', severity: 'lost_time_injury',
      location: 'Bay 2', reporter: 'Dosh Reporter', occurredAt: new Date(Date.now() - 2 * DAY), ...over,
    },
  })
}

async function purge() {
  for (const companyId of [CO, OTHER]) {
    await db.incidentPerson.deleteMany({ where: { incident: { companyId } } })
    await db.incidentEvent.deleteMany({ where: { incident: { companyId } } })
    await db.incident.deleteMany({ where: { companyId } })
    await db.adminAuditEntry.deleteMany({ where: { companyId } })
    await db.siteManHours.deleteMany({ where: { companyId } })
  }
}

d('DOSH notification (real HTTP, real Postgres)', () => {
  beforeAll(async () => {
    for (const [id, name] of [[CO, 'Dosh ITest'], [OTHER, 'Dosh ITest Other']]) {
      await db.company.upsert({ where: { id }, update: {}, create: { id, name } })
    }
    for (const [id, companyId] of [[SITE, CO], [OTHER_SITE, OTHER]]) {
      await db.site.upsert({
        where: { id }, update: {},
        create: { id, companyId, name: `Site ${id}`, short: 'DSH', city: 'Bintulu', headcount: 40 },
      })
    }
    await purge()
    const app = createApp()
    await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', r) })
    const addr = server.address()
    base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
  })

  afterAll(async () => {
    await new Promise((r) => server?.close(r))
    await purge()
    await db.site.deleteMany({ where: { id: { in: [SITE, OTHER_SITE] } } })
    await db.company.deleteMany({ where: { id: { in: [CO, OTHER] } } })
    await db.$disconnect()
  })

  it('asks the question, with the deadline already running, when someone is off for more than four days', async () => {
    const inc = await incident()
    await db.incidentPerson.create({ data: { incidentId: inc.id, role: 'injured', name: 'Hurt Worker', daysLost: 6, addedBy: 'test' } })

    const res = await call(`/incidents/${inc.id}/dosh`)
    expect(res.status).toBe(200)
    const v = await json(res)
    expect(v.suggestion).toMatchObject({ category: 'over_four_days', flagged: true })
    expect(v.status.state).toBe('decide')
    expect(v.status.daysLeft).toBeGreaterThanOrEqual(4)
    expect(v.status.daysLeft).toBeLessThanOrEqual(5)
  })

  it('records the decision and the written report, on the incident\'s timeline', async () => {
    const inc = await incident()
    let res = await put(inc.id, { category: 'over_four_days' })
    expect(res.status).toBe(200)
    expect((await json(res)).status).toMatchObject({ state: 'due', form: 'JKKP 6', immediate: false })

    const sentAt = new Date(Date.now() - DAY).toISOString()
    res = await put(inc.id, { category: 'over_four_days', submittedAt: sentAt, reference: 'MYKKP-2026-0042' })
    const v = await json(res)
    expect(v.status.state).toBe('submitted')
    expect(v).toMatchObject({ reference: 'MYKKP-2026-0042', decidedBy: 'Dosh hse_manager' })

    const events = await db.incidentEvent.findMany({ where: { incidentId: inc.id }, orderBy: { at: 'asc' } })
    expect(events.map((e) => e.action)).toEqual(['DOSH: Off normal work for more than 4 days', 'JKKP 6 sent to DOSH'])
    expect(events[1].detail).toMatch(/MYKKP-2026-0042/)
  })

  it('keeps a death\'s immediate notice outstanding until it is recorded', async () => {
    const inc = await incident({ severity: 'fatality' })
    const res = await put(inc.id, { category: 'death' })
    expect((await json(res)).status).toMatchObject({ immediate: true, immediateOutstanding: true })
    const told = await put(inc.id, {
      category: 'death', informedAt: new Date(Date.now() - DAY).toISOString(), informedHow: 'Telephone', office: 'JKKP Sarawak',
    })
    expect((await json(told)).status.immediateOutstanding).toBe(false)
  })

  it('refuses "not notifiable" without a reason, in words', async () => {
    const inc = await incident()
    const res = await put(inc.id, { category: 'not_notifiable' })
    expect(res.status).toBe(400)
    expect((await json(res)).message).toMatch(/why DOSH need not be told/)
    expect((await put(inc.id, { category: 'not_notifiable', notRequiredReason: 'Back at work the next shift, no First Schedule injury.' })).status).toBe(200)
  })

  it('leaves the decision to the people who answer for it', async () => {
    const inc = await incident()
    expect((await call(`/incidents/${inc.id}/dosh`, 'employee')).status).not.toBe(200) // not their report
    const res = await put(inc.id, { category: 'over_four_days' }, 'supervisor')
    expect(res.status).toBe(403)
  })

  it('does not show another workspace\'s incident', async () => {
    const theirs = await incident({}, OTHER, OTHER_SITE)
    expect((await call(`/incidents/${theirs.id}/dosh`)).status).toBe(404)
    expect((await put(theirs.id, { category: 'death' })).status).toBe(404)
  })

  it('lists what is owed, and stops listing it once the form is sent', async () => {
    await purge()
    const owed = await incident({ severity: 'fatality' })
    await put(owed.id, { category: 'death' })
    const decided = await incident()
    await put(decided.id, { category: 'not_notifiable', notRequiredReason: 'First aid only, back at work.' })

    let res = await call(`/incidents/dosh/outstanding?companyId=${CO}`)
    expect(res.status).toBe(200)
    let rows = await json(res)
    expect(rows.map((r: { number: string }) => r.number)).toEqual([owed.number])
    expect(rows[0]).toMatchObject({ state: 'due', immediateOutstanding: true, form: 'JKKP 6' })

    const yesterday = new Date(Date.now() - DAY).toISOString()
    await put(owed.id, { category: 'death', informedAt: yesterday, submittedAt: yesterday, reference: 'KKP-9' })
    rows = await json(await call(`/incidents/dosh/outstanding?companyId=${CO}`))
    expect(rows).toEqual([])
  })

  it('counts the year\'s figures from the decisions, and names what is undecided', async () => {
    await purge()
    const year = new Date(Date.now() - 2 * DAY).getUTCFullYear()
    const lti = await incident()
    await db.incidentPerson.create({ data: { incidentId: lti.id, role: 'injured', name: 'A', daysLost: 6, addedBy: 'test' } })
    await put(lti.id, { category: 'over_four_days' })
    const occurrence = await incident({ type: 'equipment_failure', severity: 'near_miss' })
    await put(occurrence.id, { category: 'dangerous_occurrence', detail: 'Collapse of a scaffold over 5 m' })
    const undecided = await incident({ type: 'fire', severity: 'near_miss' })

    const res = await call(`/reports/preview?companyId=${CO}&type=dosh_annual&year=${year}`)
    expect(res.status).toBe(200)
    const r = await json(res)
    const stat = (label: string) => r.summary.find((s: { label: string }) => s.label === label)?.value
    expect(stat('Off work over 4 days')).toBe('1')
    expect(stat('Dangerous occurrences')).toBe('1')
    expect(stat('Days lost')).toBe('6')
    expect(stat('Not yet decided')).toBe('1')
    expect(r.rows.map((x: { ref: string }) => x.ref)).toEqual([lti.number, occurrence.number])
    const pending = r.sections.find((s: { title: string }) => s.title === 'Not yet decided')
    expect(pending.rows.map((x: { ref: string }) => x.ref)).toEqual([undecided.number])

    expect((await call(`/reports/preview?companyId=${CO}&type=dosh_annual&year=${year + 1}`)).status).toBe(400)
  })
})
