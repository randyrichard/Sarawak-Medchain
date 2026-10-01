import { generateKeyPairSync, randomBytes } from 'node:crypto'

/**
 * Generates the RS256 keypair used to sign access tokens, base64-encoded for .env.
 * Keys are printed, never written to disk, so they don't end up committed by accident.
 *
 *   npm run keygen
 */
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64')

console.log('\n# Add these to safeops-platform/api/.env (never commit this file)\n')
console.log(`JWT_PRIVATE_KEY_B64=${b64(privateKey)}`)
console.log(`JWT_PUBLIC_KEY_B64=${b64(publicKey)}`)
// 32 bytes for AES-256. Seals webhook signing secrets so they can be read back to
// sign each payload - see api/src/lib/secretBox.ts.
console.log(`WEBHOOK_SECRET_KEY_B64=${randomBytes(32).toString("base64")}`)
// 32 bytes for AES-256. Seals each person's authenticator secret - see mfaService.ts.
console.log(`MFA_SECRET_KEY_B64=${randomBytes(32).toString("base64")}`)
// The restricted database login - see lib/dbRole.ts. URL-safe, so it needs no escaping.
console.log(`APP_DB_PASSWORD=${randomBytes(24).toString("base64url")}`)
console.log('')
console.log('\n# Rotate by regenerating: existing access tokens stop verifying immediately,')
console.log('# and clients recover on their next refresh.\n')
console.log('# Rotating WEBHOOK_SECRET_KEY_B64 is NOT routine: it makes every existing')
console.log('# webhook secret unreadable, and each webhook has to be recreated. That is')
console.log('# why it is separate from the JWT keys, which are meant to be rotated freely.')
console.log('# Rotating MFA_SECRET_KEY_B64 is not routine either: everyone enrolled in MFA')
console.log('# has to have it reset by an administrator and set it up again.')
