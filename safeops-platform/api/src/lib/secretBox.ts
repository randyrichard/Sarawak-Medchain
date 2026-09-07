import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { env } from '../env.js'

/**
 * Reversible encryption for the few secrets this service has to be able to read back.
 *
 * Almost nothing qualifies. A password and an API key are only ever *verified* against
 * what somebody presents, so both are hashed and neither can be recovered - that is
 * strictly safer and it is what `password.ts` and `ApiKey.tokenHash` do. This exists for
 * the one case where a digest cannot do the job: a webhook signing secret, which this
 * service uses to compute an HMAC over every payload it sends. You cannot sign with a
 * hash. Storing that secret hashed - which is what the schema originally did, by analogy
 * with the API key beside it - is one of the reasons no webhook was ever delivered.
 *
 * AES-256-GCM, so a tampered ciphertext fails to open rather than decrypting to something
 * attacker-chosen. Sealed output is `v1.<iv>.<tag>.<ciphertext>`, all base64url, with the
 * version first so a future key rotation or algorithm change can be told apart from what
 * is already stored rather than guessed at.
 */

const VERSION = 'v1'
const IV_BYTES = 12 // 96 bits, the size GCM is specified for

export class SecretBoxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SecretBoxError'
  }
}

/**
 * Whether sealing is possible at all.
 *
 * Separate from `seal` so callers can refuse the *action* with an explanation - "webhooks
 * need WEBHOOK_SECRET_KEY_B64" - rather than letting an administrator fill in a form and
 * meet a 500 on submit.
 */
export function secretBoxAvailable(): boolean {
  return env.webhookSecretKey !== null
}

function key(): Buffer {
  const k = env.webhookSecretKey
  if (!k) {
    throw new SecretBoxError(
      'WEBHOOK_SECRET_KEY_B64 is not set, so no signing secret can be stored or read.',
    )
  }
  return k
}

export function seal(plaintext: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return [
    VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    enc.toString('base64url'),
  ].join('.')
}

/**
 * Opens a sealed value.
 *
 * Throws rather than returning null on failure, and the callers turn that into a visible,
 * actionable state on the row rather than a silent skip. The realistic cause is the key
 * having changed since the value was sealed, and a webhook that quietly stops delivering
 * is the worst possible way to find that out.
 */
export function open(sealed: string): string {
  const parts = sealed.split('.')
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new SecretBoxError('This value was not sealed by this version of the product.')
  }
  const [, ivB64, tagB64, dataB64] = parts
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64url'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'))
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
  } catch (e) {
    if (e instanceof SecretBoxError) throw e
    // The authentication tag did not verify. Either the stored value was altered, or - far
    // more likely - WEBHOOK_SECRET_KEY_B64 is not the key this was sealed with.
    throw new SecretBoxError(
      'The stored secret could not be read. WEBHOOK_SECRET_KEY_B64 may have changed since it was saved.',
    )
  }
}
