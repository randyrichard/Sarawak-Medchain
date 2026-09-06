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

  /*
   * WHICH addresses are allowed to speak for a client via X-Forwarded-For.
   *
   * This replaced a hop count, and the reason is that a hop count cannot do the job. It says
   * how many entries to trust and never who is entitled to add them, so with any non-zero
   * value Express treats whoever opened the socket as a legitimate proxy. Demonstrated
   * against this API: three requests differing only in an X-Forwarded-For header produced
   * three separate rate-limit buckets, so rotating that header yields unlimited fresh
   * budgets - and since req.ip is also written to the audit trail and login history, the
   * security log can be filled with addresses of the caller's choosing.
   *
   * An address list closes it. X-Forwarded-For is believed only when the peer that sent it
   * is on this list; from anyone else it is ignored and req.ip is the socket address, which
   * cannot be forged over TCP.
   *
   * Accepts Express's keywords (loopback, linklocal, uniquelocal), plain addresses, and
   * CIDR ranges, comma-separated. `false` trusts nothing and is correct when the process is
   * reachable directly.
   *
   * The default covers the bundled deployment - Caddy reaches the API over the private
   * compose network, and nothing on a public address is believed. A CDN in front does not
   * change it: Cloudflare talks to Caddy, Caddy talks to this, and Caddy is still the peer.
   * Name Cloudflare's ranges here only if it reaches this process directly.
   */
  TRUST_PROXY: z.string().default('loopback,linklocal,uniquelocal'),

  /*
   * A secret the reverse proxy presents to prove it is the reverse proxy.
   *
   * TRUST_PROXY alone is not sufficient behind Docker, and that is not a subtlety - it was
   * measured. Every connection arriving through a published port is source-NATed to the
   * bridge gateway, 172.19.0.1 here, which is a private address and therefore matches
   * `uniquelocal`. So the address list cannot tell Caddy on the compose network apart from
   * anything else that can reach the port: after switching to the list, three requests
   * differing only in an X-Forwarded-For header still produced three rate-limit buckets.
   *
   * An address cannot settle this because Docker rewrote it. A secret can. When this is set
   * the API strips X-Forwarded-For from any request that does not carry the matching token,
   * so a forged header from a client is discarded before anything reads req.ip, whatever
   * address the packet appears to come from.
   *
   * Optional. Unset, the API falls back to TRUST_PROXY alone, which is correct when nothing
   * NATs the proxy's address - and the boot check below refuses that combination in
   * production, where it is far more likely to be an oversight than a decision.
   */
  PROXY_TOKEN: z.string().min(16).optional(),

  /*
   * Deliberately still declared, so that a deployment carrying the old variable fails loudly
   * rather than silently reverting to the behaviour it was set for. See the check below.
   */
  TRUST_PROXY_HOPS: z.string().optional(),

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
 * TRUST_PROXY_HOPS was a hop count, and a hop count cannot say who is entitled to set
 * X-Forwarded-For - only how many entries to believe. Any non-zero value therefore treated
 * whoever opened the socket as a proxy, so a client could name its own address and be
 * believed, and both the rate limiter and the audit trail followed the header.
 *
 * Refused rather than ignored. A deployment that still carries the old variable was
 * configured by somebody who believed it did something, and quietly dropping it would leave
 * them thinking a control is in place while the process trusts a different set of peers.
 */
if (raw.TRUST_PROXY_HOPS !== undefined) {
  // eslint-disable-next-line no-console
  console.error(`
TRUST_PROXY_HOPS is no longer used, and left as-is it would weaken this deployment.

A hop count cannot distinguish a real proxy from a client claiming to be one, so any
value above 0 let callers forge X-Forwarded-For, choosing both their own rate-limit
bucket and the address written into the audit trail.

Replace it with TRUST_PROXY, which lists the peers allowed to speak for a client:

  TRUST_PROXY=loopback,linklocal,uniquelocal   the bundled stack: Caddy on the private
                                               compose network. This is the default.
  TRUST_PROXY=false                            nothing in front; trust no header
  TRUST_PROXY=10.0.0.5,192.168.1.0/24          only these peers
`)
  process.exit(1)
}

/**
 * The parsed trust-proxy setting, in the shape Express wants.
 *
 * `false` disables header trust entirely. Otherwise it is a list, and Express checks the
 * peer against it before believing anything the peer forwarded.
 */
function parseTrustProxy(value: string): false | string[] {
  const trimmed = value.trim()
  if (trimmed === '' || trimmed.toLowerCase() === 'false') return false
  return trimmed.split(',').map((v) => v.trim()).filter(Boolean)
}

/*
 * Half-configured mail is worse than none.
 *
 * With SMTP_URL set but no MAIL_FROM every send is rejected by the relay, and the run
 * history fills with failures whose cause is a missing line in the environment. Refused at
 * boot, in keeping with the rest of this file: a misconfigured deploy fails loudly rather
 * than silently doing nothing useful every Monday.
 */
/*
 * Trusting forwarded headers in production without a way to authenticate the proxy.
 *
 * Behind Docker the address list cannot do this alone: published ports are source-NATed to
 * the bridge gateway, a private address, so `uniquelocal` ends up trusting anything that can
 * reach the port. Measured, not assumed - forged X-Forwarded-For headers still produced
 * separate rate-limit buckets after the list was introduced.
 *
 * So in production either the proxy proves itself with PROXY_TOKEN, or header trust is
 * turned off with TRUST_PROXY=false and every visitor is attributed to the proxy. Both are
 * defensible. Trusting the header with no way to check who sent it is not, and it fails
 * silently: the rate limiter keeps answering and the audit trail keeps filling, with
 * whatever the caller chose to write in them.
 */
if (raw.NODE_ENV === 'production' && parseTrustProxy(raw.TRUST_PROXY) !== false && !raw.PROXY_TOKEN) {
  // eslint-disable-next-line no-console
  console.error(`
TRUST_PROXY is set to trust forwarded headers, but PROXY_TOKEN is not set, so there is no
way to tell the real proxy from a client claiming to be one. Behind Docker that is not
theoretical: published ports are source-NATed to the bridge gateway, which is a private
address, so the address list trusts anything that can reach the port. A caller can then
choose its own rate-limit bucket and the address written into the audit trail.

Pick one:

  PROXY_TOKEN=<a long random value>   and set the same value in deploy/Caddyfile, which
                                      sends it as X-SafeOps-Proxy. Generate one with:
                                        openssl rand -hex 32

  TRUST_PROXY=false                   no proxy in front, or you accept that every visitor
                                      is recorded as the proxy's address
`)
  process.exit(1)
}

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

  /*
   * A database reached across a network must be reached over TLS.
   *
   * The bundled deployment runs PostgreSQL as a container on a private compose network and
   * publishes no port, so plaintext there never leaves the host and requiring TLS would be
   * ceremony. A managed database is the opposite: DigitalOcean, RDS and Cloud SQL are all
   * reached over a network the connection genuinely crosses, and every row of this product
   * — injury records, medical restrictions, password hashes — crosses it too.
   *
   * The check is on the host rather than on a flag, because the dangerous case is precisely
   * the one an operator reaches by editing DATABASE_URL to point somewhere new and not
   * thinking about the query string. Refused at boot, for the same reason as the https rule
   * above: a connection that is silently in the clear is not a thing anybody notices.
   */
  const LOCAL_DB = /^(localhost|127\.0\.0\.1|\[?::1\]?|db|postgres|database)$/i
  try {
    const dbUrl = new URL(raw.DATABASE_URL)
    const sslmode = dbUrl.searchParams.get('sslmode')
    const encrypted = sslmode !== null && sslmode !== 'disable' && sslmode !== 'allow'

    /*
     * A Unix socket never crosses a network, so TLS is meaningless for it.
     *
     * Prisma spells that `?host=/var/run/postgresql`, and the hostname slot then holds a
     * placeholder that parses as an ordinary host — so without this the guard refuses a
     * perfectly safe local connection. Found by the test for the unparseable case, which
     * turned out to parse.
     */
    const unixSocket = dbUrl.searchParams.get('host')?.startsWith('/') ?? false

    if (!LOCAL_DB.test(dbUrl.hostname) && !unixSocket && !encrypted) {
      // eslint-disable-next-line no-console
      console.error(
        `DATABASE_URL points at ${dbUrl.hostname}, which is not on this host, and does not\n`
        + 'require TLS. Everything this product stores would cross that network in the clear,\n'
        + 'including medical restrictions and password hashes.\n'
        + 'Append "?sslmode=require" (or "verify-full" with the provider CA) to DATABASE_URL.\n'
        + 'A database running beside the API on the compose network does not need this and is\n'
        + 'not affected.',
      )
      process.exit(1)
    }
  } catch {
    /*
     * Not a parseable URL. Left alone deliberately: Prisma accepts forms this constructor
     * does not, and a connection string that is genuinely malformed fails at the first query
     * with a far better message than anything guessed here.
     */
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
  /** Peers allowed to set X-Forwarded-For, in the shape Express's `trust proxy` expects. */
  trustProxy: parseTrustProxy(raw.TRUST_PROXY),
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
