import { describe, it, expect } from 'vitest'
import jwt from 'jsonwebtoken'
import { env } from '../env.js'
import {
  signAccessToken, verifyAccessToken, generateRefreshToken, hashRefreshToken,
} from './tokens.js'

const claims = {
  sub: 'u-1',
  email: 'hse@demo.safeops.app',
  name: 'Marcus Tan',
  roles: [{ companyId: 'big', role: 'hse_manager', siteIds: [] }],
}

describe('access tokens', () => {
  it('signs with RS256 and round-trips the claims', () => {
    const { token } = signAccessToken(claims)
    expect(jwt.decode(token, { complete: true })?.header.alg).toBe('RS256')

    const verified = verifyAccessToken(token)
    expect(verified?.sub).toBe('u-1')
    expect(verified?.roles[0].role).toBe('hse_manager')
    expect(verified?.jti).toBeTruthy()
  })

  it('rejects a token signed by a different key', () => {
    const foreign = jwt.sign(claims, 'attacker-secret', { algorithm: 'HS256' })
    expect(verifyAccessToken(foreign)).toBeNull()
  })

  it('rejects the alg:none confusion attack', () => {
    const unsigned = jwt.sign(claims, '', { algorithm: 'none' })
    expect(verifyAccessToken(unsigned)).toBeNull()
  })

  it('rejects an HS256 token signed with the public key (algorithm confusion)', () => {
    // The classic attack: treat the RSA *public* key as an HMAC secret. Pinning
    // algorithms: ['RS256'] at verification time is what defeats it.
    const forged = jwt.sign(claims, env.jwtPublicKey, { algorithm: 'HS256' })
    expect(verifyAccessToken(forged)).toBeNull()
  })

  it('rejects an expired token', () => {
    const expired = jwt.sign(claims, env.jwtPrivateKey, {
      algorithm: 'RS256', expiresIn: -10, issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE,
    })
    expect(verifyAccessToken(expired)).toBeNull()
  })

  it('rejects a token issued for a different audience or issuer', () => {
    const wrongAud = jwt.sign(claims, env.jwtPrivateKey, {
      algorithm: 'RS256', expiresIn: 600, issuer: env.JWT_ISSUER, audience: 'someone-else',
    })
    expect(verifyAccessToken(wrongAud)).toBeNull()

    const wrongIss = jwt.sign(claims, env.jwtPrivateKey, {
      algorithm: 'RS256', expiresIn: 600, issuer: 'evil-issuer', audience: env.JWT_AUDIENCE,
    })
    expect(verifyAccessToken(wrongIss)).toBeNull()
  })

  it('rejects a tampered payload', () => {
    const { token } = signAccessToken(claims)
    const [h, p, s] = token.split('.')
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString())
    payload.roles = [{ companyId: 'big', role: 'admin', siteIds: [] }] // privilege escalation attempt
    const tamperedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
    expect(verifyAccessToken(`${h}.${tamperedPayload}.${s}`)).toBeNull()
  })
})

describe('refresh tokens', () => {
  it('generates high-entropy opaque tokens', () => {
    const a = generateRefreshToken()
    const b = generateRefreshToken()
    expect(a).not.toBe(b)
    // 48 random bytes → 64 base64url chars.
    expect(a.length).toBeGreaterThanOrEqual(64)
  })

  it('stores only a hash, and the hash is deterministic for lookup', () => {
    const raw = generateRefreshToken()
    const h1 = hashRefreshToken(raw)
    const h2 = hashRefreshToken(raw)
    expect(h1).toBe(h2)
    expect(h1).not.toContain(raw)
    expect(h1).toHaveLength(64) // sha256 hex
  })
})
