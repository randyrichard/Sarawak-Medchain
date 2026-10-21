import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { createApp } from '../app.js'
import { env } from '../env.js'
import { AuthService } from '../lib/authService.js'
import { hashPassword } from '../lib/password.js'
import { hashRefreshToken } from '../lib/tokens.js'

/**
 * Findings from the security audit, over real HTTP against a REAL PostgreSQL database.
 *
 *  - Upload routes wrote files before checking the caller could attach anything, and left
 *    them behind when the request was refused.
 *  - Upload routes trusted the declared type, and served files back under the uploader's
 *    own name - `Invoice.exe` declared as a PDF went out as `Invoice.exe`.
 *  - Suspending a company stopped its API keys and nothing else.
 *  - Two refreshes presenting one token at the same moment both succeeded.
 *
 * Requires a database. Skipped when DATABASE_URL is absent so CI without one stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const PREFIX = 'sechard-itest'
const PASSWORD = 'Sechard-Itest-2026'
const UPLOAD_DIR = resolve(process.cwd(), env.UPLOAD_DIR)

let server: Server
let base = ''
const tag = Date.now().toString(36)
const companyA = `${PREFIX}-a-${tag}`
const companyB = `${PREFIX}-b-${tag}`
const siteA = `${PREFIX}-site-${tag}`
let incidentId = ''
let permitId = ''
let assetId = ''
const tokens: Record<string, string> = {}

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010806000000'
  + '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex')
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')

const stored = () => new Set(readdirSync(UPLOAD_DIR))

async function login(email: string) {
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  return { res, body: await res.json().catch(() => ({})) as { accessToken?: string; error?: string } }
}

function upload(path: string, who: string, file: { bytes: Buffer; type: string; name: string }) {
  const form = new FormData()
  form.append('files', new Blob([file.bytes], { type: file.type }), file.name)
  return fetch(`${base}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${tokens[who]}` }, body: form })
}

async function purge() {
  const ids = [companyA, companyB]
  const users = await db.user.findMany({ where: { email: { startsWith: PREFIX } }, select: { id: true } })
  const uids = users.map((u) => u.id)
  await db.incidentAttachment.deleteMany({ where: { incident: { companyId: { in: ids } } } })
  await db.incidentEvent.deleteMany({ where: { incident: { companyId: { in: ids } } } })
  await db.incident.deleteMany({ where: { companyId: { in: ids } } })
  await db.permitEvent.deleteMany({ where: { permit: { companyId: { in: ids } } } })
  await db.permitAttachment.deleteMany({ where: { permit: { companyId: { in: ids } } } })
  await db.permit.deleteMany({ where: { companyId: { in: ids } } })
  await db.assetEvent.deleteMany({ where: { asset: { companyId: { in: ids } } } })
  await db.assetDocument.deleteMany({ where: { asset: { companyId: { in: ids } } } })
  await db.asset.deleteMany({ where: { companyId: { in: ids } } })
  await db.refreshToken.deleteMany({ where: { userId: { in: uids } } })
  await db.loginAttempt.deleteMany({ where: { email: { startsWith: PREFIX } } })
  await db.membership.deleteMany({ where: { userId: { in: uids } } })
  await db.user.deleteMany({ where: { id: { in: uids } } })
  await db.site.deleteMany({ where: { companyId: { in: ids } } })
  await db.company.deleteMany({ where: { id: { in: ids } } })
}

d('security hardening — integration (real Postgres, real HTTP)', () => {
  beforeAll(async () => {
    const app = createApp()
    await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', r) })
    const addr = server.address()
    base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
    await purge()

    await db.company.create({ data: { id: companyA, name: 'SecHard A' } })
    await db.company.create({ data: { id: companyB, name: 'SecHard B' } })
    await db.site.create({ data: { id: siteA, companyId: companyA, name: 'Yard' } })
    const passwordHash = await hashPassword(PASSWORD)
    for (const [who, companyId, role] of [
      ['admin', companyA, 'admin'], ['employee', companyA, 'employee'], ['outsider', companyB, 'admin'],
    ] as const) {
      await db.user.create({
        data: {
          email: `${PREFIX}-${who}-${tag}@itest.local`, name: who, passwordHash, status: 'active',
          memberships: { create: { companyId, role, siteIds: [] } },
        },
      })
      tokens[who] = (await login(`${PREFIX}-${who}-${tag}@itest.local`)).body.accessToken ?? ''
    }

    incidentId = (await db.incident.create({
      data: {
        number: `SH-${tag}`, companyId: companyA, siteId: siteA, title: 'Slip', type: 'near_miss',
        severity: 'Minor', location: 'Deck', reporter: 'admin', occurredAt: new Date(),
      },
    })).id
    permitId = (await db.permit.create({
      data: {
        code: `SHP-${tag}`, companyId: companyA, siteId: siteA, type: 'hot_work', title: 'Weld',
        location: 'Deck', applicant: 'admin', validFrom: new Date(), validTo: new Date(Date.now() + 3600_000),
        createdBy: 'admin',
      },
    })).id
    assetId = (await db.asset.create({
      data: {
        code: `SHA-${tag}`, qrKey: `SHQ-${tag}`, companyId: companyA, siteId: siteA, name: 'Extinguisher',
        category: 'fire_extinguisher', serialNumber: 'X1', owner: 'admin', frequency: 'monthly',
        nextDueDate: new Date(), createdBy: 'admin',
      },
    })).id
  }, 120_000)

  afterAll(async () => {
    await purge()
    await new Promise<void>((r) => server.close(() => r()))
    await db.$disconnect()
  })

  describe('uploads', () => {
    it('leaves nothing on disk when the caller may not attach to the record', async () => {
      const before = stored()
      for (const [path, who] of [
        [`/incidents/${incidentId}/attachments`, 'outsider'],
        [`/incidents/does-not-exist/attachments`, 'admin'],
        [`/permits/${permitId}/attachments`, 'outsider'],
        [`/assets/${assetId}/documents`, 'outsider'],
        [`/assets/${assetId}/documents`, 'employee'], // a member, but not an equipment write role
      ] as const) {
        const res = await upload(path, who, { bytes: PNG, type: 'image/png', name: 'p.png' })
        expect(res.status, `${who} ${path}`).toBeGreaterThanOrEqual(400)
      }
      expect(stored()).toEqual(before)
    })

    it('refuses a file that is not what its declared type says, and keeps none of it', async () => {
      const before = stored()
      const fake = { bytes: Buffer.from('MZ\x90\x00 this is an executable'), type: 'application/pdf', name: 'Permit.pdf' }
      for (const path of [
        `/incidents/${incidentId}/attachments`, `/permits/${permitId}/attachments`, `/assets/${assetId}/documents`,
      ]) {
        const res = await upload(path, 'admin', fake)
        expect(res.status, path).toBe(400)
        expect(((await res.json()) as { message: string }).message).toMatch(/not the kind of file/)
      }
      expect(stored()).toEqual(before)
    })

    it('serves a stored file under a name whose extension matches what it is', async () => {
      const res = await upload(`/incidents/${incidentId}/attachments`, 'admin', { bytes: PDF, type: 'application/pdf', name: 'Invoice.exe' })
      expect(res.status).toBe(201)
      const { attachments } = await res.json() as { attachments: { id: string }[] }
      const dl = await fetch(`${base}/incidents/attachments/${attachments[0].id}`, { headers: { Authorization: `Bearer ${tokens.admin}` } })
      expect(dl.status).toBe(200)
      expect(dl.headers.get('content-disposition')).toBe(
        `attachment; filename="Invoice.exe.pdf"; filename*=UTF-8''Invoice.exe.pdf`,
      )
      expect(Buffer.from(await dl.arrayBuffer()).equals(PDF)).toBe(true)
    })

    it('still accepts genuine files on every route', async () => {
      for (const path of [
        `/incidents/${incidentId}/attachments`, `/permits/${permitId}/attachments`, `/assets/${assetId}/documents`,
      ]) {
        const res = await upload(path, 'admin', { bytes: PNG, type: 'image/png', name: 'site photo.png' })
        expect(res.status, path).toBe(201)
      }
    })

    it("lets only the permit's safety roles remove its documents", async () => {
      const res = await upload(`/permits/${permitId}/attachments`, 'admin', { bytes: PDF, type: 'application/pdf', name: 'JSA.pdf' })
      const { rows } = await res.json() as { rows: { id: string }[] }
      const del = (who: string) => fetch(`${base}/permits/attachments/${rows[0].id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${tokens[who]}` },
      })
      expect((await del('employee')).status).toBe(403)
      expect(await db.permitAttachment.count({ where: { id: rows[0].id } })).toBe(1)
      expect((await del('admin')).status).toBe(204)
      expect(await db.permitAttachment.count({ where: { id: rows[0].id } })).toBe(0)
    })
  })

  /*
   * Reading another tenant's file by its id.
   *
   * The upload block above proves a stranger cannot *attach* to a record they do not own.
   * This is the other half, and it was the gap: once a file exists, its id is the only
   * thing standing between it and anyone who guesses or is given one. Stored names are
   * random, but an id travels - in a link somebody pastes, a screenshot, a support ticket,
   * a log - and "you need the id" is not an access control.
   *
   * What makes it a tenant question rather than a permissions one: every route here is
   * behind requireAuth, so the attacker is a perfectly legitimate user. They are an admin -
   * the highest role there is - of a company that simply is not this one.
   */
  describe('files belonging to another workspace', () => {
    it('refuses a download to an admin of another company, on every attachment route', async () => {
      // Files that genuinely exist, owned by company A.
      const incident = await upload(`/incidents/${incidentId}/attachments`, 'admin', { bytes: PDF, type: 'application/pdf', name: 'report.pdf' })
      const permit = await upload(`/permits/${permitId}/attachments`, 'admin', { bytes: PDF, type: 'application/pdf', name: 'method.pdf' })
      const asset = await upload(`/assets/${assetId}/documents`, 'admin', { bytes: PDF, type: 'application/pdf', name: 'cert.pdf' })
      expect([incident.status, permit.status, asset.status]).toEqual([201, 201, 201])

      const incidentFile = ((await incident.json()) as { attachments: { id: string }[] }).attachments[0].id
      const permitFile = ((await permit.json()) as { rows: { id: string }[] }).rows[0].id
      const assetBody = (await asset.json()) as { rows?: { id: string }[]; documents?: { id: string }[] }
      const assetFile = (assetBody.rows ?? assetBody.documents ?? [])[0]?.id
      // Asserted rather than skipped-if-absent. The first version of this test tolerated a
      // missing id and silently covered two routes instead of three, which is how a gap
      // hides inside a passing test.
      expect(assetFile, 'asset document id').toBeTruthy()

      const routes = [
        `/incidents/attachments/${incidentFile}`,
        `/permits/attachments/${permitFile}`,
        `/assets/documents/${assetFile}`,
      ]

      for (const route of routes) {
        const res = await fetch(`${base}${route}`, {
          headers: { Authorization: `Bearer ${tokens.outsider}` },
        })
        // 403 or 404 both acceptable - what matters is that no bytes come back.
        /*
         * 404, and deliberately asserted rather than a loose >= 400.
         *
         * It is 404 because row-level security hides the row before the route's own
         * membership check is reached - the query returns nothing, so the handler takes
         * its "attachment not found" branch. Measured, not assumed: disabling the
         * membership check in permitAttachments.ts changes nothing here, because the
         * database had already refused.
         *
         * That is the defence working in the right order, and 404 also leaks less than
         * 403 - it does not confirm the file exists. Pinning the code means a future
         * change that loses RLS announces itself here as a 403 instead of passing
         * quietly on a >= 400 that both layers satisfy.
         *
         * Known limit: because the database answers first, this test cannot by itself
         * prove the application-layer check still works. That needs a service-level test
         * running under system scope.
         */
        expect(res.status, `outsider GET ${route}`).toBe(404)
        const body = Buffer.from(await res.arrayBuffer())
        expect(body.includes(Buffer.from('%PDF')), `bytes leaked from ${route}`).toBe(false)
      }

      // The control: the same ids, for somebody who is entitled to them. A test that only
      // proves a refusal would still pass if the route were broken for everybody.
      for (const route of routes) {
        const res = await fetch(`${base}${route}`, {
          headers: { Authorization: `Bearer ${tokens.admin}` },
        })
        expect(res.status, `admin GET ${route}`).toBe(200)
      }
    })

    it('refuses a download with no session at all', async () => {
      const res = await upload(`/incidents/${incidentId}/attachments`, 'admin', { bytes: PDF, type: 'application/pdf', name: 'anon.pdf' })
      const id = ((await res.json()) as { attachments: { id: string }[] }).attachments[0].id

      const anon = await fetch(`${base}/incidents/attachments/${id}`)
      expect(anon.status).toBe(401)
      expect(Buffer.from(await anon.arrayBuffer()).includes(Buffer.from('%PDF'))).toBe(false)
    })
  })

  describe('suspended workspace', () => {
    it('stops its people signing in, and lets them back when lifted', async () => {
      const email = `${PREFIX}-employee-${tag}@itest.local`
      await db.company.update({ where: { id: companyA }, data: { status: 'suspended' } })
      try {
        const { res, body } = await login(email)
        expect(res.status).toBe(403)
        expect(body.error).toBe('workspace_suspended')
      } finally {
        await db.company.update({ where: { id: companyA }, data: { status: 'active' } })
      }
      expect((await login(email)).res.status).toBe(200)
    })
  })

  describe('refresh rotation', () => {
    it('lets only one of several simultaneous refreshes of one token succeed, and treats the rest as replay', async () => {
      const auth = new AuthService(db)
      const ctx = { ip: '203.0.113.9', userAgent: 'vitest' }
      const { refreshToken } = await auth.login(`${PREFIX}-admin-${tag}@itest.local`, PASSWORD, ctx)
      const row = await db.refreshToken.findUniqueOrThrow({ where: { tokenHash: hashRefreshToken(refreshToken) } })

      const results = await Promise.allSettled(Array.from({ length: 6 }, () => auth.refresh(refreshToken, ctx)))
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      // A replay revokes the family, so nothing minted from the contested token survives.
      expect(await db.refreshToken.count({ where: { familyId: row.familyId, revokedAt: null } })).toBe(0)
    })
  })
})
