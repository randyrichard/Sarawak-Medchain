import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'
import { PrismaClient } from '@prisma/client'
import { createApp } from '../app.js'
import { ProvisioningService } from '../lib/provisioningService.js'
import { hashPassword } from '../lib/password.js'

/**
 * The export endpoint, over real HTTP.
 *
 * The service and the CSV layer are tested elsewhere. What only a real request can establish
 * is that the pieces are joined up: that the route is mounted behind authentication, that an
 * unauthenticated caller is turned away before any data is gathered, that the response really
 * is a zip with a filename on it, and that what comes down the socket is a well-formed
 * archive rather than a truncated stream.
 *
 * The last point is the one worth the setup. The archive is streamed as it is built, so a
 * failure part-way through cannot change the status code — the response would be a 200
 * carrying a corrupt file. Checking the magic bytes and the end-of-central-directory record
 * is the difference between "the endpoint answered" and "the customer has their data".
 *
 * Requires a database. Skipped when DATABASE_URL is absent so CI without one stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const provisioning = new ProvisioningService(db)
const ctx = { ip: '203.0.113.77', device: 'vitest' }
const PREFIX = 'exportroute-itest'
const PASSWORD = 'Exportroute-Itest-2026'

let server: Server
let base = ''
let seq = 0
const uniq = () => { seq += 1; return `${Date.now().toString(36)}${seq}` }
const mail = () => `${PREFIX}-${uniq()}@itest.local`

let companyId = ''
let adminEmail = ''
let employeeEmail = ''

const api = (path: string, init: RequestInit = {}) => fetch(`${base}${path}`, init)
const asUser = (token: string) => ({ Authorization: `Bearer ${token}` })

async function login(email: string) {
  const res = await api('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  const body = await res.json().catch(() => ({})) as { accessToken?: string }
  return body.accessToken ?? ''
}

async function purge() {
  const companies = await db.company.findMany({
    where: { name: { startsWith: 'ExportRoute ITest' } }, select: { id: true },
  })
  const ids = companies.map((c) => c.id)
  if (ids.length) {
    await db.incident.deleteMany({ where: { companyId: { in: ids } } })
    await db.invitation.deleteMany({ where: { companyId: { in: ids } } })
    await db.adminAuditEntry.deleteMany({ where: { companyId: { in: ids } } })
    await db.membership.deleteMany({ where: { companyId: { in: ids } } })
    await db.site.deleteMany({ where: { companyId: { in: ids } } })
    await db.company.deleteMany({ where: { id: { in: ids } } })
  }
  const users = await db.user.findMany({ where: { email: { startsWith: PREFIX } }, select: { id: true } })
  const uids = users.map((u) => u.id)
  if (uids.length) {
    await db.membership.deleteMany({ where: { userId: { in: uids } } })
    await db.user.deleteMany({ where: { id: { in: uids } } })
  }
}

d('GET /admin/export', () => {
  beforeAll(async () => {
    const app = createApp()
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve) })
    const addr = server.address()
    base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
    await purge()

    const staff = await db.user.create({
      data: {
        email: mail(), name: 'SafeChain Staff',
        passwordHash: await hashPassword(PASSWORD), status: 'active', platformAdmin: true,
      },
      select: { id: true },
    })
    adminEmail = mail()
    const r = await provisioning.provisionCompany(
      { userId: staff.id, name: 'SafeChain Staff', roles: [] }, ctx,
      {
        companyName: `ExportRoute ITest ${uniq()}`, industry: 'Testing', plan: 'standard',
        adminName: 'Aziz Rahman', adminEmail,
        siteName: 'Kidurong Yard', siteCity: 'Bintulu', siteTimezone: 'Asia/Kuching',
      },
    )
    companyId = r.companyId

    /*
     * Provisioning creates the admin as invited, with a password they are required to
     * replace. `requireAuth` enforces that on every route — a token carrying
     * mustChangePassword is refused with 403 password_change_required before it reaches any
     * handler, which is why this has to be cleared rather than only setting a password. The
     * gate is doing its job; it is simply not the thing under test here.
     */
    await db.user.update({
      where: { email: adminEmail },
      data: {
        passwordHash: await hashPassword(PASSWORD),
        status: 'active',
        mustChangePassword: false,
      },
    })

    employeeEmail = mail()
    await db.user.create({
      data: {
        email: employeeEmail, name: 'Chin Wei Ming',
        passwordHash: await hashPassword(PASSWORD), status: 'active',
        memberships: { create: { companyId, role: 'employee', siteIds: [] } },
      },
    })
  }, 120_000)

  afterAll(async () => {
    await purge()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await db.$disconnect()
  })

  it('refuses an unauthenticated caller', async () => {
    const res = await api(`/admin/export?companyId=${companyId}`)
    expect(res.status).toBe(401)
  })

  it('refuses an employee', async () => {
    const token = await login(employeeEmail)
    expect(token).toBeTruthy()
    const res = await api(`/admin/export?companyId=${companyId}`, { headers: asUser(token) })
    expect(res.status).toBe(403)
  })

  it('rejects a request with no company', async () => {
    const token = await login(adminEmail)
    const res = await api('/admin/export', { headers: asUser(token) })
    expect(res.status).toBe(400)
  })

  it('sends an administrator a named zip attachment', async () => {
    const token = await login(adminEmail)
    const res = await api(`/admin/export?companyId=${companyId}`, { headers: asUser(token) })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/zip')
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename=/)
    // Named for the customer and the day, so two exports do not collide in a downloads folder.
    expect(res.headers.get('content-disposition')).toMatch(/safechain-exportroute-itest/i)
    // A browser must not be able to sniff this into something it will render.
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('streams an archive that is actually a complete zip', async () => {
    /*
     * The status code cannot report a mid-stream failure, so it is not evidence on its own.
     * These two markers are: "PK\x03\x04" opens a local file header, and the end-of-central-
     * directory signature is written last. A truncated stream has the first and not the
     * second.
     */
    const token = await login(adminEmail)
    const res = await api(`/admin/export?companyId=${companyId}`, { headers: asUser(token) })
    const bytes = Buffer.from(await res.arrayBuffer())

    expect(bytes.length).toBeGreaterThan(1000)
    expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
    expect(bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))).toBeGreaterThan(0)

    // The entry names live in the central directory as plain bytes, so the archive can be
    // shown to contain the files that matter without unzipping it.
    const text = bytes.toString('latin1')
    for (const entry of [
      'readme.txt', 'files/manifest.csv',
      'tables/incidents.csv', 'tables/permits.csv',
      'tables/permit-controls.csv', 'tables/permit-signatures.csv',
      'tables/incident-timeline.csv', 'tables/employees.csv',
    ]) {
      expect(text).toContain(entry)
    }
  })

  it('records the export in the audit trail with the caller and their address', async () => {
    const before = await db.adminAuditEntry.count({
      where: { companyId, action: 'Exported workspace data' },
    })
    const token = await login(adminEmail)
    await api(`/admin/export?companyId=${companyId}`, { headers: asUser(token) })

    const after = await db.adminAuditEntry.findMany({
      where: { companyId, action: 'Exported workspace data' },
      orderBy: { at: 'desc' },
    })
    expect(after.length).toBe(before + 1)
    expect(after[0].actor).toBe('Aziz Rahman')
    // Taken from the connection, never from the body.
    expect(after[0].ip).toBeTruthy()
  })

  it('refuses to export a company the caller does not belong to', async () => {
    const token = await login(adminEmail)
    const res = await api('/admin/export?companyId=some-other-tenant', { headers: asUser(token) })
    expect([403, 404]).toContain(res.status)
  })
})
