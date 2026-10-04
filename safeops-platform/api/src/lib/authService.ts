import type { PrismaClient, User } from '@prisma/client'
import { env } from '../env.js'
import { burnEquivalentWork, verifyPassword } from './password.js'
import { DEMO_PASSWORD, DEMO_PASSWORD_REFUSED } from './demoAccounts.js'
import {
  generateRefreshToken, hashRefreshToken, newFamilyId, refreshExpiry, signAccessToken,
  signMfaChallenge, verifyMfaChallenge, type AccessClaims,
} from './tokens.js'
import { MfaService, mfaAvailable } from './mfaService.js'
import { DomainError } from '../domain/errors.js'

export class AuthError extends DomainError {
  constructor(code: string, message: string, status = 401) {
    super(code, message, status)
  }
}

/** What a session carries besides who it is: roles, and whether MFA setup comes first. */
interface SessionClaims {
  roles: AccessClaims['roles']
  mfaSetupRequired: boolean
}

const MFA_UNAVAILABLE = 'Multi-factor sign-in is not available on this server right now. '
  + 'Contact your administrator.'

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

  /**
   * The roles a session may carry: every membership in a workspace that is not suspended.
   *
   * Suspending a customer in the platform console used to stop only their API keys
   * (apiKeyAuth.ts). Sessions were minted from every membership regardless, so the people
   * of a suspended customer went on signing in, refreshing and working as before - the
   * suspension closed the programmatic door and left the browser one open. Every service
   * authorises against the roles in the token, so leaving a suspended workspace out of the
   * token closes it everywhere at once, from the next sign-in or refresh: at most one
   * access-token lifetime after the suspension.
   *
   * Only memberships in suspended workspaces are dropped. Somebody who also belongs to a
   * workspace in good standing keeps that one. Somebody whose only workspaces are suspended
   * is told so rather than signed in to an empty shell - after their password has been
   * checked, so the answer reveals nothing to someone who does not hold it.
   */
  private async sessionClaims(user: User): Promise<SessionClaims> {
    const memberships = await this.db.membership.findMany({ where: { userId: user.id } })
    const active = new Set((await this.db.company.findMany({
      where: { id: { in: memberships.map((m) => m.companyId) }, status: 'active' },
      select: { id: true },
    })).map((c) => c.id))
    const live = memberships.filter((m) => active.has(m.companyId))
    if (memberships.length > 0 && live.length === 0 && !user.platformAdmin) {
      throw new AuthError(
        'workspace_suspended',
        "Your organisation's SafeOps workspace is suspended. Contact your administrator.",
        403,
      )
    }
    /*
     * Whether a workspace's policy obliges this person to set up MFA before anything else.
     *
     * Never when the server cannot hold authenticator secrets: the setup screen would be a
     * wall nobody could get past. updateSecurity refuses to switch the policy on in that
     * state, so this only matters if the key is removed afterwards.
     */
    const mfaSetupRequired = !user.mfaEnabled && mfaAvailable() && live.length > 0
      && (await this.db.securityPolicy.count({
        where: { companyId: { in: live.map((m) => m.companyId) }, mfaRequired: true },
      })) > 0
    return {
      roles: live.map((m) => ({ companyId: m.companyId, role: m.role, siteIds: m.siteIds })),
      mfaSetupRequired,
    }
  }

  private async issueSession(
    user: User, ctx: RequestContext, claims: SessionClaims, familyId = newFamilyId(),
  ) {
    const { token: accessToken, expiresAt: accessExpiresAt } = signAccessToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      roles: claims.roles,
      mustChangePassword: user.mustChangePassword,
      mfaSetupRequired: claims.mfaSetupRequired,
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
    const result = await this.authenticate(emailRaw, password, ctx)
    if (result.mfaRequired) {
      // For callers that can only take a session. The sign-in route uses `authenticate`.
      throw new AuthError('mfa_required', 'Enter the code from your authenticator app.')
    }
    return result
  }

  /**
   * The first step of signing in: a session, or - with MFA on - a challenge to finish with
   * `completeMfa`.
   */
  async authenticate(emailRaw: string, password: string, ctx: RequestContext, rememberMe = true) {
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
      await this.recordFailure(user, 'bad_password', ctx)
      throw new AuthError('invalid_credentials', GENERIC_FAILURE)
    }

    // Right, but published: see lib/demoAccounts.ts. Checked only after the password is
    // proven correct, so it reveals nothing about any account to somebody guessing.
    if (password === DEMO_PASSWORD && !env.allowDemoPassword) {
      await this.record(email, 'demo_password_refused', ctx, user.id)
      throw new AuthError('demo_password', DEMO_PASSWORD_REFUSED, 403)
    }

    /*
     * The password is right. With MFA on, that earns a challenge, not a session.
     *
     * Nothing is reset yet: the lockout counter keeps counting until the second factor is
     * also right, so a stolen password cannot be used to grind through codes.
     */
    if (user.mfaEnabled) {
      if (!mfaAvailable()) {
        // Fail closed. Signing them in on the password alone would quietly switch off the
        // protection they turned on; an administrator can reset MFA if the key is gone.
        await this.record(email, 'mfa_unavailable', ctx, user.id)
        throw new AuthError('mfa_unavailable', MFA_UNAVAILABLE, 503)
      }
      await this.record(email, 'mfa_challenge', ctx, user.id)
      return { mfaRequired: true as const, challenge: signMfaChallenge(user.id, rememberMe) }
    }

    return this.completeSignIn(user, ctx)
  }

  /**
   * The second step of an MFA sign-in: the challenge from `login` and a code.
   *
   * A wrong code counts towards the same lockout as a wrong password, so the code space
   * cannot be searched with a known password either.
   */
  async completeMfa(challenge: string, code: string, ctx: RequestContext) {
    const claimed = verifyMfaChallenge(challenge)
    if (!claimed) throw new AuthError('mfa_challenge_expired', 'That sign-in has expired. Enter your password again.')
    const user = await this.db.user.findUnique({ where: { id: claimed.userId } })
    if (!user || user.status === 'deactivated' || (user.lockedUntil && user.lockedUntil > new Date())) {
      throw new AuthError('mfa_challenge_expired', 'That sign-in has expired. Enter your password again.')
    }
    if (!(await new MfaService(this.db).verifySecondFactor(user, code))) {
      await this.recordFailure(user, 'bad_mfa_code', ctx)
      throw new AuthError('invalid_mfa_code', 'That code is not right. Use the newest code from your authenticator app.')
    }
    return { ...(await this.completeSignIn(user, ctx)), rememberMe: claimed.rememberMe }
  }

  /** A wrong password or code: count it, and lock the account at the threshold. */
  private async recordFailure(user: User, outcome: string, ctx: RequestContext) {
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
    await this.record(user.email, outcome, ctx, user.id)
  }

  /** Every factor has been checked: clear the lockout counter and issue the session. */
  private async completeSignIn(user: User, ctx: RequestContext) {
    let claims: SessionClaims
    try {
      claims = await this.sessionClaims(user)
    } catch (e) {
      await this.record(user.email, 'workspace_suspended', ctx, user.id)
      throw e
    }

    await this.db.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        status: user.status === 'locked' ? 'active' : user.status,
      },
    })
    await this.record(user.email, 'success', ctx, user.id)

    const session = await this.issueSession(user, ctx, claims)
    return {
      mfaRequired: false as const,
      ...session,
      user: { ...this.publicUser(user), mfaSetupRequired: claims.mfaSetupRequired },
    }
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

    const claims = await this.sessionClaims(user)

    // Issuing the successor and revoking its predecessor must be atomic. If the process
    // died between the two writes, the consumed token would remain valid alongside the new
    // one — two live tokens in a family that reuse detection assumes has exactly one.
    const refreshToken = generateRefreshToken()

    const won = await this.db.$transaction(async (tx) => {
      /*
       * Consumed conditionally, and first.
       *
       * The check above read `revokedAt` before this transaction began, so two requests
       * presenting the same token at the same moment both passed it, and both went on to
       * mint a successor: two live tokens in one family, and a stolen token replayed in
       * the same instant as the real one was never detected. Only one of them can update
       * the row from "not revoked"; the other updates nothing and is treated exactly as a
       * replay one second later would be.
       */
      const consumed = await tx.refreshToken.updateMany({
        where: { id: existing.id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'rotated' },
      })
      if (consumed.count === 0) return false
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
        data: { replacedById: successor.id },
      })
      return true
    })
    if (!won) {
      await this.db.refreshToken.updateMany({
        where: { familyId: existing.familyId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'reuse_detected' },
      })
      throw new AuthError('refresh_reuse', 'Session is invalid. Please sign in again.')
    }

    const { token: accessToken, expiresAt: accessExpiresAt } = signAccessToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      roles: claims.roles,
      mustChangePassword: user.mustChangePassword,
      mfaSetupRequired: claims.mfaSetupRequired,
    })

    return {
      accessToken, accessExpiresAt, refreshToken,
      user: { ...this.publicUser(user), mfaSetupRequired: claims.mfaSetupRequired },
    }
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
