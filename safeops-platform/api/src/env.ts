import 'dotenv/config'
import { z } from 'zod'

/**
 * Environment contract. The process refuses to start if anything required is missing or
 * weak, so a misconfigured deploy fails loudly at boot instead of silently running insecurely.
 * No secret has a default value — a fallback secret is the same as no secret.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // RS256 keypair, base64-encoded PEM. Generate with: npm run keygen
  JWT_PRIVATE_KEY_B64: z.string().min(1, 'JWT_PRIVATE_KEY_B64 is required (run: npm run keygen)'),
  JWT_PUBLIC_KEY_B64: z.string().min(1, 'JWT_PUBLIC_KEY_B64 is required (run: npm run keygen)'),
  JWT_ISSUER: z.string().default('safeops-api'),
  JWT_AUDIENCE: z.string().default('safeops-web'),

  ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  // Brute-force policy
  MAX_FAILED_LOGINS: z.coerce.number().int().positive().default(5),
  LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),

  CORS_ORIGINS: z.string().default('http://localhost:5181'),
  COOKIE_DOMAIN: z.string().optional(),

  // The reminder and escalation sweeps run inside the API process. Set to "false" on
  // every instance but one if the API is ever scaled out, so a sweep is not duplicated.
  SCHEDULER_ENABLED: z.enum(['true', 'false']).default('true'),
  SCHEDULER_INTERVAL_MIN: z.coerce.number().int().positive().max(1440).default(15),

  // Where incident evidence is written. This MUST be a persistent volume in production:
  // the default is inside the working directory, which a container platform discards on
  // every redeploy, taking the photographs attached to safety investigations with it.
  UPLOAD_DIR: z.string().default('uploads'),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
  // eslint-disable-next-line no-console
  console.error(`\nInvalid environment configuration:\n${issues}\n`)
  process.exit(1)
}

const raw = parsed.data

function decodeKey(b64: string, label: string): string {
  const pem = Buffer.from(b64, 'base64').toString('utf8')
  if (!pem.includes('-----BEGIN')) {
    // eslint-disable-next-line no-console
    console.error(`${label} does not decode to a PEM key. Re-run: npm run keygen`)
    process.exit(1)
  }
  return pem
}

export const env = {
  ...raw,
  isProd: raw.NODE_ENV === 'production',
  schedulerEnabled: raw.SCHEDULER_ENABLED === 'true' && raw.NODE_ENV !== 'test',
  jwtPrivateKey: decodeKey(raw.JWT_PRIVATE_KEY_B64, 'JWT_PRIVATE_KEY_B64'),
  jwtPublicKey: decodeKey(raw.JWT_PUBLIC_KEY_B64, 'JWT_PUBLIC_KEY_B64'),
  corsOrigins: raw.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
}
