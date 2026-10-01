import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Time-based one-time passwords (RFC 6238), the codes an authenticator app shows.
 *
 * Written out rather than pulled in as a dependency because it is forty lines of standard
 * arithmetic over `crypto.createHmac`, and every authenticator in use - Google, Microsoft,
 * Authy, 1Password - speaks exactly this profile: HMAC-SHA1, six digits, thirty seconds.
 * The test file checks it against the RFC's own published vectors.
 */

const STEP_SECONDS = 30
const DIGITS = 6
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** RFC 4648 base32, unpadded - the form authenticator apps expect a secret in. */
export function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, '')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch)
    if (idx < 0) throw new Error('Not a base32 string.')
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

/** A new secret: 160 bits, the size RFC 4226 recommends for HMAC-SHA1. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20))
}

/** The 30-second step a moment falls in. */
export function stepAt(ms: number): number {
  return Math.floor(ms / 1000 / STEP_SECONDS)
}

/** The code for one step (RFC 4226 dynamic truncation). */
export function codeAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const mac = createHmac('sha1', base32Decode(secret)).update(counter).digest()
  const offset = mac[mac.length - 1] & 0x0f
  const binary = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3]
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0')
}

/**
 * Checks a code, and returns the step it belongs to, or null.
 *
 * One step either side is accepted: a phone clock a little out, or a code typed in the last
 * seconds of its window, is the ordinary case on a site. A step at or before `afterStep` is
 * refused even if the code is right - that is what makes each code single-use.
 */
export function verifyTotp(secret: string, code: string, now = Date.now(), afterStep: number | null = null): number | null {
  const digits = code.replace(/\s/g, '')
  if (!/^\d{6}$/.test(digits)) return null
  const current = stepAt(now)
  for (const step of [current - 1, current, current + 1]) {
    if (afterStep !== null && step <= afterStep) continue
    const expected = Buffer.from(codeAt(secret, step))
    if (timingSafeEqual(expected, Buffer.from(digits))) return step
  }
  return null
}

/**
 * The `otpauth://` URI an authenticator app reads from a QR code.
 *
 * The issuer appears both as a parameter and as the label prefix: older apps read one,
 * newer ones the other, and both have to say SafeOps for the entry to be recognisable on a
 * phone that holds twenty of them.
 */
export function otpauthUri(issuer: string, account: string, secret: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`
  const params = new URLSearchParams({
    secret, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(STEP_SECONDS),
  })
  return `otpauth://totp/${label}?${params.toString()}`
}
