import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { AdminService, AdminError } from './adminService.js'
import { PermitService } from './permitService.js'
import { IncidentService } from './incidentService.js'
import { ProvisioningService } from './provisioningService.js'
import { collectTenantExport } from './tenantExport.js'
import { hashPassword } from './password.js'
import type { Caller } from './incidentService.js'

/**
 * The workspace export, against a real database.
 *
 * Two properties are worth a database to prove, and neither can be checked by reading the
 * code. That the export contains the *child* records — a permit arrives with the controls
 * that were signed off on it and the signatures that issued it, which the in-app restore
 * point does not manage. And that it contains nothing belonging to anybody else: this is the
 * one route that assembles an entire tenant into a single downloadable file, so a scoping
 * mistake here is a data breach with a helpful filename.
 *
 * Requires a database. Skipped when DATABASE_URL is absent so CI without one stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const admin = new AdminService(db)
const permits = new PermitService(db)
const incidents = new IncidentService(db)
const provisioning = new ProvisioningService(db)
const ctx = { ip: '203.0.113.44', device: 'vitest' }
const PREFIX = 'export-itest'

let seq = 0
const uniq = () => { seq += 1; return `${Date.now().toString(36)}${seq}` }
const mail = () => `${PREFIX}-${uniq()}@itest.local`

interface Tenant {
  companyId: string
  siteId: string
  adminCaller: Caller
  permitId: string
  incidentId: string
}

let ours: Tenant
let theirs: Tenant
/** A non-administrator in our workspace, to prove the export is not open to everyone. */
let manager: Caller

async function purge() {
  const companies = await db.company.findMany({
    where: { name: { startsWith: 'Export ITest' } }, select: { id: true },
  })
  const ids = companies.map((c) => c.id)
  if (ids.length) {
    await db.permit.deleteMany({ where: { companyId: { in: ids } } })
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

/** A workspace holding one fully-issued permit and one incident. */
async function makeTenant(label: string): Promise<Tenant> {
  const staff = await db.user.create({
    data: {
      email: mail(), name: 'SafeOps Staff',
      passwordHash: await hashPassword('Export-Itest-2026'),
      status: 'active', platformAdmin: true,
    },
    select: { id: true },
  })
  const adminEmail = mail()
  const r = await provisioning.provisionCompany(
    { userId: staff.id, name: 'SafeOps Staff', roles: [] }, ctx,
    {
      companyName: `Export ITest ${label} ${uniq()}`, industry: 'Testing', plan: 'standard',
      adminName: `Admin ${label}`, adminEmail,
      siteName: `${label} Site`, siteCity: 'Kuching', siteTimezone: 'Asia/Kuching',
    },
  )
  const companyId = r.companyId
  const siteId = (await db.site.findFirstOrThrow({ where: { companyId }, select: { id: true } })).id

  const a = await db.user.findUniqueOrThrow({ where: { email: adminEmail }, include: { memberships: true } })
  const adminCaller: Caller = {
    userId: a.id, name: a.name,
    roles: a.memberships.map((m) => ({ companyId: m.companyId, role: 'admin' as const, siteIds: m.siteIds })),
  }

  // A permit taken all the way to issued, so it carries controls, a gas test, signatures
  // and a timeline — precisely the records a parent-only snapshot loses.
  const p = await permits.create(adminCaller, {
    companyId, siteId, type: 'hot_work',
    title: `${label} welding on line 3`,
    description: 'Raised by the export test.',
    location: 'Bay 2', department: 'Maintenance',
    applicant: `Applicant ${label}`, workerCount: 2,
    validFrom: new Date(Date.now() + 3600_000).toISOString(),
    validTo: new Date(Date.now() + 6 * 3600_000).toISOString(),
  })
  await permits.submit(adminCaller, p.id)
  for (const c of await db.permitControl.findMany({ where: { permitId: p.id, required: true } })) {
    await permits.confirmControl(adminCaller, p.id, c.id, true)
  }
  await permits.addGasTest(adminCaller, p.id, { oxygenPct: 20.9, lelPct: 0, h2sPpm: 0, coPpm: 0 })

  const inc = await incidents.create(adminCaller, {
    companyId, siteId,
    title: `${label} slip near the press`,
    description: 'Raised by the export test.',
    type: 'near_miss', severity: 'Minor',
    location: 'Bay 2', department: 'Maintenance',
    occurredAt: new Date().toISOString(),
  })

  return { companyId, siteId, adminCaller, permitId: p.id, incidentId: inc.id }
}

d('workspace export', () => {
  beforeAll(async () => {
    await purge()
    ours = await makeTenant('Ours')
    theirs = await makeTenant('Theirs')

    const m = await db.user.create({
      data: {
        email: mail(), name: 'Siti Manager',
        passwordHash: await hashPassword('Export-Itest-2026'), status: 'active',
        memberships: { create: { companyId: ours.companyId, role: 'hse_manager', siteIds: [] } },
      },
      include: { memberships: true },
    })
    manager = {
      userId: m.id, name: m.name,
      roles: m.memberships.map((x) => ({ companyId: x.companyId, role: x.role, siteIds: x.siteIds })),
    }
  }, 120_000)

  afterAll(async () => { await purge(); await db.$disconnect() })

  // ── Who may take a copy ────────────────────────────────────────────────────

  it('lets an administrator export their own workspace', async () => {
    const snap = await admin.exportWorkspace(ours.adminCaller, ours.companyId, ctx)
    expect(snap.companyId).toBe(ours.companyId)
    expect(snap.tables.length).toBeGreaterThan(20)
  })

  it('refuses an HSE manager', async () => {
    /*
     * Not because they are untrusted - they can already read most of this screen by screen.
     * A single file containing the entire workforce register, medical restrictions included,
     * is a different kind of object from the screens it was assembled from, and the decision
     * to create one belongs with the account that answers for the tenant.
     */
    await expect(admin.exportWorkspace(manager, ours.companyId, ctx))
      .rejects.toBeInstanceOf(AdminError)
  })

  it('refuses an administrator of a different company', async () => {
    /*
     * Refused for the better of the two reasons: not "you are not an administrator here" but
     * "you have no membership here at all". The check that stops this is the same one every
     * other route uses, and it fires before the role is even considered.
     */
    await expect(admin.exportWorkspace(theirs.adminCaller, ours.companyId, ctx))
      .rejects.toThrow(/do not have access to this workspace/i)
  })

  it('writes the export to the audit trail', async () => {
    // Exporting health data has to be answerable for afterwards.
    await admin.exportWorkspace(ours.adminCaller, ours.companyId, ctx)
    const entry = await db.adminAuditEntry.findFirst({
      where: { companyId: ours.companyId, action: 'Exported workspace data' },
      orderBy: { at: 'desc' },
    })
    expect(entry).not.toBeNull()
    expect(entry!.actor).toBe(ours.adminCaller.name)
    expect(entry!.ip).toBe(ctx.ip)
  })

  // ── The children, which are the point ──────────────────────────────────────

  it('brings a permit out with the controls that were signed off on it', async () => {
    /*
     * The failure this exists to prevent. The in-app restore point drops these - the drill in
     * docs/BACKUP.md measured 20 of 38 lost - and a permit without its controls is not a
     * permit. It would be worthless in a DOSH investigation.
     */
    const snap = await collectTenantExport(db, ours.companyId)
    const controls = snap.tables.find((t) => t.name === 'permit-controls')!
    expect(controls.rows.length).toBeGreaterThan(0)
    expect(controls.rows.every((r) => (r as { permitId: string }).permitId === ours.permitId)).toBe(true)
    expect(controls.rows.some((r) => (r as { confirmed: boolean }).confirmed)).toBe(true)
  })

  it('brings the gas test and the permit timeline', async () => {
    const snap = await collectTenantExport(db, ours.companyId)
    const gas = snap.tables.find((t) => t.name === 'permit-gas-tests')!
    const timeline = snap.tables.find((t) => t.name === 'permit-timeline')!
    expect(gas.rows.length).toBeGreaterThan(0)
    expect(timeline.rows.length).toBeGreaterThan(0)
  })

  it('brings the incident timeline', async () => {
    const snap = await collectTenantExport(db, ours.companyId)
    const events = snap.tables.find((t) => t.name === 'incident-timeline')!
    expect(events.rows.length).toBeGreaterThan(0)
  })

  it('includes every register, even the empty ones', async () => {
    // An absent file reads as "this feature was never used"; an empty one reads as "nothing
    // here". Only the second is true, and only the second is checkable.
    const snap = await collectTenantExport(db, ours.companyId)
    const names = snap.tables.map((t) => t.name)
    for (const expected of [
      'incidents', 'permits', 'permit-signatures', 'permit-isolations', 'corrective-actions',
      'assets', 'inspections', 'employees', 'contractor-companies', 'visitors',
      'certificates', 'audits', 'admin-audit-trail',
    ]) {
      expect(names).toContain(expected)
    }
  })

  // ── Nothing belonging to anybody else ──────────────────────────────────────

  it('contains no row from another workspace', async () => {
    /*
     * The assertion this file exists for. Every table is swept for the other tenant's ids
     * rather than spot-checking two or three, because a scoping mistake would most likely
     * appear in whichever table nobody thought to look at.
     */
    const snap = await collectTenantExport(db, ours.companyId)
    const theirIds = new Set<string>([theirs.companyId, theirs.permitId, theirs.incidentId, theirs.siteId])

    for (const table of snap.tables) {
      for (const row of table.rows) {
        for (const [column, value] of Object.entries(row)) {
          if (typeof value === 'string' && theirIds.has(value)) {
            throw new Error(`${table.name}.${column} leaked ${value} from the other workspace`)
          }
        }
      }
    }
  })

  it('scopes child tables through their parent, not by company alone', async () => {
    // permit-controls has no companyId of its own. If the relation filter were wrong it
    // would return every control on the deployment, so compare against the true total.
    const snap = await collectTenantExport(db, ours.companyId)
    const mine = snap.tables.find((t) => t.name === 'permit-controls')!.rows.length
    const everywhere = await db.permitControl.count()
    const theirCount = await db.permitControl.count({ where: { permit: { companyId: theirs.companyId } } })

    expect(theirCount).toBeGreaterThan(0)   // the other tenant really does have some
    expect(mine).toBeLessThan(everywhere)   // so ours cannot be all of them
  })

  it('names the company so the archive identifies itself', async () => {
    const snap = await collectTenantExport(db, ours.companyId)
    expect(snap.companyName).toMatch(/Export ITest Ours/)
  })
})
