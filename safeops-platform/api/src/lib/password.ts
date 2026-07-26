import { hash, verify } from '@node-rs/argon2'
import { randomBytes } from 'node:crypto'

/**
 * Argon2id parameters follow the OWASP Password Storage Cheat Sheet baseline
 * (19 MiB memory, 2 iterations, 1 degree of parallelism). Memory-hardness is what
 * makes GPU/ASIC cracking expensive — this is the property bcrypt lacks.
 */
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const

/**
 * A real Argon2id digest, computed once at startup over a random value.
 *
 * It must be genuinely valid: a hand-written placeholder would fail digest parsing in
 * microseconds and do none of the work this exists to simulate.
 */
const dummyDigestPromise: Promise<string> = hash(randomBytes(32).toString('hex'), OPTIONS)

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS)
}

export async function verifyPassword(digest: string, plain: string): Promise<boolean> {
  try {
    return await verify(digest, plain)
  } catch {
    // A malformed/corrupt digest must fail closed, never throw into the auth path.
    return false
  }
}

/**
 * Constant(ish)-work path for unknown accounts.
 *
 * Without this, "no such user" returns in ~1ms while a real user costs ~50ms of Argon2,
 * and that timing difference alone lets an attacker enumerate valid email addresses.
 */
export async function burnEquivalentWork(plain: string): Promise<void> {
  await verifyPassword(await dummyDigestPromise, plain)
}

/**
 * Password policy. Enforced server-side so it cannot be bypassed by calling the API
 * directly. Length is weighted over composition rules, per current NIST guidance.
 */
export function validatePasswordStrength(pw: string): string | null {
  if (pw.length < 12) return 'Password must be at least 12 characters.'
  if (pw.length > 200) return 'Password must be at most 200 characters.'
  if (!/[a-z]/.test(pw)) return 'Password must include a lowercase letter.'
  if (!/[A-Z]/.test(pw)) return 'Password must include an uppercase letter.'
  if (!/[0-9]/.test(pw)) return 'Password must include a number.'
  return null
}
