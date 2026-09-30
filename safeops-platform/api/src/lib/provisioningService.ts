import { randomBytes } from 'node:crypto'
import type { PrismaClient, Role } from '@prisma/client'
import type { Caller } from './incidentService.js'
import { writeAdminAudit, type AdminContext } from './adminAudit.js'
import { hashResetToken } from './tokens.js'
import { hashPassword } from './password.js'
import { OrgAdminService, INVITE_TTL_DAYS, invitationUrl } from './orgAdminService.js'
import {
  COMPANY_STATUSES, SUBSCRIPTION_STATUSES, formatMyr, isSellablePlan, planFor,
} from './planCatalog.js'
import { DomainError } from './errors.js'

/**
 * Creating a customer.
 *
 * Until now a new company meant an operator pasting a `node -e` script into a production
 * shell. That is survivable for the first customer and indefensible at ten: it is
 * unaudited, unrepeatable, and one typo away from a half-created tenant.
 *
 * What this does NOT do is as important. It writes a company, one site, one administrator
 * and one invitation - the minimum a real customer needs to start. No demo incidents, no
 * sample permits, no placeholder audits. A safety register that arrives pre-filled with
 * invented records is worse than an empty one, because somebody eventually has to work out
 * which rows were real.
 */

export class ProvisioningError extends DomainError {
  constructor(code: string, message: string, status = 400) {
    super(code, message, status)
    this.name = 'ProvisioningError'
  }
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/

/**
 * A company id from its name.
 *
 * Ids are visible in URLs and support conversations, so they are readable rather than
 * random. Determinism is also the idempotency mechanism: submitting the same company twice
 * collides on the primary key and is refused, so a double-click cannot bill anybody twice.
 */
export function companyIdFrom(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    // NFKD splits an accented letter into the letter plus a combining mark. Dropping the
    // marks is the point of normalising at all - left in, they are non-alphanumeric and
    // become separators, so "Naive" with a circumflex would slug to "nai-ve".
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    // Trimmed after the length cut, not before: the cut itself can land on a separator.
    .slice(0, 40)
    .replace(/^-+|-+$/g, '')
  return slug || `company-${randomBytes(4).toString('hex')}`
}

export interface ProvisionInput {
  companyName: string
  plan: string
  industry?: string
  /** The first administrator. They receive the invitation, not a password. */
  adminName: string
  adminEmail: string
  /** The workspace their records hang off. One is required; more come later in-product. */
  siteName: string
  siteCity?: string
  siteTimezone?: string
}

export class ProvisioningService {
  private org: OrgAdminService

  constructor(private db: PrismaClient) {
    this.org = new OrgAdminService(db)
  }

  /**
   * Platform staff only.
   *
   * Read from the database rather than the session, on purpose. The access token carries
   * company memberships; it does not carry this flag, and minting a token that asserts
   * "platform administrator" would make revoking it a matter of waiting for expiry. One
   * extra read per provisioning call is nothing, and it means removing the flag takes
   * effect on the next request.
   */
  private async requirePlatformAdmin(caller: Caller) {
    const user = await this.db.user.findUnique({
      where: { id: caller.userId },
      select: { id: true, name: true, platformAdmin: true, status: true },
    })
    if (!user || !user.platformAdmin || user.status !== 'active') {
      throw new ProvisioningError(
        'forbidden', 'This action requires a SafeOps platform administrator.', 403,
      )
    }
    return user
  }

  /** Whether the signed-in user may see the provisioning console at all. */
  async isPlatformAdmin(caller: Caller): Promise<boolean> {
    const user = await this.db.user.findUnique({
      where: { id: caller.userId },
      select: { platformAdmin: true, status: true },
    })
    return Boolean(user?.platformAdmin && user.status === 'active')
  }

  /**
   * Every customer, for the platform console.
   *
   * Counts come from grouped queries rather than a per-company count, so the list is three
   * statements whether there are five customers or five hundred.
   */
  async listCompanies(caller: Caller) {
    await this.requirePlatformAdmin(caller)

    const companies = await this.db.company.findMany({
      orderBy: [{ provisionedAt: 'desc' }, { name: 'asc' }],
      take: 200,
    })
    const ids = companies.map((c) => c.id)
    const [members, sites] = await Promise.all([
      this.db.membership.groupBy({
        by: ['companyId'], where: { companyId: { in: ids } }, _count: true,
      }),
      this.db.site.groupBy({
        by: ['companyId'], where: { companyId: { in: ids } }, _count: true,
      }),
    ])
    const memberCount = new Map(members.map((m) => [m.companyId, m._count]))
    const siteCount = new Map(sites.map((s) => [s.companyId, s._count]))

    return companies.map((c) => {
      const plan = planFor(c.plan)
      return {
        id: c.id,
        name: c.name,
        industry: c.industry,
        plan: plan.key,
        planLabel: plan.label,
        monthlyPriceMyr: plan.monthlyPriceMyr,
        monthlyPrice: formatMyr(plan.monthlyPriceMyr),
        status: c.status,
        subscriptionStatus: c.subscriptionStatus,
        provisionedAt: c.provisionedAt?.toISOString() ?? null,
        provisionedBy: c.provisionedBy,
        users: memberCount.get(c.id) ?? 0,
        sites: siteCount.get(c.id) ?? 0,
      }
    })
  }

  /**
   * Create a customer: company, one site, one administrator, one invitation.
   *
   * Everything that must not exist without the rest is written in a single transaction. A
   * company with no administrator is a tenant nobody can get into; an administrator with no
   * company is an account with nowhere to go. The email is sent afterwards, deliberately -
   * a network call inside a transaction holds a database connection open for as long as the
   * provider takes to answer, and delivery failing must not undo a correctly created
   * customer.
   */
  async provisionCompany(caller: Caller, ctx: AdminContext, input: ProvisionInput) {
    const staff = await this.requirePlatformAdmin(caller)

    const companyName = input.companyName?.trim()
    const adminName = input.adminName?.trim()
    const adminEmail = input.adminEmail?.trim().toLowerCase()
    const siteName = input.siteName?.trim()

    if (!companyName) throw new ProvisioningError('validation', 'The company needs a name.')
    if (!siteName) throw new ProvisioningError('validation', 'The first site needs a name.')
    if (!adminName) throw new ProvisioningError('validation', 'The administrator needs a name.')
    if (!adminEmail || !EMAIL.test(adminEmail)) {
      throw new ProvisioningError('validation', 'Enter a valid administrator email address.')
    }
    if (!isSellablePlan(input.plan)) {
      throw new ProvisioningError('validation', 'Choose one of the available plans.')
    }

    const companyId = companyIdFrom(companyName)

    /*
     * Checked before the transaction so the operator gets a sentence rather than a
     * constraint violation. The unique indexes below are still what actually guarantees it
     * under a double submission - this is the message, not the mechanism.
     */
    if (await this.db.company.findUnique({ where: { id: companyId }, select: { id: true } })) {
      throw new ProvisioningError(
        'conflict',
        `A company already exists at "${companyId}". If this is a different customer, `
        + 'give it a name that does not collide.',
        409,
      )
    }
    const existingUser = await this.db.user.findUnique({
      where: { email: adminEmail },
      select: { id: true },
    })
    if (existingUser) {
      throw new ProvisioningError(
        'conflict',
        'Somebody already uses that email address. Provision the company with a different '
        + 'administrator, then invite them from inside the workspace.',
        409,
      )
    }

    const rawToken = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000)
    // Never a derivable password: the invitation is the only way in, and no one - including
    // whoever provisioned the company - ever holds a working credential for it.
    const passwordHash = await hashPassword(randomBytes(32).toString('base64url'))

    let created
    try {
      created = await this.db.$transaction(async (tx) => {
        const company = await tx.company.create({
          data: {
            id: companyId,
            name: companyName,
            industry: input.industry?.trim() ?? '',
            plan: input.plan,
            status: 'active',
            subscriptionStatus: 'trial',
            provisionedAt: new Date(),
            provisionedBy: staff.name,
            logoInitials: companyName.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
          },
        })

        const site = await tx.site.create({
          data: {
            id: `${companyId}-site-${randomBytes(3).toString('hex')}`,
            companyId: company.id,
            name: siteName,
            short: siteName.slice(0, 6).toUpperCase(),
            city: input.siteCity?.trim() ?? '',
            timezone: input.siteTimezone?.trim() || 'Asia/Kuching',
          },
        })

        const user = await tx.user.create({
          data: {
            email: adminEmail,
            name: adminName,
            passwordHash,
            status: 'invited',
            mustChangePassword: true,
            memberships: {
              create: { companyId: company.id, role: 'admin' as Role, siteIds: [] },
            },
          },
        })

        const invitation = await tx.invitation.create({
          data: {
            companyId: company.id,
            email: adminEmail,
            role: 'admin' as Role,
            siteIds: [],
            tokenHash: hashResetToken(rawToken),
            expiresAt,
            userId: user.id,
            // This invitation created the account immediately above, so accepting it is
            // what gives that account its first password. See Invitation.provisionedUser.
            provisionedUser: true,
            invitedBy: staff.name,
          },
        })

        return { company, site, user, invitation }
      })
    } catch (e) {
      /*
       * Logged, not audited.
       *
       * AdminAuditEntry is tenant-scoped by a foreign key to Company, and a provisioning
       * that failed has no company - the transaction rolled back. Writing the failure there
       * violates the constraint and throws a foreign-key error *instead of* the real cause,
       * which is the worst possible outcome: the operator is shown a database error about
       * audit rows while the actual problem, a duplicate email say, is swallowed.
       *
       * So the failure goes to the server log, where provisioning problems are looked for,
       * and the customer's trail starts when the customer does. Nothing is left behind to
       * clean up either way.
       */
      // eslint-disable-next-line no-console
      console.error('[safeops-api] provisioning failed', {
        companyId,
        companyName,
        by: staff.name,
        // The reason, never the payload: that carries an email address and a token.
        code: (e as { code?: string }).code ?? (e as Error).name,
      })
      if ((e as { code?: string }).code === 'P2002') {
        throw new ProvisioningError(
          'conflict', 'That company or administrator already exists.', 409,
        )
      }
      throw e
    }

    /*
     * Audited against the new company, so the record sits in that customer's trail from the
     * first day rather than in a separate platform log nobody exports with them.
     */
    await this.audit(caller, companyId, ctx, 'Company provisioned', companyName,
      undefined, `${input.plan} plan`)
    await this.audit(caller, companyId, ctx, 'Initial administrator created', adminEmail,
      undefined, 'admin')

    // Same email, same delivery states, same idempotency key as any other invitation.
    const delivery = await this.org.deliverInvitation(created.invitation.id, rawToken)
    await this.audit(
      caller, companyId, ctx,
      delivery.status === 'sent' ? 'Invitation email sent'
        : delivery.status === 'failed' ? 'Invitation email failed'
          : 'Invitation email not sent',
      adminEmail,
    )

    const plan = planFor(input.plan)
    return {
      companyId: created.company.id,
      companyName: created.company.name,
      siteId: created.site.id,
      siteName: created.site.name,
      adminEmail,
      plan: plan.key,
      planLabel: plan.label,
      monthlyPrice: formatMyr(plan.monthlyPriceMyr),
      deliveryStatus: delivery.status,
      /*
       * The link comes back only when no email went out. Once a provider has it the
       * operator has no need for the secret, and there is no reason to put a working
       * credential through another system that might log it.
       */
      invitationUrl: delivery.showLink ? invitationUrl(rawToken) : undefined,
    }
  }

  /** Change a customer's commercial state. The tenant's data is never touched. */
  async setCompanyStatus(caller: Caller, ctx: AdminContext, companyId: string, patch: {
    status?: string; subscriptionStatus?: string; plan?: string; billingReference?: string | null
  }) {
    await this.requirePlatformAdmin(caller)
    const company = await this.db.company.findUnique({ where: { id: companyId } })
    if (!company) throw new ProvisioningError('not_found', 'Company not found.', 404)

    const data: Record<string, unknown> = {}
    if (patch.status !== undefined) {
      if (!COMPANY_STATUSES.includes(patch.status as never)) {
        throw new ProvisioningError('validation', 'Unknown company status.')
      }
      data.status = patch.status
    }
    if (patch.subscriptionStatus !== undefined) {
      if (!SUBSCRIPTION_STATUSES.includes(patch.subscriptionStatus as never)) {
        throw new ProvisioningError('validation', 'Unknown subscription status.')
      }
      data.subscriptionStatus = patch.subscriptionStatus
    }
    if (patch.plan !== undefined) {
      if (!isSellablePlan(patch.plan)) {
        throw new ProvisioningError('validation', 'Choose one of the available plans.')
      }
      data.plan = patch.plan
    }
    if (patch.billingReference !== undefined) data.billingReference = patch.billingReference

    const updated = await this.db.company.update({ where: { id: companyId }, data })
    for (const [field, before, after] of [
      ['plan', company.plan, updated.plan],
      ['status', company.status, updated.status],
      ['subscription', company.subscriptionStatus, updated.subscriptionStatus],
    ] as const) {
      if (before !== after) {
        await this.audit(caller, companyId, ctx, `Changed ${field}`, company.name, before, after)
      }
    }
    return updated
  }

  private audit(
    caller: Caller, companyId: string, ctx: AdminContext,
    action: string, target: string, oldValue?: string, newValue?: string,
  ) {
    // Never the token: this trail is read by auditors and exported with the customer.
    return writeAdminAudit(
      this.db, caller, companyId, ctx, action, 'platform', target, oldValue, newValue,
    )
  }
}
