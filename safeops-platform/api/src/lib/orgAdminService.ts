import { randomBytes } from 'node:crypto'
import type { PrismaClient, Prisma, Role } from '@prisma/client'
import type { Caller } from './incidentService.js'
import { writeAdminAudit, type AdminContext } from './adminAudit.js'
import { hashResetToken } from './tokens.js'
import { hashPassword, validatePasswordStrength } from './password.js'
import { env } from '../env.js'
import { getEmailProvider } from './email/index.js'
import { EmailProviderError } from './email/provider.js'
import { buildInvitationEmail } from './email/invitationEmail.js'

/**
 * Organisation administration: sites, departments and invitations.
 *
 * Sits alongside AdminService, which already owns users, roles, org settings and the audit
 * trail. What lives here is the structure a company configures before anyone works in it,
 * plus the one piece the console was missing: an invitation an invited account can actually
 * use. Before this, creating a user with status "invited" produced an account with a random
 * password nobody held - visible in the console, impossible to sign into.
 *
 * Nothing here deletes. A site or department with history behind it is deactivated, because
 * an incident that points at a site which no longer exists is an incident nobody can read.
 */

export class OrgAdminError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message)
    this.name = 'OrgAdminError'
  }
}

/** Seven days. Long enough for somebody on leave, short enough to expire before it leaks. */
export const INVITE_TTL_DAYS = 7

/**
 * How often one invitation may be re-sent, and how many times in total.
 *
 * The cooldown stops a double-click becoming two emails; the ceiling stops an invitation
 * nobody is ever going to accept from being used to post mail at somebody indefinitely.
 * Both are per invitation, on top of the request-rate limit at the route.
 */
export const RESEND_COOLDOWN_SECONDS = 60
export const MAX_SENDS_PER_INVITATION = 5

/** Delivery, in ReportRun's vocabulary. One set of words for "did the email go". */
export type InvitationDelivery = 'created' | 'email_pending' | 'sent' | 'failed'

/** The acceptance link, built from the one configured public address. */
export function invitationUrl(token: string): string {
  return `${env.appUrl}/accept-invitation/${token}`
}

const ROLES: Role[] = ['ceo', 'admin', 'hse_manager', 'safety_officer', 'supervisor', 'employee']

/**
 * What each role may do, in one place, for the console to display.
 *
 * Descriptive, not enforcing: the enforcement lives in each module's own guard, and this
 * exists so an administrator choosing a role can see what they are granting rather than
 * guessing from its name.
 */
export const ROLE_CATALOG: { role: Role; label: string; summary: string }[] = [
  {
    role: 'admin',
    label: 'Organisation Administrator',
    summary: 'Manages the organisation, its sites, departments and people. Full access '
      + 'within this workspace, including the audit trail.',
  },
  {
    role: 'ceo',
    label: 'Executive',
    summary: 'Sees everything across every site, and cannot change the configuration.',
  },
  {
    role: 'hse_manager',
    label: 'HSE Manager',
    summary: 'Runs the safety operation across all sites: incidents, investigations, '
      + 'permits, corrective actions, equipment, visitors and reports.',
  },
  {
    role: 'safety_officer',
    label: 'Safety Officer',
    summary: 'Day-to-day safety work on their assigned sites, including permit review '
      + 'and running reports.',
  },
  {
    role: 'supervisor',
    label: 'Supervisor',
    summary: 'Supervisor review on permits and the work their own team owns. Sees the '
      + 'incidents and actions for their assigned sites.',
  },
  {
    role: 'employee',
    label: 'Employee',
    summary: 'Reports incidents and near misses, and works the corrective actions '
      + 'assigned to them. Sees only their own records.',
  },
]

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/

export class OrgAdminService {
  constructor(private db: PrismaClient) {}

  private membership(caller: Caller, companyId: string) {
    const m = caller.roles.find((r) => r.companyId === companyId)
    if (!m) {
      throw new OrgAdminError('forbidden', 'You do not have access to this workspace.', 403)
    }
    return m
  }

  /**
   * Configuring the organisation is administrator-only.
   *
   * Deliberately the same gate AdminService uses rather than a softer one: whoever can add
   * a site or change a role can reshape who sees what.
   */
  private requireAdmin(caller: Caller, companyId: string) {
    const m = this.membership(caller, companyId)
    if (m.role !== 'admin') {
      throw new OrgAdminError('forbidden', 'This action requires an Administrator.', 403)
    }
    return m
  }

  private log(
    caller: Caller, companyId: string, ctx: AdminContext,
    action: string, target: string, oldValue?: string, newValue?: string,
  ) {
    return writeAdminAudit(
      this.db, caller, companyId, ctx, action, 'organisation', target, oldValue, newValue,
    )
  }

  // ── Sites ─────────────────────────────────────────────────────────────────

  /**
   * Every site in the workspace, including deactivated ones.
   *
   * The admin view deliberately shows inactive sites - they are what an administrator
   * came here to reactivate, and hiding them makes them unreachable.
   */
  async listSites(caller: Caller, companyId: string) {
    this.requireAdmin(caller, companyId)
    const rows = await this.db.site.findMany({
      where: { companyId },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: {
        _count: { select: { incidents: true, permits: true, assets: true, employees: true, departments: true } },
      },
    })
    return rows.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      short: s.short,
      city: s.city,
      address: s.address,
      timezone: s.timezone,
      contactName: s.contactName,
      contactPhone: s.contactPhone,
      headcount: s.headcount,
      active: s.active,
      /* What would be orphaned if this were ever deleted. Shown, not guessed at. */
      inUse: {
        incidents: s._count.incidents,
        permits: s._count.permits,
        assets: s._count.assets,
        employees: s._count.employees,
        departments: s._count.departments,
      },
    }))
  }

  async createSite(caller: Caller, companyId: string, ctx: AdminContext, input: {
    name: string; code?: string; city?: string; address?: string
    timezone?: string; contactName?: string; contactPhone?: string
  }) {
    this.requireAdmin(caller, companyId)
    const name = input.name?.trim()
    if (!name) throw new OrgAdminError('validation', 'The site needs a name.')

    const clash = await this.db.site.findFirst({
      where: { companyId, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    })
    if (clash) throw new OrgAdminError('validation', 'A site with that name already exists.')

    const site = await this.db.site.create({
      data: {
        // Site ids are strings without a default in this schema, so one is minted here.
        id: `site-${randomBytes(6).toString('hex')}`,
        companyId,
        name,
        code: input.code?.trim() ?? '',
        short: (input.code?.trim() || name).slice(0, 6).toUpperCase(),
        city: input.city?.trim() ?? '',
        address: input.address?.trim() ?? '',
        timezone: input.timezone?.trim() || 'Asia/Kuching',
        contactName: input.contactName?.trim() ?? '',
        contactPhone: input.contactPhone?.trim() ?? '',
      },
    })
    await this.log(caller, companyId, ctx, 'Created site', site.name, undefined, site.code || site.name)
    return site
  }

  async updateSite(caller: Caller, companyId: string, ctx: AdminContext, id: string, patch: {
    name?: string; code?: string; city?: string; address?: string
    timezone?: string; contactName?: string; contactPhone?: string
  }) {
    this.requireAdmin(caller, companyId)
    const site = await this.findSite(companyId, id)

    const data: Prisma.SiteUpdateInput = {}
    if (patch.name !== undefined) {
      const name = patch.name.trim()
      if (!name) throw new OrgAdminError('validation', 'The site needs a name.')
      const clash = await this.db.site.findFirst({
        where: { companyId, name: { equals: name, mode: 'insensitive' }, id: { not: id } },
        select: { id: true },
      })
      if (clash) throw new OrgAdminError('validation', 'A site with that name already exists.')
      data.name = name
    }
    for (const k of ['code', 'city', 'address', 'contactName', 'contactPhone'] as const) {
      if (patch[k] !== undefined) data[k] = patch[k]!.trim()
    }
    if (patch.timezone !== undefined) data.timezone = patch.timezone.trim() || 'Asia/Kuching'

    const updated = await this.db.site.update({ where: { id }, data })
    await this.log(caller, companyId, ctx, 'Updated site', updated.name, site.name, updated.name)
    return updated
  }

  /**
   * Turns a site off or back on. Never deletes.
   *
   * A site is referenced by incidents, permits, assets and employees. Removing the row
   * would either fail on a foreign key or, worse, take that history with it - so the only
   * off-switch offered is one that can be switched back.
   */
  async setSiteActive(
    caller: Caller, companyId: string, ctx: AdminContext, id: string, active: boolean,
  ) {
    this.requireAdmin(caller, companyId)
    const site = await this.findSite(companyId, id)
    // Already in the requested state: nothing to write, nothing to audit, same shape back.
    if (site.active === active) return { ...site, stillAssigned: 0 }

    if (!active) {
      const remaining = await this.db.site.count({ where: { companyId, active: true } })
      if (remaining <= 1) {
        // A workspace with no active site cannot have an incident reported into it.
        throw new OrgAdminError(
          'validation', 'This is the last active site. Add another before deactivating it.',
        )
      }
    }

    const updated = await this.db.site.update({ where: { id }, data: { active } })
    await this.log(
      caller, companyId, ctx, active ? 'Reactivated site' : 'Deactivated site', site.name,
      site.active ? 'active' : 'inactive', active ? 'active' : 'inactive',
    )

    /*
     * Who is still pointed at this site.
     *
     * Their assignment is deliberately left in place: rewriting somebody's scope as a side
     * effect of an administrator tidying up the site list is how people quietly gain or
     * lose visibility nobody decided to give them. What changes is that no new assignment
     * can name it - see checkAssignableSites - and the count is reported so the
     * administrator can reassign deliberately rather than discover it later.
     */
    const stillAssigned = active ? 0 : await this.db.membership.count({
      where: { companyId, siteIds: { has: id } },
    })

    return { ...updated, stillAssigned }
  }

  private async findSite(companyId: string, id: string) {
    const site = await this.db.site.findFirst({ where: { id, companyId } })
    /*
     * Scoped by company in the same query rather than fetched then checked. A site in
     * another tenant is "not found", which is also all the caller is told - a 403 here
     * would confirm the id exists somewhere.
     */
    if (!site) throw new OrgAdminError('not_found', 'Site not found.', 404)
    return site
  }

  // ── Departments ───────────────────────────────────────────────────────────

  async listDepartments(caller: Caller, companyId: string, siteId?: string) {
    this.requireAdmin(caller, companyId)
    const rows = await this.db.department.findMany({
      // Departments hang off a site, so the tenant filter goes through the relation.
      where: { site: { companyId }, ...(siteId ? { siteId } : {}) },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: {
        site: { select: { id: true, name: true } },
        manager: { select: { id: true, name: true, email: true, status: true } },
        _count: { select: { incidents: true, visitors: true, teams: true } },
      },
    })
    return rows.map((d) => ({
      id: d.id,
      name: d.name,
      code: d.code,
      active: d.active,
      siteId: d.siteId,
      siteName: d.site.name,
      /*
       * managerUserId is an accountability reference and nothing else - no routing, no
       * approvals, no notifications read it. So a manager whose account is deactivated is
       * stale rather than broken, and the honest thing is to show that rather than to
       * silently clear the field or block the deactivation.
       */
      manager: d.manager
        ? {
          id: d.manager.id,
          name: d.manager.name,
          email: d.manager.email,
          active: d.manager.status === 'active',
        }
        : null,
      inUse: { incidents: d._count.incidents, visitors: d._count.visitors, teams: d._count.teams },
    }))
  }

  async createDepartment(caller: Caller, companyId: string, ctx: AdminContext, input: {
    name: string; siteId: string; code?: string; managerUserId?: string | null
  }) {
    this.requireAdmin(caller, companyId)
    const name = input.name?.trim()
    if (!name) throw new OrgAdminError('validation', 'The department needs a name.')

    const site = await this.findSite(companyId, input.siteId)
    if (!site.active) {
      throw new OrgAdminError(
        'validation', `${site.name} is deactivated. Reactivate it before adding departments.`,
      )
    }
    const managerUserId = await this.checkManager(companyId, input.managerUserId)

    const clash = await this.db.department.findFirst({
      where: { siteId: input.siteId, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    })
    if (clash) {
      throw new OrgAdminError('validation', 'That site already has a department with this name.')
    }

    const dept = await this.db.department.create({
      data: {
        id: `dept-${randomBytes(6).toString('hex')}`,
        siteId: input.siteId,
        name,
        code: input.code?.trim() ?? '',
        managerUserId,
      },
      include: { site: { select: { name: true } } },
    })
    await this.log(
      caller, companyId, ctx, 'Created department', `${dept.site.name} / ${dept.name}`,
    )
    return dept
  }

  async updateDepartment(caller: Caller, companyId: string, ctx: AdminContext, id: string, patch: {
    name?: string; code?: string; managerUserId?: string | null
  }) {
    this.requireAdmin(caller, companyId)
    const dept = await this.findDepartment(companyId, id)

    const data: Prisma.DepartmentUpdateInput = {}
    if (patch.name !== undefined) {
      const name = patch.name.trim()
      if (!name) throw new OrgAdminError('validation', 'The department needs a name.')
      const clash = await this.db.department.findFirst({
        where: { siteId: dept.siteId, name: { equals: name, mode: 'insensitive' }, id: { not: id } },
        select: { id: true },
      })
      if (clash) {
        throw new OrgAdminError('validation', 'That site already has a department with this name.')
      }
      data.name = name
    }
    if (patch.code !== undefined) data.code = patch.code.trim()
    if (patch.managerUserId !== undefined) {
      const managerUserId = await this.checkManager(companyId, patch.managerUserId)
      data.manager = managerUserId ? { connect: { id: managerUserId } } : { disconnect: true }
    }

    const updated = await this.db.department.update({ where: { id }, data })
    await this.log(caller, companyId, ctx, 'Updated department', updated.name, dept.name, updated.name)
    return updated
  }

  /**
   * Turns a department off or back on.
   *
   * Deactivating hides it from pickers. The incidents, visitors and permits that already
   * name it keep reading correctly, which is the whole reason this is a flag rather than
   * a delete.
   */
  async setDepartmentActive(
    caller: Caller, companyId: string, ctx: AdminContext, id: string, active: boolean,
  ) {
    this.requireAdmin(caller, companyId)
    const dept = await this.findDepartment(companyId, id)
    const updated = await this.db.department.update({ where: { id }, data: { active } })
    await this.log(
      caller, companyId, ctx,
      active ? 'Reactivated department' : 'Deactivated department', dept.name,
      dept.active ? 'active' : 'inactive', active ? 'active' : 'inactive',
    )
    return updated
  }

  private async findDepartment(companyId: string, id: string) {
    const dept = await this.db.department.findFirst({ where: { id, site: { companyId } } })
    if (!dept) throw new OrgAdminError('not_found', 'Department not found.', 404)
    return dept
  }

  /** A manager must be a member of this workspace, not merely a user who exists. */
  private async checkManager(companyId: string, userId: string | null | undefined) {
    if (!userId) return null
    const m = await this.db.membership.findFirst({
      where: { userId, companyId }, select: { id: true },
    })
    if (!m) throw new OrgAdminError('validation', 'That person is not a member of this workspace.')
    return userId
  }

  // ── Invitations ───────────────────────────────────────────────────────────

  async listInvitations(caller: Caller, companyId: string) {
    this.requireAdmin(caller, companyId)
    const rows = await this.db.invitation.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { user: { select: { id: true, name: true, status: true } } },
    })

    /* Resolve names once for the whole page rather than per row. */
    const siteIds = [...new Set(rows.flatMap((r) => r.siteIds))]
    const deptIds = [...new Set(rows.map((r) => r.departmentId).filter(Boolean) as string[])]
    const [sites, depts] = await Promise.all([
      siteIds.length
        ? this.db.site.findMany({ where: { id: { in: siteIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      deptIds.length
        ? this.db.department.findMany({ where: { id: { in: deptIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
    ])
    const siteName = new Map(sites.map((x) => [x.id, x.name]))
    const deptName = new Map(depts.map((x) => [x.id, x.name]))

    const now = Date.now()
    return rows.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      siteIds: i.siteIds,
      siteNames: i.siteIds.map((id) => siteName.get(id)).filter(Boolean) as string[],
      departmentId: i.departmentId,
      departmentName: i.departmentId ? deptName.get(i.departmentId) ?? null : null,
      invitedBy: i.invitedBy,
      createdAt: i.createdAt.toISOString(),
      expiresAt: i.expiresAt.toISOString(),
      /* Delivery, separate from the invitation's own lifecycle. A failed email does not
       * make the invitation invalid - it makes it undelivered. */
      deliveryStatus: i.deliveryStatus as InvitationDelivery,
      sentAt: i.sentAt?.toISOString() ?? null,
      lastAttemptAt: i.lastAttemptAt?.toISOString() ?? null,
      failureReason: i.failureReason,
      provider: i.provider,
      attempts: i.attempts,
      maxSends: MAX_SENDS_PER_INVITATION,
      /*
       * Derived on read. A stored status needs a job to expire it, and any window where
       * that job had not run would show a dead invitation as live.
       */
      state: i.acceptedAt ? 'accepted'
        : i.revokedAt ? 'revoked'
          : i.expiresAt.getTime() < now ? 'expired' : 'pending',
      acceptedAt: i.acceptedAt?.toISOString() ?? null,
      userId: i.userId,
      userName: i.user.name,
      userStatus: i.user.status,
      // The token itself is never returned after issue, and never stored in the clear.
    }))
  }

  /**
   * Sites somebody can actually be assigned to.
   *
   * A deactivated site is on its way out of use; putting a new person on one gives them a
   * scope that resolves to nothing in the pickers. Existing assignments are deliberately
   * left alone - see setSiteActive.
   */
  private async checkAssignableSites(companyId: string, siteIds: string[] | undefined) {
    if (!siteIds?.length) return
    const rows = await this.db.site.findMany({
      where: { id: { in: siteIds }, companyId },
      select: { id: true, name: true, active: true },
    })
    if (rows.length !== siteIds.length) {
      throw new OrgAdminError('validation', 'One or more sites are not in this workspace.')
    }
    const inactive = rows.filter((r) => !r.active)
    if (inactive.length) {
      throw new OrgAdminError(
        'validation',
        `${inactive.map((r) => r.name).join(', ')} ${inactive.length === 1 ? 'is' : 'are'} `
        + 'deactivated. Reactivate the site before assigning anyone to it.',
      )
    }
  }

  /**
   * Hand an invitation to the configured email provider and record what happened.
   *
   * Every outcome is recorded, none is thrown. The invitation is already committed and
   * still works: a provider outage costs the recipient an email, not their way in, so the
   * administrator is told delivery failed and offered a resend rather than losing the
   * invitation along with the message.
   *
   * The attempt is written before the provider is contacted, which is what makes the
   * idempotency key distinct per send - the same pattern the scheduled reports use.
   */
  /*
   * Public so provisioning can reuse it. A new customer's first administrator gets exactly
   * the same email, the same delivery states and the same idempotency key as any other
   * invitee - the alternative was a second copy of all three living in the provisioning
   * service and drifting from this one.
   */
  async deliverInvitation(invitationId: string, rawToken: string) {
    const invite = await this.db.invitation.findUniqueOrThrow({
      where: { id: invitationId },
      include: { company: { select: { name: true } } },
    })

    const provider = getEmailProvider()
    if (!provider) {
      /*
       * Nothing is sent and nothing pretends otherwise. The invitation stays at "created",
       * which is exactly what it is, and the console shows the link for somebody to pass
       * on by hand.
       */
      await this.db.invitation.update({
        where: { id: invitationId },
        data: {
          deliveryStatus: 'created',
          failureReason: 'No email provider is configured, so no invitation email was sent. '
            + 'Set RESEND_API_KEY (or SMTP_URL) with REPORT_EMAIL_FROM to enable delivery.',
        },
      })
      return { delivered: false as const, status: 'created' as const, showLink: true }
    }

    const attempts = invite.attempts + 1
    await this.db.invitation.update({
      where: { id: invitationId },
      data: { deliveryStatus: 'email_pending', attempts, lastAttemptAt: new Date() },
    })

    const [sites, dept] = await Promise.all([
      invite.siteIds.length
        ? this.db.site.findMany({ where: { id: { in: invite.siteIds } }, select: { name: true } })
        : Promise.resolve([]),
      invite.departmentId
        ? this.db.department.findUnique({
          where: { id: invite.departmentId }, select: { name: true },
        })
        : Promise.resolve(null),
    ])

    const label = ROLE_CATALOG.find((r) => r.role === invite.role)?.label
      ?? invite.role.replace(/_/g, ' ')

    const message = buildInvitationEmail({
      companyName: invite.company.name,
      recipientEmail: invite.email,
      inviterName: invite.invitedBy,
      roleLabel: label,
      siteNames: sites.map((x) => x.name),
      departmentName: dept?.name ?? null,
      acceptUrl: invitationUrl(rawToken),
      expiresAt: invite.expiresAt,
    // Distinct per send, stable per attempt: a resend is a new email, a retry of one send
    // is recognised as the same message by a provider that de-duplicates.
    }, `safeops-invitation-${invitationId}-${attempts}`)

    try {
      const result = await provider.send(message)
      await this.db.invitation.update({
        where: { id: invitationId },
        data: {
          deliveryStatus: 'sent',
          messageId: result.messageId || null,
          sentAt: new Date(),
          failureReason: null,
          provider: provider.name,
        },
      })
      return { delivered: true as const, status: 'sent' as const, showLink: false }
    } catch (e) {
      const err = e instanceof EmailProviderError ? e : null
      const reason = err
        ? `${err.code}: ${err.message}`
        : (e as Error)?.message ?? 'Unknown mail error.'
      await this.db.invitation.update({
        where: { id: invitationId },
        data: {
          deliveryStatus: 'failed',
          failureReason: reason.slice(0, 400),
          provider: provider.name,
        },
      })
      /*
       * The link is surfaced on failure too. The invitation is valid and the administrator
       * needs some way to get it to the person while the mail problem is sorted out.
       */
      return { delivered: false as const, status: 'failed' as const, showLink: true }
    }
  }

  /**
   * Invite somebody into this workspace.
   *
   * Creates the account immediately so it appears as Invited with its role and sites
   * already settled, and issues a single-use secret that lets them set a password. The
   * secret is returned exactly once, here, and only its hash is kept.
   */
  async createInvitation(caller: Caller, companyId: string, ctx: AdminContext, input: {
    email: string; name?: string; role: string
    siteIds?: string[]; departmentId?: string | null
  }) {
    this.requireAdmin(caller, companyId)

    const email = input.email?.trim().toLowerCase()
    if (!email || !EMAIL.test(email)) {
      throw new OrgAdminError('validation', 'Enter a valid email address.')
    }
    if (!ROLES.includes(input.role as Role)) {
      throw new OrgAdminError('validation', 'Select a role the platform recognises.')
    }
    const role = input.role as Role

    await this.checkAssignableSites(companyId, input.siteIds)
    if (input.departmentId) await this.findDepartment(companyId, input.departmentId)

    const existing = await this.db.user.findUnique({
      where: { email },
      include: { memberships: { where: { companyId } } },
    })
    if (existing?.memberships.length) {
      throw new OrgAdminError('validation', 'That person is already in this workspace.')
    }
    /*
     * SafeOps staff do not join customer workspaces.
     *
     * Nothing prevented this before, and it happened: a platform administrator was invited
     * into a workspace as an ordinary admin, accepted, and from then on saw the SafeOps
     * customer console - every company on the deployment, their plans and the revenue
     * figure - in the sidebar of a customer's own account. Tenant isolation was never
     * breached, and that is the point: the danger is not a broken boundary but a person
     * holding both sides of it, one screen-share away from showing customer A the names of
     * customers B and C.
     *
     * Refused at the invitation rather than at acceptance so the administrator finds out
     * while they are still looking at the form, and refused by a database read rather than
     * anything the browser sent.
     */
    if (existing?.platformAdmin) {
      throw new OrgAdminError(
        'validation',
        'That address belongs to a SafeOps platform administrator, which cannot join a '
        + 'customer workspace. Use an ordinary work address for this person.',
      )
    }

    const rawToken = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000)

    const result = await this.db.$transaction(async (tx) => {
      let userId: string
      if (existing) {
        /*
         * The person already has a login for another workspace. They get a membership
         * here, not a second account - one human, one set of credentials.
         */
        userId = existing.id
        await tx.membership.create({
          data: { userId, companyId, role, siteIds: input.siteIds ?? [] },
        })
      } else {
        // Never a default or derivable password: the invitation is the only way in.
        const passwordHash = await hashPassword(randomBytes(32).toString('base64url'))
        const created = await tx.user.create({
          data: {
            email,
            name: input.name?.trim() || email.split('@')[0],
            passwordHash,
            status: 'invited',
            mustChangePassword: true,
            memberships: { create: { companyId, role, siteIds: input.siteIds ?? [] } },
          },
        })
        userId = created.id
      }

      // Any earlier open invitation for this address is superseded, so issuing a new one
      // invalidates the old link rather than leaving two working secrets.
      await tx.invitation.updateMany({
        where: { companyId, email, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date(), revokedBy: caller.name },
      })

      const invitation = await tx.invitation.create({
        data: {
          companyId,
          email,
          role,
          siteIds: input.siteIds ?? [],
          departmentId: input.departmentId ?? null,
          tokenHash: hashResetToken(rawToken),
          expiresAt,
          userId,
          invitedBy: caller.name,
        },
      })
      return { invitation, userId }
    })

    // The role is recorded; the token is not. An audit trail that carries working secrets
    // is a second copy of the credential store.
    await this.log(caller, companyId, ctx, 'Invited user', email, undefined, role)

    const delivery = await this.deliverInvitation(result.invitation.id, rawToken)
    await this.logDelivery(caller, companyId, ctx, result.invitation.id, email, 'Invitation')

    return {
      id: result.invitation.id,
      email,
      role,
      expiresAt: expiresAt.toISOString(),
      deliveryStatus: delivery.status,
      /*
       * The link comes back only when the email did not go. Once a provider has it, the
       * administrator has no need for the secret and there is no reason to put a working
       * credential through another system that might log it.
       */
      token: delivery.showLink ? rawToken : undefined,
    }
  }

  /**
   * Send an invitation again.
   *
   * The same invitation row is reused - one invite, one audit lineage - but the token is
   * replaced, because only its hash was ever stored and the original cannot be recovered.
   * Replacing it also supersedes the old link, so a resend never leaves two working ways in.
   */
  async resendInvitation(caller: Caller, companyId: string, ctx: AdminContext, id: string) {
    this.requireAdmin(caller, companyId)

    const invite = await this.db.invitation.findFirst({ where: { id, companyId } })
    if (!invite) throw new OrgAdminError('not_found', 'Invitation not found.', 404)
    if (invite.acceptedAt) {
      throw new OrgAdminError('validation', 'That invitation has already been accepted.')
    }
    if (invite.revokedAt) {
      throw new OrgAdminError('validation', 'That invitation was revoked. Invite them again.')
    }
    if (invite.attempts >= MAX_SENDS_PER_INVITATION) {
      throw new OrgAdminError(
        'validation',
        `This invitation has been sent ${MAX_SENDS_PER_INVITATION} times. `
        + 'Revoke it and invite them again if it is still needed.',
      )
    }
    const since = invite.lastAttemptAt
      ? (Date.now() - invite.lastAttemptAt.getTime()) / 1000
      : Infinity
    if (since < RESEND_COOLDOWN_SECONDS) {
      throw new OrgAdminError(
        'rate_limited',
        `Just sent. Wait ${Math.ceil(RESEND_COOLDOWN_SECONDS - since)} seconds before resending.`,
        429,
      )
    }

    // A fresh secret and a fresh window; the previous link stops working at this point.
    const rawToken = randomBytes(32).toString('base64url')
    await this.db.invitation.update({
      where: { id },
      data: {
        tokenHash: hashResetToken(rawToken),
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
      },
    })

    await this.log(caller, companyId, ctx, 'Resent invitation', invite.email)
    const delivery = await this.deliverInvitation(id, rawToken)
    await this.logDelivery(caller, companyId, ctx, id, invite.email, 'Invitation')

    return {
      id,
      email: invite.email,
      deliveryStatus: delivery.status,
      token: delivery.showLink ? rawToken : undefined,
    }
  }

  /**
   * Record what the provider did with a message.
   *
   * Separate from the "Invited user" entry so the audit trail distinguishes the decision to
   * invite somebody from whether the email reached them - they fail independently, and an
   * auditor asking "was this person actually notified" needs the second one.
   */
  private async logDelivery(
    caller: Caller, companyId: string, ctx: AdminContext,
    invitationId: string, email: string, what: string,
  ) {
    const row = await this.db.invitation.findUniqueOrThrow({
      where: { id: invitationId },
      select: { deliveryStatus: true, provider: true, failureReason: true, attempts: true },
    })
    const action = row.deliveryStatus === 'sent'
      ? `${what} email sent`
      : row.deliveryStatus === 'failed'
        ? `${what} email failed`
        : `${what} email not sent`
    await this.log(
      caller, companyId, ctx, action, email,
      undefined,
      // Provider name and reason only. Never the token - the trail is read and exported.
      [row.provider, row.failureReason].filter(Boolean).join(': ').slice(0, 400) || undefined,
    )
  }

  async revokeInvitation(caller: Caller, companyId: string, ctx: AdminContext, id: string) {
    this.requireAdmin(caller, companyId)
    const invite = await this.db.invitation.findFirst({ where: { id, companyId } })
    if (!invite) throw new OrgAdminError('not_found', 'Invitation not found.', 404)
    if (invite.acceptedAt) {
      throw new OrgAdminError('validation', 'That invitation has already been accepted.')
    }
    const updated = await this.db.invitation.update({
      where: { id },
      data: { revokedAt: new Date(), revokedBy: caller.name },
    })
    await this.log(caller, companyId, ctx, 'Revoked invitation', invite.email)
    return updated
  }

  /**
   * What an invitee is shown before they commit to a password.
   *
   * Deliberately thin: the workspace name and who invited them, so they can tell a real
   * invitation from a phishing link. No user list, no site list, nothing that would make
   * a guessed token worth guessing.
   */
  async previewInvitation(rawToken: string) {
    const invite = await this.openInvitation(rawToken)
    const company = await this.db.company.findUnique({
      where: { id: invite.companyId }, select: { name: true },
    })
    return {
      email: invite.email,
      companyName: company?.name ?? '',
      role: invite.role,
      invitedBy: invite.invitedBy,
      expiresAt: invite.expiresAt.toISOString(),
    }
  }

  /**
   * Accept an invitation and set a password.
   *
   * Public: the invitee has no session yet. The token is the only authority, so it is
   * consumed atomically - a concurrent second attempt updates zero rows and is refused
   * rather than setting the password twice.
   */
  async acceptInvitation(rawToken: string, input: { password: string; name?: string }) {
    const weak = validatePasswordStrength(input.password)
    if (weak) throw new OrgAdminError('validation', weak)

    const invite = await this.openInvitation(rawToken)

    /*
     * Checked again here, not only when the invitation was created.
     *
     * Invitations live for seven days, and platform-admin status can be granted inside that
     * window - so an address that was an ordinary one on Monday can be SafeOps staff by the
     * time the link is clicked on Thursday. Without this, that link would still hand them a
     * customer workspace membership. Cheap to check, and the alternative is a rule that
     * holds only at the moment somebody typed the address.
     */
    const target = await this.db.user.findUnique({
      where: { id: invite.userId },
      select: { platformAdmin: true },
    })
    if (target?.platformAdmin) {
      throw new OrgAdminError(
        'forbidden',
        'This invitation is for a SafeOps platform administrator, which cannot join a '
        + 'customer workspace. Ask your administrator to invite an ordinary work address.',
        403,
      )
    }

    const passwordHash = await hashPassword(input.password)

    await this.db.$transaction(async (tx) => {
      const consumed = await tx.invitation.updateMany({
        where: { id: invite.id, acceptedAt: null, revokedAt: null },
        data: { acceptedAt: new Date() },
      })
      if (consumed.count === 0) throw this.badToken()

      await tx.user.update({
        where: { id: invite.userId },
        data: {
          passwordHash,
          status: 'active',
          mustChangePassword: false,
          failedLoginCount: 0,
          lockedUntil: null,
          ...(input.name?.trim() ? { name: input.name.trim() } : {}),
        },
      })

      /*
       * Link the HSE employee record if one is already on the books for this address.
       *
       * A new Employee is deliberately NOT created: most invited users are managers who
       * were never on the worker register, and inventing a second record for somebody
       * already there is how a person ends up counted twice in a headcount.
       */
      const employee = await tx.employee.findFirst({
        where: {
          companyId: invite.companyId,
          userId: null,
          email: { equals: invite.email, mode: 'insensitive' },
        },
        select: { id: true },
      })
      if (employee) {
        await tx.employee.update({ where: { id: employee.id }, data: { userId: invite.userId } })
      }
    })

    return { companyId: invite.companyId, email: invite.email }
  }

  /** One message for unknown, expired, revoked and used tokens. */
  private badToken() {
    return new OrgAdminError(
      'invalid_token', 'This invitation is invalid, expired or already used.', 400,
    )
  }

  private async openInvitation(rawToken: string) {
    if (!rawToken) throw this.badToken()
    const invite = await this.db.invitation.findUnique({
      where: { tokenHash: hashResetToken(rawToken) },
    })
    if (!invite) throw this.badToken()
    if (invite.acceptedAt || invite.revokedAt) throw this.badToken()
    if (invite.expiresAt.getTime() < Date.now()) throw this.badToken()
    return invite
  }

  // ── User role and assignment ──────────────────────────────────────────────

  /**
   * Change what somebody may do, or where.
   *
   * Membership is the single source of truth for both, so this writes there rather than
   * anywhere else. Historical records are untouched: an incident investigated by a
   * supervisor keeps saying so after they become an HSE manager.
   */
  async setUserAccess(caller: Caller, companyId: string, ctx: AdminContext, userId: string, patch: {
    role?: string; siteIds?: string[]; departmentId?: string | null
  }) {
    const actor = this.requireAdmin(caller, companyId)

    const membership = await this.db.membership.findFirst({
      where: { userId, companyId },
      include: { user: { select: { id: true, name: true, email: true, status: true } } },
    })
    // Scoped by company: a user in another tenant is simply not found here.
    if (!membership) throw new OrgAdminError('not_found', 'User not found in this workspace.', 404)

    const data: Prisma.MembershipUpdateInput = {}

    if (patch.role !== undefined) {
      if (!ROLES.includes(patch.role as Role)) {
        throw new OrgAdminError('validation', 'Select a role the platform recognises.')
      }
      if (membership.role === 'admin' && patch.role !== 'admin') {
        const admins = await this.db.membership.count({
          where: { companyId, role: 'admin', user: { status: 'active' } },
        })
        /*
         * The last administrator cannot demote themselves. A workspace with no admin has
         * nobody who can grant the role back - a door that locks from the outside.
         */
        if (admins <= 1) {
          throw new OrgAdminError(
            'validation', 'This is the last Administrator. Promote somebody else first.',
          )
        }
      }
      if (membership.userId === caller.userId && patch.role !== 'admin') {
        throw new OrgAdminError(
          'validation', 'You cannot remove your own Administrator access. Ask another admin.',
        )
      }
      data.role = patch.role as Role
    }

    if (patch.siteIds !== undefined) {
      await this.checkAssignableSites(companyId, patch.siteIds)
      data.siteIds = patch.siteIds
    }

    const updated = await this.db.membership.update({ where: { id: membership.id }, data })

    if (patch.departmentId !== undefined) {
      // The department shown against a person lives on their user record; the register's
      // Employee row keeps its own, which is the operational one.
      const dept = patch.departmentId
        ? await this.findDepartment(companyId, patch.departmentId)
        : null
      await this.db.user.update({
        where: { id: userId }, data: { department: dept?.name ?? null },
      })
    }

    if (patch.role !== undefined && patch.role !== membership.role) {
      await this.log(
        caller, companyId, ctx,
        `Changed role from ${membership.role} to ${patch.role}`,
        membership.user.email, membership.role, patch.role,
      )
    }
    if (patch.siteIds !== undefined) {
      await this.log(
        caller, companyId, ctx, 'Changed site assignment', membership.user.email,
        membership.siteIds.join(', ') || 'all sites',
        patch.siteIds.join(', ') || 'all sites',
      )
    }
    if (patch.departmentId !== undefined) {
      await this.log(caller, companyId, ctx, 'Changed department', membership.user.email)
    }

    void actor
    return updated
  }

  /** The role catalogue, so the console can explain what it is granting. */
  async roleCatalog(caller: Caller, companyId: string) {
    this.membership(caller, companyId)
    return ROLE_CATALOG
  }
}
