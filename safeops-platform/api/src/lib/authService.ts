import type { PrismaClient, User } from '@prisma/client'
import { env } from '../env.js'
import { burnEquivalentWork, verifyPassword } from './password.js'
import {
  generateRefreshToken, hashRefreshToken, newFamilyId, refreshExpiry, signAccessToken,
} from './tokens.js'
import { DomainError } from '../domain/errors.js'

export class AuthError extends DomainError {
  constructor(code: string, message: string, status = 401) {
    super(code, message, status)
  }
}

export interface RequestContext {
  ip?: string
  userAgent?: string
}

/** Presented to the client on every failed login, regardless of the real reason. */
const GENERIC_FAILURE = 'Email or password is incorrect.'

export class AuthService {
  constructor(private db: PrismaClient) {}

  private async record(
    email: string,
    outcome: string,
    ctx: RequestContext,
    userId?: string | null,
  ) {
    await this.db.loginAttempt.create({
      data: { email, outcome, userId: userId ?? null, ip: ctx.ip, userAgent: ctx.userAgent },
    })
  }

  private async issueSession(user: User, ctx: RequestContext, familyId = newFamilyId()) {
    const memberships = await this.db.membership.findMany({ where: { userId: user.id } })
    const { token: accessToken, expiresAt: accessExpiresAt } = signAccessToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      roles: memberships.map((m) => ({ companyId: m.companyId, role: m.role, siteIds: m.siteIds })),
      mustChangePassword: user.mustChangePassword,
    })

    const refreshToken = generateRefreshToken()
    await this.db.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashRefreshToken(refreshToken),
        familyId,
        expiresAt: refreshExpiry(),
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
    })

    return { accessToken, accessExpiresAt, refreshToken }
  }

  /**
   * Password login.
   *
   * Every failure path returns the same message and does comparable work, so the response
   * reveals nothing about whether an account exists, is locked, or simply had the wrong
   * password. The distinction is recorded in the audit log instead, where defenders can see it.
   */
  async login(emailRaw: string, password: string, ctx: RequestContext) {
    const email = emailRaw.trim().toLowerCase()
    const user = await this.db.user.findUnique({ where: { email } })

    if (!user) {
      await burnEquivalentWork(password)
      await this.record(email, 'unknown_user', ctx)
      throw new AuthError('invalid_credentials', GENERIC_FAILURE)
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await burnEquivalentWork(password)
      await this.record(email, 'locked_out', ctx, user.id)
      throw new AuthError('invalid_credentials', GENERIC_FAILURE)
    }

    if (user.status === 'deactivated') {
      await burnEquivalentWork(password)
      await this.record(email, 'deactivated', ctx, user.id)
      throw new AuthError('invalid_credentials', GENERIC_FAILURE)
    }

    const ok = await verifyPassword(user.passwordHash, password)
    if (!ok) {
      const failed = user.failedLoginCount + 1
      const shouldLock = failed >= env.MAX_FAILED_LOGINS
      await this.db.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: shouldLock ? 0 : failed,
          lockedUntil: shouldLock
            ? new Date(Date.now() + env.LOCKOUT_MINUTES * 60 * 1000)
            : user.lockedUntil,
          status: shouldLock ? 'locked' : user.status,
        },
      })
      await this.record(email, 'bad_password', ctx, user.id)
      throw new AuthError('invalid_credentials', GENERIC_FAILURE)
    }

    // Success clears the lockout counter.
    await this.db.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        status: user.status === 'locked' ? 'active' : user.status,
      },
    })
    await this.record(email, 'success', ctx, user.id)

    const session = await this.issueSession(user, ctx)
    return { ...session, user: this.publicUser(user) }
  }

  /**
   * Refresh rotation with reuse detection.
   *
   * Each refresh consumes its token and issues a successor in the same family. If a token
   * that was already consumed shows up again, the only sane explanation is that it leaked
   * and is being replayed — so the whole family is revoked, logging out the attacker *and*
   * the legitimate user rather than letting a stolen session persist silently.
   */
  async refresh(rawToken: string, ctx: RequestContext) {
    const tokenHash = hashRefreshToken(rawToken)
    const existing = await this.db.refreshToken.findUnique({ where: { tokenHash } })

    if (!existing) throw new AuthError('invalid_refresh', 'Session is invalid. Please sign in again.')

    if (existing.revokedAt) {
      await this.db.refreshToken.updateMany({
        where: { familyId: existing.familyId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'reuse_detected' },
      })
      throw new AuthError('refresh_reuse', 'Session is invalid. Please sign in again.')
    }

    if (existing.expiresAt <= new Date()) {
      throw new AuthError('expired_refresh', 'Session expired. Please sign in again.')
    }

    const user = await this.db.user.findUnique({ where: { id: existing.userId } })
    if (!user || user.status === 'deactivated') {
      throw new AuthError('invalid_refresh', 'Session is invalid. Please sign in again.')
    }

    // Issuing the successor and revoking its predecessor must be atomic. If the process
    // died between the two writes, the consumed token would remain valid alongside the new
    // one — two live tokens in a family that reuse detection assumes has exactly one.
    const refreshToken = generateRefreshToken()
    const memberships = await this.db.membership.findMany({ where: { userId: user.id } })

    await this.db.$transaction(async (tx) => {
      const successor = await tx.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: hashRefreshToken(refreshToken),
          familyId: existing.familyId,
          expiresAt: refreshExpiry(),
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
      })
      await tx.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date(), revokedReason: 'rotated', replacedById: successor.id },
      })
    })

    const { token: accessToken, expiresAt: accessExpiresAt } = signAccessToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      roles: memberships.map((m) => ({ companyId: m.companyId, role: m.role, siteIds: m.siteIds })),
      mustChangePassword: user.mustChangePassword,
    })

    return { accessToken, accessExpiresAt, refreshToken, user: this.publicUser(user) }
  }

  /** Server-side revocation. Clearing the cookie alone would leave the token usable. */
  async logout(rawToken: string | undefined, allDevices = false) {
    if (!rawToken) return
    const tokenHash = hashRefreshToken(rawToken)
    const existing = await this.db.refreshToken.findUnique({ where: { tokenHash } })
    if (!existing) return

    await this.db.refreshToken.updateMany({
      where: allDevices
        ? { userId: existing.userId, revokedAt: null }
        : { familyId: existing.familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: allDevices ? 'logout_all' : 'logout' },
    })
  }

  publicUser(user: User) {
    // Whitelist: never spread the row, or a future secret column leaks by default.
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      title: user.title,
      status: user.status,
      mfaEnabled: user.mfaEnabled,
      mustChangePassword: user.mustChangePassword,
      lastLoginAt: user.lastLoginAt,
    }
  }
}
