/**
 * What a signed-in person can change about their own account.
 *
 * Separate from adminService, which is about acting on *other* people and is admin-only.
 * Everything here operates on `caller.userId` and never takes a user id from the request,
 * so there is no path by which one person can change another's password or settings.
 */
import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import { hashPassword, validatePasswordStrength, verifyPassword } from './password.js'
import { hashRefreshToken } from './tokens.js'

export class AccountError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message)
  }
}

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

export class AccountService {
  constructor(private db: PrismaClient) {}

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

    const weak = validatePasswordStrength(newPassword)
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
        data: { passwordHash, mustChangePassword: false, failedLoginCount: 0, lockedUntil: null },
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

    return { revokedSessions: count }
  }
}
