/**
 * Catching mail that is configured but cannot possibly send.
 *
 * The failure this exists for: `SMTP_URL=smtps://user:APP_PASSWORD@smtp.gmail.com:465` sat
 * in a deployment for weeks. Every check passed - a provider was configured, the envelope
 * sender was set, the process booted - and the product therefore believed it could send
 * mail. It could not. Every invitation, every password reset and every scheduled report
 * failed at the relay, one at a time, at the exact moment somebody needed it.
 *
 * Half-configured mail is worse than none, which the neighbouring check in env.ts already
 * says. This is the other half of that: a credential nobody ever replaced is not a
 * configured mail transport, and the honest thing is to report the deployment as having no
 * mail rather than to keep promising a delivery that fails later and elsewhere.
 *
 * Reporting it as unconfigured is deliberately more useful than refusing to boot, and it is
 * why this differs from the missing-sender check beside it. With no provider, the product
 * already does the right thing everywhere: `showLink` hands an administrator the invitation
 * or reset link to pass on by hand, and the report history records "not sent" rather than
 * inventing a delivery. So the same misconfiguration becomes a visible, workable state
 * instead of an outage - and taking the whole API down over a mail password would be a poor
 * trade for that.
 *
 * The value is never echoed anywhere. If the guess is wrong and it really is somebody's
 * password, this must not be the thing that writes it to a log.
 */

/**
 * Template values, not weak ones.
 *
 * Everything here is a marker that ships in documentation and gets pasted without being
 * replaced - `password` and `user` are the literal strings in .env.prod.example, and
 * `APP_PASSWORD` is the convention every Gmail app-password guide uses. Judging password
 * *quality* is deliberately not attempted: a relay's own credential can be anything, and a
 * guess that locks out a working deployment is worse than the problem being solved.
 */
const PLACEHOLDER_SECRETS = new Set([
  'password',
  'app_password',
  'your_password',
  'your_app_password',
  'smtp_password',
  'your_smtp_password',
  'changeme',
  'change_me',
  'placeholder',
  'todo',
  'secret',
  'xxx',
  'xxxx',
  'xxxxxxxx',
])

const PLACEHOLDER_USERS = new Set(['user', 'username', 'your_user', 'youruser'])

/**
 * Domains that exist only in documentation. `example.*` is reserved by RFC 2606.
 *
 * Matched as suffixes, not as exact hosts. The first version of this listed whole
 * hostnames and so waved through `smtp.yourcompany.com` - which is the actual string in
 * .env.prod.example, and therefore the one shape it most needed to catch. Anything at or
 * under these names is documentation.
 */
const PLACEHOLDER_DOMAINS = [
  'yourcompany.com',
  'your-company.com',
  'yourdomain.com',
  'yourprovider.com',
  'example.com',
  'example.org',
  'example.net',
]

function isDocumentationHost(host: string): boolean {
  return PLACEHOLDER_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))
}

/** `<anything>` or `{{anything}}`, the other two shapes a template marker takes. */
function isBracketed(v: string): boolean {
  return /^<.*>$/.test(v) || /^\{\{.*\}\}$/.test(v)
}

function isPlaceholderSecret(raw: string): boolean {
  const v = raw.trim().toLowerCase()
  if (!v) return true
  if (isBracketed(v)) return true
  // A run of x or * of any length, which is how a password gets written down redacted and
  // then pasted back as though it were the password.
  if (/^[x*]{3,}$/.test(v)) return true
  return PLACEHOLDER_SECRETS.has(v)
}

/**
 * Why this SMTP URL cannot send, or null if nothing is obviously wrong.
 *
 * "Obviously" is the whole scope. This catches a value nobody replaced; it cannot tell a
 * correct password from a wrong one, which is what `npm run mail:verify` is for - that
 * opens a connection and authenticates against the real relay.
 */
export function smtpPlaceholderProblem(url: string): string | null {
  const SHAPE = 'SMTP_URL is not a usable URL, so no mail can be sent. It should look like '
    + 'smtps://user:password@smtp.yourprovider.com:465'

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return SHAPE
  }
  /*
   * Parsing is a lower bar than it looks. `smtp.gmail.com:465` throws nothing - it is read
   * as the scheme "smtp.gmail.com:" with the path "465" - so it arrives here as a valid URL
   * with no host, no user and no password, and every check below would find nothing wrong
   * with it. Dropping the scheme is an easy thing to do while editing an environment file.
   */
  if (!parsed.hostname) return SHAPE

  if (parsed.password && isPlaceholderSecret(decodeURIComponent(parsed.password))) {
    return 'The password in SMTP_URL is still a placeholder, so every message would be '
      + 'refused by the relay. Replace it with the real one - for Gmail that is an app '
      + 'password, not the account password.'
  }
  if (parsed.username && PLACEHOLDER_USERS.has(decodeURIComponent(parsed.username).toLowerCase())) {
    return 'The username in SMTP_URL is still the placeholder from .env.prod.example.'
  }
  const host = parsed.hostname.toLowerCase()
  if (isDocumentationHost(host)) {
    return `SMTP_URL points at ${host}, which is a documentation hostname and accepts no mail.`
  }
  /*
   * A URL with no password at all is not flagged. Plenty of relays authenticate by IP
   * allow-list or a client certificate, and an internal Exchange server commonly needs no
   * credential from inside the network - refusing those would break working deployments to
   * catch a typo.
   */
  return null
}

/** The same question for a Resend key, which has one unmistakable shape. */
export function resendPlaceholderProblem(key: string): string | null {
  const v = key.trim()
  if (!v || isPlaceholderSecret(v) || isBracketed(v)) {
    return 'RESEND_API_KEY is still a placeholder, so every message would be rejected.'
  }
  // Every key Resend issues carries this prefix. Anything else is a value from a guide.
  if (!v.startsWith('re_')) {
    return 'RESEND_API_KEY does not look like a Resend key, which begin with "re_".'
  }
  return null
}

/** The environment fields that decide whether mail can be sent. */
export interface MailSettings {
  RESEND_API_KEY?: string
  SMTP_URL?: string
  REPORT_EMAIL_FROM?: string
}

/**
 * Which transport a configuration selects, carrying the values that made it selectable so
 * the caller needs no assertion to use them.
 */
export type MailTransportChoice =
  | { transport: 'resend'; key: string; from: string; problem: null }
  | { transport: 'smtp'; url: string; from: string; problem: null }
  | { transport: null; problem: string | null }

/**
 * The one place that decides whether a deployment can send mail.
 *
 * It was two places, and they disagreed. `env.mailConfigured` asked only whether the
 * settings were present - a transport and a sender - while the provider factory also ran
 * the checks above. On a deployment whose SMTP password was still `APP_PASSWORD` the first
 * said yes and the second said no, so the Reports screen was told mail was wired while
 * every send was correctly refused. That is the exact failure the checks above exist to
 * prevent, surviving in the one code path that never asked them.
 *
 * Resend wins when both are configured, because an API key is not set by accident.
 */
export function mailTransportChoice(settings: MailSettings): MailTransportChoice {
  const { RESEND_API_KEY, SMTP_URL, REPORT_EMAIL_FROM } = settings

  if (!REPORT_EMAIL_FROM) {
    return {
      transport: null,
      // Only a problem if somebody meant to send mail. A deployment with no transport at
      // all has not misconfigured anything.
      problem: RESEND_API_KEY || SMTP_URL
        ? 'A mail transport is configured but REPORT_EMAIL_FROM is not, so every message '
          + 'would be rejected for having no sender.'
        : null,
    }
  }

  if (RESEND_API_KEY) {
    const problem = resendPlaceholderProblem(RESEND_API_KEY)
    return problem
      ? { transport: null, problem }
      : { transport: 'resend', key: RESEND_API_KEY, from: REPORT_EMAIL_FROM, problem: null }
  }

  if (SMTP_URL) {
    const problem = smtpPlaceholderProblem(SMTP_URL)
    return problem
      ? { transport: null, problem }
      : { transport: 'smtp', url: SMTP_URL, from: REPORT_EMAIL_FROM, problem: null }
  }

  return { transport: null, problem: null }
}
