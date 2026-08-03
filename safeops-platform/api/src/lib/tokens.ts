import { createHash, randomBytes, randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { env } from '../env.js'

export interface AccessClaims {
  sub: string
  email: string
  name: string
  /** Company → role, resolved from Membership rows on the server. */
  roles: { companyId: string; role: string; siteIds: string[] }[]
  jti: string
}

/**
 * Access tokens are RS256-signed. Asymmetric signing means verifiers only ever need the
 * public key — the private key never leaves this service, so nothing downstream (and
 * certainly no browser bundle) can mint a token.
 */
export function signAccessToken(claims: Omit<AccessClaims, 'jti'>): { token: string; expiresAt: Date } {
  const jti = randomUUID()
  const expiresIn = env.ACCESS_TOKEN_TTL_MIN * 60
  const token = jwt.sign({ ...claims, jti }, env.jwtPrivateKey, {
    algorithm: 'RS256',
    expiresIn,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  })
  return { token, expiresAt: new Date(Date.now() + expiresIn * 1000) }
}

/**
 * Verification pins the algorithm to RS256. Without `algorithms`, a token with
 * `alg: none` (or an HS256 token signed with the public key) would be accepted —
 * the classic JWT confusion attack.
 */
export function verifyAccessToken(token: string): AccessClaims | null {
  try {
    return jwt.verify(token, env.jwtPublicKey, {
      algorithms: ['RS256'],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    }) as AccessClaims
  } catch {
    return null
  }
}

/**
 * Refresh tokens are opaque random strings, not JWTs: they must be revocable, and a
 * self-contained token cannot be revoked before it expires.
 */
export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url')
}

/** Only the hash is persisted, so a database dump yields no usable sessions. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function refreshExpiry(): Date {
  return new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)
}

export function newFamilyId(): string {
  return randomUUID()
}

/**
 * Password reset links.
 *
 * Same shape as refresh tokens — opaque, random, stored only as a digest — because a
 * reset link is a bearer credential that hands over an account. 32 bytes keeps it
 * unguessable while staying short enough to paste into a chat message.
 */
export function generateResetToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Deliberately short. The link travels out of band — WhatsApp, a phone call, a note —
 * and every minute it stays valid is a minute it can be found by someone else.
 */
export const RESET_TOKEN_TTL_MIN = 30

export function resetTokenExpiry(): Date {
  return new Date(Date.now() + RESET_TOKEN_TTL_MIN * 60 * 1000)
}
