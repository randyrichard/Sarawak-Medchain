import { createHash, randomBytes } from 'node:crypto'
import type { PrismaClient, User } from '@prisma/client'
import { env } from '../env.js'
import { DomainError } from '../domain/errors.js'
import { openWith, sealWith } from './secretBox.js'
import { verifyPassword } from './password.js'
import { base32Encode, generateTotpSecret, otpauthUri, verifyTotp } from './totp.js'

/**
 * Multi-factor sign-in with an authenticator app.
 *
 * Before this the product had an "Enable MFA" button, a "Require MFA" policy and an MFA
 * adoption score, and sign-in asked for a password and nothing else: `mfaEnabled` was a
 * column nobody read. An administrator who switched the policy on was told their people
 * were protected by a second factor and they were not. This is the second factor.
 *
 * The shape is the common one, so nobody has to be taught it:
 *   - The person scans a QR code into any authenticator app and proves it works by typing
 *     a code. Only then is it switched on - an unconfirmed setup never locks anybody out.
 *   - They are given ten one-time recovery codes, shown once, for a lost phone.
 *   - Sign-in asks for a code after the password.
 *   - An administrator can reset it for somebody who has lost both; they cannot switch it
 *     on for somebody else, because only the person holding the phone can.
 */

export class MfaError extends DomainError {}

const ISSUER = 'SafeChain'
const RECOVERY_CODE_COUNT = 10

/** Whether this server can hold authenticator secrets at all. See MFA_SECRET_KEY_B64. */
export function mfaAvailable(): boolean {
  return env.mfaSecretKey !== null
}

const UNAVAILABLE = 'Multi-factor sign-in is not configured on this server (MFA_SECRET_KEY_B64). '
  + 'Ask whoever runs your SafeChain installation to set it up.'

function sealKey(): Buffer {
  if (!env.mfaSecretKey) throw new MfaError('mfa_unavailable', UNAVAILABLE, 503)
  return env.mfaSecretKey
}

const sealSecret = (secret: string) => sealWith(sealKey(), secret)
const openSecret = (sealed: string) => openWith(sealKey(), sealed, 'MFA_SECRET_KEY_B64')

/** Recovery codes are compared case- and separator-insensitively: they are typed from paper. */
function normaliseRecovery(code: string): string {
  return code.toUpperCase().replace(/[^A-Z2-7]/g, '')
}

export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(normaliseRecovery(code)).digest('hex')
}

/** Ten codes like `K7QD-2MXA`: 40 random bits each, behind the sign-in lockout. */
function newRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const s = base32Encode(randomBytes(5))
    return `${s.slice(0, 4)}-${s.slice(4, 8)}`
  })
}

export interface MfaStatus {
  /** Whether this server can do MFA at all. */
  available: boolean
  enabled: boolean
  recoveryCodesRemaining: number
  /** Whether a workspace this person belongs to requires it. */
  required: boolean
}

export class MfaService {
  constructor(private db: PrismaClient) {}

  /**
   * Whether any workspace in good standing that this person belongs to requires MFA.
   *
   * A suspended workspace's policy does not count: it grants nothing, so it should demand
   * nothing either.
   */
  async requiredFor(userId: string): Promise<boolean> {
    const memberships = await this.db.membership.findMany({ where: { userId }, select: { companyId: true } })
    if (memberships.length === 0) return false
    const n = await this.db.securityPolicy.count({
      where: {
        companyId: { in: memberships.map((m) => m.companyId) },
        mfaRequired: true,
        company: { status: 'active' },
      },
    })
    return n > 0
  }

  private async user(userId: string): Promise<User> {
    const u = await this.db.user.findUnique({ where: { id: userId } })
    if (!u) throw new MfaError('not_found', 'Account not found.', 404)
    return u
  }

  async status(userId: string): Promise<MfaStatus> {
    const u = await this.user(userId)
    return {
      available: mfaAvailable(),
      enabled: u.mfaEnabled,
      recoveryCodesRemaining: u.mfaEnabled ? u.mfaRecoveryCodes.length : 0,
      required: await this.requiredFor(userId),
    }
  }

  /**
   * Starts setup: a new secret, held as pending until a code proves the app has it.
   *
   * The secret is returned in plain text exactly once, here, for the QR code and for
   * anybody whose phone cannot scan one. Starting again replaces it.
   */
  async beginSetup(userId: string): Promise<{ secret: string; otpauthUri: string }> {
    if (!mfaAvailable()) throw new MfaError('mfa_unavailable', UNAVAILABLE, 503)
    const u = await this.user(userId)
    if (u.mfaEnabled) {
      throw new MfaError('validation', 'Multi-factor sign-in is already on. Turn it off first to move it to a new device.')
    }
    const secret = generateTotpSecret()
    await this.db.user.update({ where: { id: userId }, data: { mfaPendingSecret: sealSecret(secret) } })
    return { secret, otpauthUri: otpauthUri(ISSUER, u.email, secret) }
  }

  /** Finishes setup. Returns the recovery codes - the only time they are ever shown. */
  async confirmSetup(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    const u = await this.user(userId)
    if (u.mfaEnabled) throw new MfaError('validation', 'Multi-factor sign-in is already on.')
    if (!u.mfaPendingSecret) throw new MfaError('validation', 'Start the setup again: there is no authenticator waiting to be confirmed.')
    const secret = openSecret(u.mfaPendingSecret)
    const step = verifyTotp(secret, code)
    if (step === null) {
      throw new MfaError('invalid_mfa_code', 'That code is not right. Check the time on your phone and try the newest code.')
    }
    const recoveryCodes = newRecoveryCodes()
    const done = await this.db.user.updateMany({
      // Conditional on the same pending secret, so two confirmations racing cannot both
      // issue recovery codes, and a setup restarted in another tab is not confirmed by a
      // code from the old one.
      where: { id: userId, mfaEnabled: false, mfaPendingSecret: u.mfaPendingSecret },
      data: {
        mfaEnabled: true,
        mfaSecret: u.mfaPendingSecret,
        mfaPendingSecret: null,
        mfaLastStep: step,
        mfaRecoveryCodes: recoveryCodes.map(hashRecoveryCode),
      },
    })
    if (done.count === 0) throw new MfaError('validation', 'Setup changed while you were confirming it. Start again.')
    return { recoveryCodes }
  }

  /**
   * Checks a second factor: an authenticator code, or failing that a recovery code.
   *
   * Each is single-use. An authenticator code is accepted only for a later time step than
   * the last one accepted, written conditionally so two requests racing with one code
   * cannot both pass. A recovery code is removed as it is used.
   */
  async verifySecondFactor(user: User, code: string): Promise<boolean> {
    if (!user.mfaEnabled || !user.mfaSecret) return false
    const digits = code.replace(/\s/g, '')
    if (/^\d{6}$/.test(digits)) {
      const step = verifyTotp(openSecret(user.mfaSecret), digits, Date.now(), user.mfaLastStep)
      if (step === null) return false
      const won = await this.db.user.updateMany({
        where: { id: user.id, OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: step } }] },
        data: { mfaLastStep: step },
      })
      return won.count === 1
    }
    const hash = hashRecoveryCode(code)
    if (!normaliseRecovery(code) || !user.mfaRecoveryCodes.includes(hash)) return false
    const won = await this.db.user.updateMany({
      where: { id: user.id, mfaRecoveryCodes: { has: hash } },
      data: { mfaRecoveryCodes: user.mfaRecoveryCodes.filter((h) => h !== hash) },
    })
    return won.count === 1
  }

  /** Turning it off needs the password and a second factor: a borrowed session is not enough. */
  async disable(userId: string, password: string, code: string): Promise<void> {
    const u = await this.user(userId)
    if (!u.mfaEnabled) throw new MfaError('validation', 'Multi-factor sign-in is not on.')
    if (await this.requiredFor(userId)) {
      throw new MfaError('forbidden', 'Your organisation requires multi-factor sign-in, so it cannot be turned off.', 403)
    }
    if (!(await verifyPassword(u.passwordHash, password)) || !(await this.verifySecondFactor(u, code))) {
      throw new MfaError('invalid_credentials', 'Your password or code is not right.', 401)
    }
    await this.db.user.update({ where: { id: userId }, data: CLEARED })
  }

  /** New recovery codes, replacing every old one. Needs a current authenticator code. */
  async regenerateRecoveryCodes(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    const u = await this.user(userId)
    if (!u.mfaEnabled) throw new MfaError('validation', 'Multi-factor sign-in is not on.')
    if (!/^\d{6}$/.test(code.replace(/\s/g, '')) || !(await this.verifySecondFactor(u, code))) {
      throw new MfaError('invalid_mfa_code', 'Enter the current code from your authenticator app.')
    }
    const recoveryCodes = newRecoveryCodes()
    await this.db.user.update({ where: { id: userId }, data: { mfaRecoveryCodes: recoveryCodes.map(hashRecoveryCode) } })
    return { recoveryCodes }
  }
}

/** Every MFA field back to "never set up". Used by turning it off and by an administrator's reset. */
export const CLEARED = {
  mfaEnabled: false,
  mfaSecret: null,
  mfaPendingSecret: null,
  mfaRecoveryCodes: [] as string[],
  mfaLastStep: null,
}
