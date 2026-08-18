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

  /*
   * Email delivery for scheduled reports.
   *
   * All optional: with none of it set the platform runs exactly as before and reports are
   * generated and stored but not sent. Setting SMTP_URL is what turns delivery on, so an
   * environment can enable it without a code change or a different build.
   *
   * SMTP rather than one vendor's SDK because every provider speaks it - Resend, SES,
   * Postmark, Mailgun and a customer's own Exchange server all work through the same
   * configuration, which matters when selling to companies with their own mail policy.
   */
  /// Resend, the default provider. Its presence selects it.
  RESEND_API_KEY: z.string().optional(),
  /// SMTP, for customers who require mail to leave through their own relay.
  SMTP_URL: z.string().optional(),
  /// The envelope sender, e.g. "SafeOps <safeops@yourcompany.com>". Required whenever a
  /// provider is configured; checked below.
  REPORT_EMAIL_FROM: z.string().optional(),
  MAIL_REPLY_TO: z.string().optional(),

  CORS_ORIGINS: z.string().default('http://localhost:5181'),
  /**
   * Where this deployment is reachable from a browser.
   *
   * Every link that leaves the building - invitation, password reset, the button in a
   * scheduled report - is built from this. Optional in development, where the first CORS
   * origin is a sensible stand-in; required in production, because a link to localhost in
   * somebody's inbox is worse than no link at all.
   */
  APP_PUBLIC_URL: z.string().url().optional(),
  COOKIE_DOMAIN: z.string().optional(),

  // The reminder and escalation sweeps run inside the API process. Set to "false" on
  // every instance but one if the API is ever scaled out, so a sweep is not duplicated.
  SCHEDULER_ENABLED: z.enum(['true', 'false']).default('true'),
  SCHEDULER_INTERVAL_MIN: z.coerce.number().int().positive().max(1440).default(15),

  /**
   * Requests per minute per client IP, across every endpoint except health.
   *
   * Sized for a whole office, not one person. A customer behind corporate NAT presents as
   * a single IP, so this budget is shared by everyone there: at 600 a forty-person site
   * loading a nine-request dashboard a few times a minute would throttle itself. The
   * ceiling exists to stop one compromised account exhausting the connection pool, not to
   * pace normal use, so it is set well above what people generate and is tunable for
   * customers whose traffic shape surprises us.
   */
  RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().max(100_000).default(3000),

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

/*
 * Half-configured mail is worse than none.
 *
 * With SMTP_URL set but no MAIL_FROM every send is rejected by the relay, and the run
 * history fills with failures whose cause is a missing line in the environment. Refused at
 * boot, in keeping with the rest of this file: a misconfigured deploy fails loudly rather
 * than silently doing nothing useful every Monday.
 */
/**
 * A production deployment must know its own public address.
 *
 * Refused at boot rather than discovered later: an invitation pointing at localhost is
 * indistinguishable from a working one until the recipient clicks it, by which time the
 * token has been spent on nothing and the administrator is chasing a link that never
 * resolved.
 */
if (raw.NODE_ENV === 'production') {
  const url = raw.APP_PUBLIC_URL ?? ''
  if (!url) {
    // eslint-disable-next-line no-console
    console.error(
      'APP_PUBLIC_URL is required in production (e.g. "https://app.yourcompany.com"). '
      + 'Invitation and password links are built from it.',
    )
    process.exit(1)
  }
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(url)) {
    // eslint-disable-next-line no-console
    console.error(
      `APP_PUBLIC_URL is set to ${url}, which nobody outside this machine can reach. `
      + 'Set it to the address your users actually visit.',
    )
    process.exit(1)
  }
  /*
   * https, not http.
   *
   * Every link built from this carries a single-use credential in the URL: the invitation
   * that creates somebody's account, and the password-reset link that takes one over. Over
   * plaintext those are readable by anything between the recipient and the server, and the
   * token is all an attacker needs - no password required.
   *
   * TLS terminates upstream of this container, so the process cannot detect the scheme for
   * itself; this value is the only place the deployment declares it. Refused at boot for
   * the same reason as everything else in this file - a misconfiguration that only shows up
   * as "somebody else accepted the invitation" is not one you find in time.
   */
  if (!/^https:\/\//i.test(url)) {
    // eslint-disable-next-line no-console
    console.error(
      `APP_PUBLIC_URL is ${url}, which is not https. Invitation and password-reset links\n`
      + 'are built from it and each one carries a single-use credential in the URL, so\n'
      + 'sending them over plaintext hands the account to anybody on the path.\n'
      + 'Terminate TLS in front of this deployment and set the https address here.',
    )
    process.exit(1)
  }
  /*
   * Reserved domains, which mean somebody deployed the example configuration.
   *
   * RFC 2606 and RFC 6761 set these aside precisely so they can never belong to anyone:
   * example.com/net/org, and the .test, .invalid, .example and .localhost suffixes. A
   * production deployment on one of them is not a deployment, it is `.env.prod.example`
   * that nobody filled in - and the failure it produces is invitations pointing at a
   * domain the customer cannot reach, discovered when they say nothing arrived.
   *
   * Deliberately narrow. It matches only names that are guaranteed unusable, so a real
   * hostname can never trip it.
   *
   * `localhost` is deliberately absent. APP_PUBLIC_URL rejects it above for its own
   * reasons, and CORS_ORIGINS legitimately names it when the stack is run in production
   * mode locally - which is how this deployment gets verified before it reaches a
   * customer. Refusing it here would remove that check rather than add one.
   */
  const RESERVED = /(^|\.)(example\.(com|net|org)|invalid|test|example)$/i
  const hostsToCheck: [string, string][] = [
    ['APP_PUBLIC_URL', url],
    ...raw.CORS_ORIGINS.split(',').map((o) => ['CORS_ORIGINS', o.trim()] as [string, string]),
  ]
  for (const [name, value] of hostsToCheck) {
    if (!value) continue
    let host: string
    try {
      host = new URL(value).hostname
    } catch {
      continue // CORS_ORIGINS entries are validated where they are used
    }
    if (RESERVED.test(host)) {
      // eslint-disable-next-line no-console
      console.error(
        `${name} points at ${host}, which is a reserved documentation domain and cannot\n`
        + 'belong to any real deployment. This is the example configuration - replace every\n'
        + 'hostname in .env.prod with the addresses your customers actually visit, and\n'
        + 'regenerate the database password and signing keys while you are there.',
      )
      process.exit(1)
    }
  }
}

if ((raw.RESEND_API_KEY || raw.SMTP_URL) && !raw.REPORT_EMAIL_FROM) {
  // eslint-disable-next-line no-console
  console.error(
    'REPORT_EMAIL_FROM is required when an email provider is configured '
    + '(e.g. "SafeOps <safeops@yourcompany.com>"). Without it every send is rejected by the '
    + 'provider and the run history fills with failures caused by a missing line in the environment.',
  )
  process.exit(1)
}

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
  /** One place that decides whether reports can actually be emailed. */
  mailConfigured: Boolean((raw.RESEND_API_KEY || raw.SMTP_URL) && raw.REPORT_EMAIL_FROM),
  /**
   * The one definition of "where this app lives", used by every outbound link.
   *
   * Production is validated above, so the fallbacks here only ever apply in development.
   */
  appUrl: (raw.APP_PUBLIC_URL
    ?? raw.CORS_ORIGINS.split(',')[0]?.trim()
    ?? 'http://localhost:5181').replace(/\/+$/, ''),
}
