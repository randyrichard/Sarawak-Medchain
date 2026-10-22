import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'
import { PrismaClient } from '@prisma/client'
import { createApp } from '../app.js'
import { hashPassword } from '../lib/password.js'

/**
 * Signing off a training session over real HTTP, as the restricted login.
 *
 * Certificate numbers are one sequence across every workspace - a certificate is checked by
 * its number alone - and that sequence is a Counter row under a reserved company id. The
 * tenant policy on Counter matched no caller for that row, so on a server running as the
 * restricted login, which is every production install, no certificate could be numbered:
 * signing off a session where anybody passed answered 500 and issued nothing. The
 * service-level tests connect as the owner, which policies do not bind, so they never saw
 * it. These go through the route, where row-level security is in force.
 *
 * Requires a database. Skipped when DATABASE_URL is absent so CI without one stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const CO = 'cert-itest-co'
const SITE = 'cert-itest-site'
const EMAIL = 'cert-itest-manager@example.test'
const PASSWORD = 'Cert-Itest-Passw0rd-2026'
/** Safety Induction: in the shared catalogue, and applies to everybody. */
const COURSE = 'trn-101'

let server: Server
let base = ''
let token = ''
const employees: string[] = []

const api = (path: string, body: unknown) => fetch(`${base}${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
})

async function purge() {
  await db.certificate.deleteMany({ where: { companyId: CO } })
  await db.trainingSession.deleteMany({ where: { companyId: CO } })
  await db.employee.deleteMany({ where: { companyId: CO } })
  await db.counter.deleteMany({ where: { companyId: CO } })
  const users = await db.user.findMany({ where: { email: EMAIL }, select: { id: true } })
  await db.refreshToken.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } })
  await db.membership.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } })
  await db.user.deleteMany({ where: { email: EMAIL } })
}

/** Schedules a session for one person and signs it off with them present and passing. */
async function signOff(employeeId: string) {
  const created = await api('/training/sessions', {
    companyId: CO, siteId: SITE, courseId: COURSE, trainer: 'Cert Trainer', venue: 'Room 1',
    mode: 'physical', scheduledFor: new Date().toISOString().slice(0, 10), maxParticipants: 5,
    enrolled: [employeeId],
  })
  expect(created.status).toBe(201)
  const { id } = await created.json() as { id: string }
  return api(`/training/sessions/${id}/complete`, {
    attendance: [{ employeeId, present: true, result: 'pass', score: 90 }],
    signature: 'Cert Trainer',
  })
}

d('Training sign-off as the restricted login (real HTTP, real Postgres)', () => {
  beforeAll(async () => {
    await purge()
    await db.company.upsert({ where: { id: CO }, update: {}, create: { id: CO, name: 'Cert ITest' } })
    await db.site.upsert({
      where: { id: SITE }, update: {},
      create: { id: SITE, companyId: CO, name: 'Cert Yard', short: 'CRT', city: 'Miri' },
    })
    for (const n of [1, 2]) {
      employees.push((await db.employee.create({
        data: {
          employeeNo: `EMP-CERT-${n}`, name: `Cert Worker ${n}`, department: 'Maintenance',
          companyId: CO, siteId: SITE, position: 'Technician',
        },
      })).id)
    }
    await db.user.create({
      data: {
        email: EMAIL, name: 'Cert Manager', passwordHash: await hashPassword(PASSWORD),
        memberships: { create: { companyId: CO, role: 'hse_manager', siteIds: [] } },
      },
    })

    const app = createApp()
    await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', r) })
    const addr = server.address()
    base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    })
    token = ((await res.json()) as { accessToken: string }).accessToken
  })

  afterAll(async () => {
    await new Promise((r) => server?.close(r))
    await purge()
    await db.site.deleteMany({ where: { id: SITE } })
    await db.company.deleteMany({ where: { id: CO } })
    await db.$disconnect()
  })

  it('numbers and issues the certificate of everybody who passed', async () => {
    const res = await signOff(employees[0])
    expect(res.status).toBe(200)
    const { certificates } = await res.json() as { certificates: { number: string; employeeId: string }[] }
    expect(certificates).toHaveLength(1)
    expect(certificates[0].employeeId).toBe(employees[0])
    expect(certificates[0].number).toMatch(/^CERT-\d{4}-\d{4,}$/)
  })

  it('keeps one sequence across sessions, so the next certificate takes the next number', async () => {
    const seq = (n: string) => Number(n.split('-').pop())
    const [first] = (await db.certificate.findMany({ where: { companyId: CO } })).map((c) => c.number)

    const res = await signOff(employees[1])
    expect(res.status).toBe(200)
    const { certificates } = await res.json() as { certificates: { number: string }[] }
    expect(seq(certificates[0].number)).toBeGreaterThan(seq(first))
  })
})
