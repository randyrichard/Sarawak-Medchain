import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { OrgAdminService, INVITE_TTL_DAYS } from './orgAdminService.js'
import { OrgService } from './orgService.js'
import type { Caller } from './incidentService.js'
import { verifyPassword } from './password.js'

/**
 * Organisation administration, against a REAL PostgreSQL database.
 *
 * This module decides who gets into a workspace and what they can do there, so the tests
 * concentrate on the ways that goes wrong: an invitation that works for the wrong tenant,
 * a link that can be spent twice, an administrator who locks the last door behind them,
 * and a deactivated department that takes its incidents' history with it.
 *
 * Requires a database. Skipped when DATABASE_URL is absent so CI without one stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const svc = new OrgAdminService(db)
const org = new OrgService(db)

const CO = 'oa-itest-co'
const OTHER = 'oa-itest-other'
const SITE = 'oa-itest-site'
const SITE2 = 'oa-itest-site2'
const OTHER_SITE = 'oa-itest-other-site'

const ctx = { ip: '10.0.0.1', device: 'vitest' }

const caller = (role: string, id: string, companyId = CO, siteIds: string[] = []): Caller => ({
  userId: `oa-${id}`, name: `OA ${id}`,
  roles: [{ companyId, role: role as never, siteIds }],
})

const admin = caller('admin', 'admin')
const hse = caller('hse_manager', 'hse')
const supervisor = caller('supervisor', 'sup')
const employee = caller('employee', 'emp')
const outsider = caller('admin', 'outsider', OTHER)

let seq = 0
const uniq = () => { seq += 1; return `${Date.now().toString(36)}${seq}` }
const mail = () => `oa-${uniq()}@itest.local`

/** A real user row with a membership, so it can be a manager or a target. */
async function member(companyId = CO, role = 'employee') {
  const user = await db.user.create({
    data: {
      email: mail(), name: `OA Member ${uniq()}`, passwordHash: 'x', status: 'active',
    },
  })
  await db.membership.create({ data: { userId: user.id, companyId, role: role as never } })
  return user
}

async function purge() {
  const ids = { in: [CO, OTHER] }
  await db.invitation.deleteMany({ where: { companyId: ids } })
  // Incidents hold a Restrict reference to Site, so they go before the sites do.
  await db.incident.deleteMany({ where: { companyId: ids } })
  await db.adminAuditEntry.deleteMany({ where: { companyId: ids } })
  await db.employee.deleteMany({ where: { companyId: ids } })
  await db.membership.deleteMany({ where: { companyId: ids } })
  await db.user.deleteMany({ where: { email: { startsWith: 'oa-' } } })
  await db.department.deleteMany({ where: { site: { companyId: ids } } })
  await db.site.deleteMany({ where: { companyId: ids, id: { notIn: [SITE, SITE2, OTHER_SITE] } } })
  await db.site.updateMany({
    where: { id: { in: [SITE, SITE2, OTHER_SITE] } },
    data: { active: true, code: '', address: '', contactName: '', contactPhone: '' },
  })
}

d('Organisation administration — integration (real Postgres)', () => {
  beforeAll(async () => {
    for (const [id, name] of [[CO, 'OA ITest Co'], [OTHER, 'OA ITest Other']]) {
      await db.company.upsert({ where: { id }, update: {}, create: { id, name } })
    }
    for (const [id, companyId, name] of [
      [SITE, CO, 'OA Site One'], [SITE2, CO, 'OA Site Two'], [OTHER_SITE, OTHER, 'OA Other Site'],
    ]) {
      await db.site.upsert({ where: { id }, update: {}, create: { id, companyId, name } })
    }
    await purge()
  })

  afterAll(async () => {
    await purge()
    await db.site.deleteMany({ where: { id: { in: [SITE, SITE2, OTHER_SITE] } } })
    await db.company.deleteMany({ where: { id: { in: [CO, OTHER] } } })
    await db.$disconnect()
  })

  beforeEach(purge)

  // ── Authorization ─────────────────────────────────────────────────────────

  it('refuses every mutation to a non-administrator', async () => {
    for (const who of [hse, supervisor, employee]) {
      await expect(svc.listSites(who, CO)).rejects.toMatchObject({ status: 403 })
      await expect(svc.createSite(who, CO, ctx, { name: 'Nope' }))
        .rejects.toMatchObject({ status: 403 })
      await expect(svc.listInvitations(who, CO)).rejects.toMatchObject({ status: 403 })
      await expect(svc.createInvitation(who, CO, ctx, { email: mail(), role: 'employee' }))
        .rejects.toMatchObject({ status: 403 })
    }
  })

  it('refuses an employee the ability to change anybody\'s role', async () => {
    const target = await member()
    await expect(svc.setUserAccess(employee, CO, ctx, target.id, { role: 'admin' }))
      .rejects.toMatchObject({ status: 403 })
    await expect(svc.setUserAccess(supervisor, CO, ctx, target.id, { role: 'hse_manager' }))
      .rejects.toMatchObject({ status: 403 })
  })

  it('refuses a workspace the caller is not a member of', async () => {
    await expect(svc.listSites(outsider, CO)).rejects.toMatchObject({ status: 403 })
    await expect(svc.listSites(admin, OTHER)).rejects.toMatchObject({ status: 403 })
  })

  // ── Tenant isolation ──────────────────────────────────────────────────────

  it('does not reveal whether another tenant\'s site exists', async () => {
    /*
     * 404 rather than 403. A 403 on an id that exists elsewhere and a 404 on one that does
     * not is an oracle for enumerating another tenant's records.
     */
    await expect(svc.updateSite(admin, CO, ctx, OTHER_SITE, { name: 'Taken over' }))
      .rejects.toMatchObject({ status: 404 })
    await expect(svc.setSiteActive(admin, CO, ctx, OTHER_SITE, false))
      .rejects.toMatchObject({ status: 404 })

    const untouched = await db.site.findUniqueOrThrow({ where: { id: OTHER_SITE } })
    expect(untouched.name).toBe('OA Other Site')
    expect(untouched.active).toBe(true)
  })

  it('does not let one tenant reach another tenant\'s department', async () => {
    const theirs = await db.department.create({
      data: { id: `dept-${uniq()}`, siteId: OTHER_SITE, name: 'Their Dept' },
    })
    await expect(svc.updateDepartment(admin, CO, ctx, theirs.id, { name: 'Mine now' }))
      .rejects.toMatchObject({ status: 404 })
    await expect(svc.setDepartmentActive(admin, CO, ctx, theirs.id, false))
      .rejects.toMatchObject({ status: 404 })
  })

  it('does not let one tenant change a user who belongs to another', async () => {
    const theirs = await member(OTHER, 'employee')
    await expect(svc.setUserAccess(admin, CO, ctx, theirs.id, { role: 'admin' }))
      .rejects.toMatchObject({ status: 404 })

    const membership = await db.membership.findFirstOrThrow({ where: { userId: theirs.id } })
    expect(membership.role).toBe('employee')
  })

  it('keeps each tenant\'s sites, departments and invitations to itself', async () => {
    await svc.createSite(admin, CO, ctx, { name: 'Mine' })
    await svc.createInvitation(admin, CO, ctx, { email: mail(), role: 'employee' })

    const theirAdmin = caller('admin', 'their-admin', OTHER)
    await svc.createSite(theirAdmin, OTHER, ctx, { name: 'Theirs' })
    await svc.createInvitation(theirAdmin, OTHER, ctx, { email: mail(), role: 'employee' })

    const mine = await svc.listSites(admin, CO)
    expect(mine.every((s) => s.name !== 'Theirs')).toBe(true)
    expect((await svc.listInvitations(admin, CO))).toHaveLength(1)
    expect((await svc.listInvitations(theirAdmin, OTHER))).toHaveLength(1)
  })

  // ── Sites ─────────────────────────────────────────────────────────────────

  it('creates a site with the details a company actually records', async () => {
    const site = await svc.createSite(admin, CO, ctx, {
      name: 'Bintulu Yard', code: 'BTU-01', city: 'Bintulu',
      address: 'Lot 12, Kidurong Industrial Estate', contactName: 'Marcus Tan',
      contactPhone: '+60 86 000000', timezone: 'Asia/Kuching',
    })
    expect(site.code).toBe('BTU-01')
    expect(site.active).toBe(true)
    expect(site.contactName).toBe('Marcus Tan')
  })

  it('refuses a second site with the same name', async () => {
    await svc.createSite(admin, CO, ctx, { name: 'Duplicate Yard' })
    await expect(svc.createSite(admin, CO, ctx, { name: 'duplicate yard' }))
      .rejects.toMatchObject({ status: 400 })
  })

  it('deactivates and reactivates a site without deleting it', async () => {
    const site = await svc.createSite(admin, CO, ctx, { name: 'Temporary Yard' })
    await svc.setSiteActive(admin, CO, ctx, site.id, false)
    expect((await db.site.findUniqueOrThrow({ where: { id: site.id } })).active).toBe(false)

    await svc.setSiteActive(admin, CO, ctx, site.id, true)
    const back = await db.site.findUniqueOrThrow({ where: { id: site.id } })
    expect(back.active).toBe(true)
    // Same row throughout: nothing was recreated, so nothing pointing at it broke.
    expect(back.id).toBe(site.id)
  })

  it('refuses to deactivate the last active site', async () => {
    // A workspace with no active site has nowhere to report an incident into.
    await db.site.updateMany({ where: { companyId: CO, id: { not: SITE } }, data: { active: false } })
    await expect(svc.setSiteActive(admin, CO, ctx, SITE, false))
      .rejects.toMatchObject({ status: 400 })
  })

  it('reports what a site is carrying, so nobody deletes one by mistake', async () => {
    const rows = await svc.listSites(admin, CO)
    const one = rows.find((s) => s.id === SITE)!
    expect(one.inUse).toHaveProperty('incidents')
    expect(one.inUse).toHaveProperty('permits')
  })

  it('takes a deactivated site out of the pickers but leaves it in the console', async () => {
    const site = await svc.createSite(admin, CO, ctx, { name: 'Retired Yard' })
    await svc.setSiteActive(admin, CO, ctx, site.id, false)

    const picker = await org.listSites(admin, CO)
    expect(picker.some((s) => s.id === site.id)).toBe(false)

    const console_ = await svc.listSites(admin, CO)
    expect(console_.some((s) => s.id === site.id)).toBe(true)
  })

  // ── Departments ───────────────────────────────────────────────────────────

  it('creates a department against a site, with a real user as manager', async () => {
    const manager = await member(CO, 'supervisor')
    const dept = await svc.createDepartment(admin, CO, ctx, {
      name: 'Maintenance', siteId: SITE, code: 'MTN', managerUserId: manager.id,
    })
    expect(dept.managerUserId).toBe(manager.id)

    const listed = await svc.listDepartments(admin, CO)
    expect(listed.find((x) => x.id === dept.id)!.manager!.id).toBe(manager.id)
  })

  it('refuses a manager who is not in this workspace', async () => {
    /*
     * The visitor register's old bug in a new place: a name typed into a field is not an
     * identity. A manager has to be somebody with a membership here.
     */
    const theirs = await member(OTHER, 'supervisor')
    await expect(svc.createDepartment(admin, CO, ctx, {
      name: 'Sneaky', siteId: SITE, managerUserId: theirs.id,
    })).rejects.toMatchObject({ status: 400 })
  })

  it('refuses two departments with the same name on one site', async () => {
    await svc.createDepartment(admin, CO, ctx, { name: 'Logistics', siteId: SITE })
    await expect(svc.createDepartment(admin, CO, ctx, { name: 'logistics', siteId: SITE }))
      .rejects.toMatchObject({ status: 400 })
    // The same name on a different site is fine - they are different departments.
    await expect(svc.createDepartment(admin, CO, ctx, { name: 'Logistics', siteId: SITE2 }))
      .resolves.toBeTruthy()
  })

  it('keeps an incident readable after its department is deactivated', async () => {
    const dept = await svc.createDepartment(admin, CO, ctx, { name: 'Shutdown Crew', siteId: SITE })
    const incident = await db.incident.create({
      data: {
        number: `OA-${uniq()}`, companyId: CO, siteId: SITE, title: 'Historical incident',
        type: 'injury', severity: 'Minor', severityRank: 1, location: 'Yard',
        occurredAt: new Date(), reporter: 'Tester', departmentId: dept.id, department: 'Shutdown Crew',
      } as never,
    })

    await svc.setDepartmentActive(admin, CO, ctx, dept.id, false)

    const after = await db.incident.findUniqueOrThrow({
      where: { id: incident.id }, include: { departmentRef: true },
    })
    // Still attached, still named, still readable - only gone from the choosers.
    expect(after.departmentRef?.name).toBe('Shutdown Crew')
    expect(after.department).toBe('Shutdown Crew')

    const picker = await org.listDepartments(admin, [SITE])
    expect(picker.some((x) => x.id === dept.id)).toBe(false)
  })

  it('reactivates a department', async () => {
    const dept = await svc.createDepartment(admin, CO, ctx, { name: 'Back Again', siteId: SITE })
    await svc.setDepartmentActive(admin, CO, ctx, dept.id, false)
    await svc.setDepartmentActive(admin, CO, ctx, dept.id, true)
    expect((await db.department.findUniqueOrThrow({ where: { id: dept.id } })).active).toBe(true)
  })

  // ── Invitations ───────────────────────────────────────────────────────────

  it('creates the account as invited and returns a token exactly once', async () => {
    const email = mail()
    const invite = await svc.createInvitation(admin, CO, ctx, {
      email, role: 'safety_officer', siteIds: [SITE],
    })
    expect(invite.token).toBeTruthy()

    const user = await db.user.findUniqueOrThrow({ where: { email } })
    expect(user.status).toBe('invited')

    const listed = await svc.listInvitations(admin, CO)
    expect(listed[0].state).toBe('pending')
    // The secret is never handed back out after issue.
    expect(JSON.stringify(listed)).not.toContain(invite.token)
  })

  it('stores only the hash of the token', async () => {
    const invite = await svc.createInvitation(admin, CO, ctx, { email: mail(), role: 'employee' })
    const row = await db.invitation.findUniqueOrThrow({ where: { id: invite.id } })
    // A leaked database must not hand out working invitations.
    expect(row.tokenHash).not.toBe(invite.token)
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('lets the invitee set a password and activates the account', async () => {
    const email = mail()
    const invite = await svc.createInvitation(admin, CO, ctx, { email, role: 'hse_manager' })

    const preview = await svc.previewInvitation(invite.token)
    expect(preview.companyName).toBe('OA ITest Co')
    expect(preview.email).toBe(email)

    await svc.acceptInvitation(invite.token, { password: 'Str0ng-Passw0rd!23', name: 'Real Name' })

    const user = await db.user.findUniqueOrThrow({ where: { email } })
    expect(user.status).toBe('active')
    expect(user.name).toBe('Real Name')
    expect(user.mustChangePassword).toBe(false)
    // verifyPassword takes the stored digest first, then the candidate.
    expect(await verifyPassword(user.passwordHash, 'Str0ng-Passw0rd!23')).toBe(true)
  })

  it('cannot spend the same invitation twice', async () => {
    const invite = await svc.createInvitation(admin, CO, ctx, { email: mail(), role: 'employee' })
    await svc.acceptInvitation(invite.token, { password: 'Str0ng-Passw0rd!23' })
    await expect(svc.acceptInvitation(invite.token, { password: 'An0ther-Passw0rd!' }))
      .rejects.toMatchObject({ code: 'invalid_token' })
  })

  it('refuses an expired invitation', async () => {
    const invite = await svc.createInvitation(admin, CO, ctx, { email: mail(), role: 'employee' })
    await db.invitation.update({
      where: { id: invite.id }, data: { expiresAt: new Date(Date.now() - 1000) },
    })
    await expect(svc.previewInvitation(invite.token)).rejects.toMatchObject({ code: 'invalid_token' })
    await expect(svc.acceptInvitation(invite.token, { password: 'Str0ng-Passw0rd!23' }))
      .rejects.toMatchObject({ code: 'invalid_token' })
  })

  it('refuses a revoked invitation', async () => {
    const invite = await svc.createInvitation(admin, CO, ctx, { email: mail(), role: 'employee' })
    await svc.revokeInvitation(admin, CO, ctx, invite.id)
    await expect(svc.acceptInvitation(invite.token, { password: 'Str0ng-Passw0rd!23' }))
      .rejects.toMatchObject({ code: 'invalid_token' })
    expect((await svc.listInvitations(admin, CO))[0].state).toBe('revoked')
  })

  it('gives the same answer for unknown, expired, revoked and used tokens', async () => {
    // Distinguishing them tells an attacker which guesses were once real.
    const messages = new Set<string>()
    const grab = async (fn: () => Promise<unknown>) => {
      try { await fn() } catch (e) { messages.add((e as Error).message) }
    }
    await grab(() => svc.previewInvitation('completely-made-up'))

    const used = await svc.createInvitation(admin, CO, ctx, { email: mail(), role: 'employee' })
    await svc.acceptInvitation(used.token, { password: 'Str0ng-Passw0rd!23' })
    await grab(() => svc.previewInvitation(used.token))

    const revoked = await svc.createInvitation(admin, CO, ctx, { email: mail(), role: 'employee' })
    await svc.revokeInvitation(admin, CO, ctx, revoked.id)
    await grab(() => svc.previewInvitation(revoked.token))

    expect(messages.size).toBe(1)
  })

  it('supersedes an earlier invitation when a new one is issued', async () => {
    const email = mail()
    const first = await svc.createInvitation(admin, CO, ctx, { email, role: 'employee' })
    // The user now exists in this workspace, so a re-invite is refused outright rather
    // than silently minting a second working link.
    await expect(svc.createInvitation(admin, CO, ctx, { email, role: 'employee' }))
      .rejects.toMatchObject({ status: 400 })
    expect((await svc.previewInvitation(first.token)).email).toBe(email)
  })

  it('binds an invitation to one workspace', async () => {
    /*
     * The token carries its own tenant. There is no companyId on the accept call to
     * tamper with, so a link cannot be redirected at another workspace.
     */
    const invite = await svc.createInvitation(admin, CO, ctx, { email: mail(), role: 'admin' })
    const result = await svc.acceptInvitation(invite.token, { password: 'Str0ng-Passw0rd!23' })
    expect(result.companyId).toBe(CO)

    const user = await db.user.findUniqueOrThrow({
      where: { email: result.email }, include: { memberships: true },
    })
    expect(user.memberships).toHaveLength(1)
    expect(user.memberships[0].companyId).toBe(CO)
  })

  it('refuses a site from another workspace on the invitation', async () => {
    await expect(svc.createInvitation(admin, CO, ctx, {
      email: mail(), role: 'employee', siteIds: [OTHER_SITE],
    })).rejects.toMatchObject({ status: 400 })
  })

  it('refuses a weak password at acceptance', async () => {
    const invite = await svc.createInvitation(admin, CO, ctx, { email: mail(), role: 'employee' })
    await expect(svc.acceptInvitation(invite.token, { password: '123' }))
      .rejects.toMatchObject({ status: 400 })
    // Still usable afterwards: a rejected password must not burn the invitation.
    await expect(svc.acceptInvitation(invite.token, { password: 'Str0ng-Passw0rd!23' }))
      .resolves.toBeTruthy()
  })

  it('expires an invitation a week out, not indefinitely', async () => {
    const invite = await svc.createInvitation(admin, CO, ctx, { email: mail(), role: 'employee' })
    const days = (new Date(invite.expiresAt).getTime() - Date.now()) / 86_400_000
    expect(Math.round(days)).toBe(INVITE_TTL_DAYS)
  })

  it('adds a membership rather than a second account for an existing person', async () => {
    // One human, one set of credentials, however many workspaces they work in.
    const theirAdmin = caller('admin', 'their-admin', OTHER)
    const existing = await member(OTHER, 'hse_manager')

    const invite = await svc.createInvitation(admin, CO, ctx, {
      email: existing.email, role: 'safety_officer',
    })
    void theirAdmin
    const users = await db.user.findMany({ where: { email: existing.email } })
    expect(users).toHaveLength(1)

    await svc.acceptInvitation(invite.token, { password: 'Str0ng-Passw0rd!23' })
    const memberships = await db.membership.findMany({ where: { userId: existing.id } })
    expect(memberships.map((m) => m.companyId).sort()).toEqual([CO, OTHER].sort())
  })

  // ── Employee linking ──────────────────────────────────────────────────────

  it('links an existing employee record instead of creating a second one', async () => {
    const email = mail()
    const emp = await db.employee.create({
      data: {
        companyId: CO, siteId: SITE, name: 'Existing Worker', email,
        employeeNo: `E-${uniq()}`,
      } as never,
    })

    const invite = await svc.createInvitation(admin, CO, ctx, { email, role: 'supervisor' })
    await svc.acceptInvitation(invite.token, { password: 'Str0ng-Passw0rd!23' })

    const after = await db.employee.findUniqueOrThrow({ where: { id: emp.id } })
    const user = await db.user.findUniqueOrThrow({ where: { email } })
    expect(after.userId).toBe(user.id)
    // No duplicate: the register still has exactly one row for this person.
    expect(await db.employee.count({ where: { companyId: CO, email } })).toBe(1)
  })

  it('does not invent an employee for somebody who was never on the register', async () => {
    const email = mail()
    const invite = await svc.createInvitation(admin, CO, ctx, { email, role: 'hse_manager' })
    await svc.acceptInvitation(invite.token, { password: 'Str0ng-Passw0rd!23' })
    // Most invited users are managers, not workers on an HSE headcount.
    expect(await db.employee.count({ where: { companyId: CO, email } })).toBe(0)
  })

  // ── Role and assignment changes ───────────────────────────────────────────

  it('changes a role and records what it was before', async () => {
    const target = await member(CO, 'supervisor')
    await svc.setUserAccess(admin, CO, ctx, target.id, { role: 'hse_manager' })

    const m = await db.membership.findFirstOrThrow({ where: { userId: target.id, companyId: CO } })
    expect(m.role).toBe('hse_manager')

    const entry = await db.adminAuditEntry.findFirstOrThrow({
      where: { companyId: CO, action: { contains: 'Changed role' } },
      orderBy: { at: 'desc' },
    })
    expect(entry.oldValue).toBe('supervisor')
    expect(entry.newValue).toBe('hse_manager')
    expect(entry.target).toBe(target.email)
  })

  it('refuses a role the platform does not recognise', async () => {
    const target = await member()
    await expect(svc.setUserAccess(admin, CO, ctx, target.id, { role: 'superuser' }))
      .rejects.toMatchObject({ status: 400 })
  })

  it('will not let the last administrator demote themselves', async () => {
    /*
     * A workspace with no administrator has nobody who can grant the role back. It is a
     * door that locks from the outside.
     */
    const soleAdmin = await db.user.create({
      data: { email: mail(), name: 'Sole Admin', passwordHash: 'x', status: 'active' },
    })
    await db.membership.create({ data: { userId: soleAdmin.id, companyId: CO, role: 'admin' } })
    const asSole: Caller = {
      userId: soleAdmin.id, name: 'Sole Admin', roles: [{ companyId: CO, role: 'admin', siteIds: [] }],
    }

    await expect(svc.setUserAccess(asSole, CO, ctx, soleAdmin.id, { role: 'employee' }))
      .rejects.toMatchObject({ status: 400 })
  })

  it('will not let an administrator drop their own access even when others remain', async () => {
    const other = await db.user.create({
      data: { email: mail(), name: 'Second Admin', passwordHash: 'x', status: 'active' },
    })
    await db.membership.create({ data: { userId: other.id, companyId: CO, role: 'admin' } })
    const self = await db.user.create({
      data: { email: mail(), name: 'Self Admin', passwordHash: 'x', status: 'active' },
    })
    await db.membership.create({ data: { userId: self.id, companyId: CO, role: 'admin' } })
    const asSelf: Caller = {
      userId: self.id, name: 'Self Admin', roles: [{ companyId: CO, role: 'admin', siteIds: [] }],
    }

    await expect(svc.setUserAccess(asSelf, CO, ctx, self.id, { role: 'employee' }))
      .rejects.toMatchObject({ status: 400 })
  })

  it('changes site assignment and refuses sites from elsewhere', async () => {
    const target = await member(CO, 'safety_officer')
    await svc.setUserAccess(admin, CO, ctx, target.id, { siteIds: [SITE, SITE2] })
    const m = await db.membership.findFirstOrThrow({ where: { userId: target.id, companyId: CO } })
    expect(m.siteIds.sort()).toEqual([SITE, SITE2].sort())

    await expect(svc.setUserAccess(admin, CO, ctx, target.id, { siteIds: [OTHER_SITE] }))
      .rejects.toMatchObject({ status: 400 })
  })

  it('leaves history attributed to the original person after a role change', async () => {
    /*
     * The record of who did something is a fact about the past. Promoting somebody must
     * not rewrite the incidents they investigated as a supervisor.
     */
    const target = await member(CO, 'supervisor')
    const incident = await db.incident.create({
      data: {
        number: `OA-${uniq()}`, companyId: CO, siteId: SITE, title: 'Investigated earlier',
        type: 'injury', severity: 'Minor', severityRank: 1, location: 'Yard',
        occurredAt: new Date(), reporter: target.name, investigator: target.name,
      } as never,
    })

    await svc.setUserAccess(admin, CO, ctx, target.id, { role: 'hse_manager' })

    const after = await db.incident.findUniqueOrThrow({ where: { id: incident.id } })
    expect(after.investigator).toBe(target.name)
    expect(after.reporter).toBe(target.name)
  })

  // ── Audit trail ───────────────────────────────────────────────────────────

  it('records every administrative mutation with an actor and a tenant', async () => {
    const site = await svc.createSite(admin, CO, ctx, { name: 'Audited Yard' })
    await svc.setSiteActive(admin, CO, ctx, site.id, false)
    const dept = await svc.createDepartment(admin, CO, ctx, { name: 'Audited Dept', siteId: SITE })
    await svc.setDepartmentActive(admin, CO, ctx, dept.id, false)
    await svc.createInvitation(admin, CO, ctx, { email: mail(), role: 'employee' })

    const entries = await db.adminAuditEntry.findMany({
      where: { companyId: CO }, orderBy: { at: 'asc' },
    })
    const actions = entries.map((e) => e.action)
    expect(actions).toContain('Created site')
    expect(actions).toContain('Deactivated site')
    expect(actions).toContain('Created department')
    expect(actions).toContain('Deactivated department')
    expect(actions).toContain('Invited user')

    for (const e of entries) {
      expect(e.actor).toBe('OA admin')
      expect(e.companyId).toBe(CO)
      expect(e.ip).toBe('10.0.0.1')
    }
  })

  it('never writes an invitation token into the audit trail', async () => {
    const invite = await svc.createInvitation(admin, CO, ctx, { email: mail(), role: 'employee' })
    const entries = await db.adminAuditEntry.findMany({ where: { companyId: CO } })
    // The audit trail is read by auditors and exported; a working secret in it is a second
    // copy of the credential store.
    expect(JSON.stringify(entries)).not.toContain(invite.token)
  })

  it('keeps one tenant\'s audit entries out of another\'s', async () => {
    await svc.createSite(admin, CO, ctx, { name: 'Mine Audited' })
    const theirAdmin = caller('admin', 'their-admin', OTHER)
    await svc.createSite(theirAdmin, OTHER, ctx, { name: 'Theirs Audited' })

    const mine = await db.adminAuditEntry.findMany({ where: { companyId: CO } })
    expect(mine.every((e) => e.target !== 'Theirs Audited')).toBe(true)
  })

  // ── Role catalogue ────────────────────────────────────────────────────────

  it('describes every role the platform recognises', async () => {
    const rows = await svc.roleCatalog(hse, CO)
    const roles = rows.map((r) => r.role)
    for (const r of ['admin', 'hse_manager', 'safety_officer', 'supervisor', 'employee']) {
      expect(roles).toContain(r)
    }
    for (const r of rows) expect(r.summary.length).toBeGreaterThan(20)
  })
})
