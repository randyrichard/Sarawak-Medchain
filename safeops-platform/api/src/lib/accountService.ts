/**
 * What a signed-in person can change about their own account.
 *
 * Separate from adminService, which is about acting on *other* people and is admin-only.
 * Everything here operates on `caller.userId` and never takes a user id from the request,
 * so there is no path by which one person can change another's password or settings.
 */
import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import { hashPassword, verifyPassword } from './password.js'
import { passwordProblem, policyForUser } from './authPolicy.js'
import {
  generateResetToken, hashRefreshToken, hashResetToken, resetTokenExpiry, RESET_TOKEN_TTL_MIN,
} from './tokens.js'
import { sendPasswordResetEmail } from './email/passwordResetDelivery.js'
import { DomainError } from '../domain/errors.js'

export class AccountError extends DomainError {}

/** Where a user lands after signing in. Validated against this list, not free text. */
export const LANDING_PAGES = [
  '/', '/incidents', '/actions', '/permits', '/assets', '/audits', '/training',
] as const
export type LandingPage = (typeof LANDING_PAGES)[number]

export interface UserPreferences {
  /** Route to open after sign-in. */
  landingPage: LandingPage
  /** Site to scope to on sign-in; null means "all sites I can see". */
  defaultSiteId: string | null
}

const DEFAULTS: UserPreferences = { landingPage: '/', defaultSiteId: null }

/**
 * Reads stored preferences into a complete object.
 *
 * The column is nullable and its shape can lag the code, so anything missing or unknown
 * falls back to the default rather than reaching a screen as `undefined`.
 */
function normalise(raw: unknown): UserPreferences {
  const v = (raw ?? {}) as Partial<Record<keyof UserPreferences, unknown>>
  const landing = LANDING_PAGES.includes(v.landingPage as LandingPage)
    ? (v.landingPage as LandingPage)
    : DEFAULTS.landingPage
  const site = typeof v.defaultSiteId === 'string' && v.defaultSiteId.length > 0
    ? v.defaultSiteId
    : null
  return { landingPage: landing, defaultSiteId: site }
}

/** Where an account event is written, and what it is called in the trail. */
interface AuditContext {
  ip?: string
  device?: string
}

export class AccountService {
  constructor(private db: PrismaClient) {}

  /**
   * Writes an account event to the audit trail.
   *
   * Recorded against every workspace the user belongs to, because each one's administrator
   * is accountable for that user's account security and should not have to know which
   * other tenants the person happens to be in. Most people have exactly one membership, so
   * this is one row in practice.
   *
   * Never throws: an audit write failing must not stop a user changing their password.
   * A password that did not rotate is a worse outcome than a trail entry that is missing,
   * and the entry not appearing is itself visible.
   */
  private async log(
    userId: string, action: string, ctx: AuditContext = {}, target = '',
  ): Promise<void> {
    try {
      const user = await this.db.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true, memberships: { select: { companyId: true, role: true } } },
      })
      if (!user || user.memberships.length === 0) return
      await this.db.adminAuditEntry.createMany({
        data: user.memberships.map((m) => ({
          companyId: m.companyId,
          actor: user.name,
          actorRole: m.role,
          action,
          module: 'auth',
          target: target || user.email,
          ip: ctx.ip ?? '',
          device: ctx.device ?? '',
        })),
      })
    } catch {
      // Deliberately swallowed — see above.
    }
  }

  // ── Preferences ────────────────────────────────────────────────────────────

  async getPreferences(userId: string): Promise<UserPreferences> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    })
    if (!user) throw new AccountError('not_found', 'Account not found.', 404)
    return normalise(user.preferences)
  }

  /**
   * Merges a partial update over what is stored.
   *
   * A site id is checked against the caller's own memberships: a preference is not an
   * authorisation, but storing a site the person cannot see would land them on an empty
   * screen with no explanation, and it would leak that the site exists.
   */
  async updatePreferences(
    userId: string,
    patch: Partial<UserPreferences>,
  ): Promise<UserPreferences> {
    const current = await this.getPreferences(userId)
    const next: UserPreferences = { ...current }

    if (patch.landingPage !== undefined) {
      if (!LANDING_PAGES.includes(patch.landingPage)) {
        throw new AccountError('validation', 'That is not a page you can land on.')
      }
      next.landingPage = patch.landingPage
    }

    if (patch.defaultSiteId !== undefined) {
      if (patch.defaultSiteId === null || patch.defaultSiteId === '') {
        next.defaultSiteId = null
      } else {
        const memberships = await this.db.membership.findMany({
          where: { userId },
          select: { companyId: true, siteIds: true },
        })
        const site = await this.db.site.findFirst({
          where: { id: patch.defaultSiteId },
          select: { id: true, companyId: true },
        })
        const allowed = site && memberships.some(
          (m) => m.companyId === site.companyId
            && (m.siteIds.length === 0 || m.siteIds.includes(site.id)),
        )
        if (!allowed) throw new AccountError('validation', 'You do not have access to that site.')
        next.defaultSiteId = site.id
      }
    }

    // Prisma's Json input type wants an index signature; UserPreferences is a closed shape
    // on purpose, so it is widened only at the storage boundary.
    await this.db.user.update({
      where: { id: userId },
      data: { preferences: { ...next } as Prisma.InputJsonObject },
    })
    await this.log(userId, 'Updated preferences')
    return next
  }

  // ── Password ───────────────────────────────────────────────────────────────

  /**
   * Changes the caller's own password.
   *
   * Three things make this safe rather than merely functional:
   *
   *  - The current password is verified first. Without that, anyone holding a stolen
   *    access token could lock the real owner out of their account permanently.
   *  - Every other session is revoked. Changing a password is what someone does when they
   *    think they have been compromised, and a change that leaves the attacker's session
   *    alive is worse than useless — it tells the victim they are safe when they are not.
   *  - The caller's own session survives, so the person doing the right thing is not
   *    punished by being thrown back to the sign-in screen mid-task.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    /** The caller's raw refresh cookie, so their own session can be spared. */
    keepRawRefreshToken?: string,
  ): Promise<{ revokedSessions: number }> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true, status: true },
    })
    if (!user) throw new AccountError('not_found', 'Account not found.', 404)
    if (user.status === 'deactivated') {
      throw new AccountError('forbidden', 'This account is deactivated.', 403)
    }

    if (!await verifyPassword(user.passwordHash, currentPassword)) {
      throw new AccountError('invalid_password', 'Your current password is not correct.', 400)
    }

    // The rules of every company this person belongs to, strictest first (authPolicy.ts).
    const weak = passwordProblem(newPassword, await policyForUser(this.db, userId))
    if (weak) throw new AccountError('validation', weak)

    // Reusing the current password is not a change, and telling the user plainly is
    // better than accepting it and leaving them believing they have rotated it.
    if (await verifyPassword(user.passwordHash, newPassword)) {
      throw new AccountError('validation', 'The new password must be different from the current one.')
    }

    const passwordHash = await hashPassword(newPassword)

    // Spare the caller's whole token family, not just the token they happen to be holding.
    // Refresh rotates on every use, so keeping a single hash alive would revoke the
    // session the moment it next refreshed — logging out the person who just did the
    // right thing while leaving nothing else changed.
    let keepFamilyId: string | undefined
    if (keepRawRefreshToken) {
      const own = await this.db.refreshToken.findUnique({
        where: { tokenHash: hashRefreshToken(keepRawRefreshToken) },
        select: { familyId: true, userId: true },
      })
      // Only if it really is this user's token. A cookie from another account must not
      // buy that account's sessions an exemption.
      if (own?.userId === userId) keepFamilyId = own.familyId
    }

    const { count } = await this.db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        // Clearing mustChangePassword is the point when an admin forced this.
        data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: false, failedLoginCount: 0, lockedUntil: null },
      })
      return tx.refreshToken.updateMany({
        where: {
          userId,
          revokedAt: null,
          ...(keepFamilyId ? { familyId: { not: keepFamilyId } } : {}),
        },
        data: { revokedAt: new Date(), revokedReason: 'password_changed' },
      })
    })

    await this.log(userId, 'Changed own password')
    return { revokedSessions: count }
  }

  // ── Password reset ─────────────────────────────────────────────────────────

  /**
   * Redeems an administrator-issued reset link.
   *
   * This is the only path back in for someone who has forgotten their password, so it is
   * also the most attractive thing on the service to attack. The protections that matter:
   *
   *  - The token is looked up by SHA-256 digest. The raw value exists only in the link,
   *    so a database dump yields nothing redeemable.
   *  - Single-use and short-lived, checked in the same transaction that consumes it, so
   *    two simultaneous redemptions cannot both succeed.
   *  - Every session is revoked. Someone resetting a forgotten password may be locked out
   *    *because* an attacker took the account; leaving those sessions alive defeats it.
   *  - One message for expired, used, and unknown tokens: distinguishing them tells an
   *    attacker which guesses were once real.
   */
  /**
   * "I forgot my password." Issue a link and email it, if that address has an account.
   *
   * Returns nothing in every case, on purpose. The caller cannot tell a hit from a miss and
   * so cannot leak one - see the route, which is where the reasoning for that lives.
   *
   * Everything the redeem path already guarantees is preserved because this reuses the same
   * mechanism: only the SHA-256 digest is stored, the link is single-use and short-lived,
   * and issuing a new one supersedes any earlier one so a request never leaves two working
   * ways in.
   *
   * Deactivated accounts are skipped silently. A link that cannot be redeemed - redeem
   * rejects deactivated users - would be an email promising a way in that does not exist.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const address = email.trim().toLowerCase()
    const user = await this.db.user.findUnique({
      where: { email: address },
      select: { id: true, email: true, name: true, status: true },
    })
    if (!user || user.status === 'deactivated') return

    const token = generateResetToken()

    await this.db.$transaction(async (tx) => {
      // Supersede any earlier live link for this user, so requesting twice does not leave
      // two valid secrets in two inboxes.
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      })
      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashResetToken(token),
          expiresAt: resetTokenExpiry(),
          // Non-nullable in the schema, so the self-service case is named rather than
          // blanked - "who issued this link" is a question the audit trail should answer,
          // and "" would read as data loss rather than as an answer.
          issuedBy: 'self-service',
        },
      })
    })

    /*
     * Sent after the transaction commits - the token must be valid before a message
     * carrying it exists, and a third-party network call inside a transaction holds a
     * database connection hostage to somebody else's outage.
     *
     * The result is deliberately ignored. There is nobody to report a failure to: the
     * requester is anonymous by definition and telling them "delivery failed" would confirm
     * the address exists. `sendPasswordResetEmail` already logs the failure server-side,
     * without the token or the URL.
     */
    await sendPasswordResetEmail({
      token,
      recipientEmail: user.email,
      recipientName: user.name,
      expiresInMinutes: RESET_TOKEN_TTL_MIN,
      issuedByAdmin: false,
      idempotencyKey: `safeops-reset-self-${user.id}-${Date.now()}`,
    })
  }

  async redeemPasswordReset(rawToken: string, newPassword: string): Promise<void> {
    const record = await this.db.passwordResetToken.findUnique({
      where: { tokenHash: hashResetToken(rawToken) },
      select: {
        id: true, userId: true, usedAt: true, expiresAt: true,
        user: { select: { status: true } },
      },
    })

    const invalid = () =>
      new AccountError('invalid_token', 'This reset link is invalid, expired or already used.', 400)

    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) throw invalid()
    // A deactivated account must not be revivable by a link issued before it was disabled.
    if (record.user.status === 'deactivated') throw invalid()

    // Checked once the link is known to be good, because the rules are the account's.
    const weak = passwordProblem(newPassword, await policyForUser(this.db, record.userId))
    if (weak) throw new AccountError('validation', weak)

    const passwordHash = await hashPassword(newPassword)

    await this.db.$transaction(async (tx) => {
      // Consume by id AND unused, so a concurrent redemption of the same link updates
      // zero rows and is rejected rather than silently setting the password twice.
      const consumed = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      })
      if (consumed.count === 0) throw invalid()

      await tx.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          passwordChangedAt: new Date(),
          mustChangePassword: false,
          failedLoginCount: 0,
          lockedUntil: null,
          // A reset is how a locked-out user gets back in; leaving them locked would
          // make the link useless to the very person it was issued for.
          status: 'active',
        },
      })

      await tx.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'password_reset' },
      })

      // Any other outstanding link for this account is now stale.
      await tx.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: new Date() },
      })
    })

    // A successful reset is a security event in its own right: it is how an account
    // changes hands legitimately, and how it would change hands illegitimately.
    await this.log(record.userId, 'Redeemed a password reset link')
  }

  /**
   * Whether a link is still redeemable, so the page can say so before the user types a
   * new password twice. Deliberately returns nothing but a boolean — echoing the account
   * it belongs to would turn a guessed token into an email-address oracle.
   */
  async isResetTokenValid(rawToken: string): Promise<boolean> {
    const record = await this.db.passwordResetToken.findUnique({
      where: { tokenHash: hashResetToken(rawToken) },
      select: { usedAt: true, expiresAt: true, user: { select: { status: true } } },
    })
    return !!record
      && !record.usedAt
      && record.expiresAt.getTime() > Date.now()
      && record.user.status !== 'deactivated'
  }
}
