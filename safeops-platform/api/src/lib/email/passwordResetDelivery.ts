import { env } from '../../env.js'
import { getEmailProvider } from './index.js'
import { EmailProviderError } from './provider.js'
import { buildPasswordResetEmail } from './passwordResetEmail.js'

/**
 * The one place a password-reset link is turned into an email.
 *
 * Three callers issue reset links - an administrator resetting somebody in their workspace,
 * the CLI that bootstraps or recovers a platform administrator, and the self-service
 * request on the sign-in page. Before this, each one printed or returned the raw link and
 * left a human to deliver it. They now all come through here, so the wording, the expiry,
 * the failure behaviour and the rule about what may be logged are decided once.
 *
 * Mirrors `deliverInvitation` deliberately, including its contract: nothing is thrown, the
 * caller is told what happened, and the raw link is handed back **only** when delivery did
 * not happen. A provider outage must not cost somebody their way back into the account -
 * but once a provider has accepted the message there is no reason to put a working
 * credential through a second system that might log it.
 */

/**
 * Where a reset link points.
 *
 * `env.appUrl` and nothing else. Never a Host header, never anything from the request - an
 * attacker who can set Host would otherwise receive a valid token pointed at their own
 * server, which is the whole account. Production additionally refuses to boot unless this
 * is https; see env.ts.
 */
export function passwordResetUrl(token: string): string {
  return `${env.appUrl}/reset-password?token=${encodeURIComponent(token)}`
}

export interface ResetDeliveryResult {
  /** True only when a provider accepted the message. */
  delivered: boolean
  /**
   * Whether the caller should surface the raw link for manual delivery. True whenever the
   * email did not go, for any reason, including no provider being configured.
   */
  showLink: boolean
  /** Safe to show an administrator and safe to store. Never provider internals. */
  reason?: string
  /** resend | smtp | null */
  provider: string | null
}

/**
 * Send a reset link, or explain why it could not be sent.
 *
 * @param token the raw reset token. Used to build the URL and then discarded - it is never
 *        logged, never returned in `reason`, and never written to an audit row.
 */
export async function sendPasswordResetEmail(input: {
  token: string
  recipientEmail: string
  recipientName?: string | null
  expiresInMinutes: number
  issuedByAdmin?: boolean
  /** Distinct per issued link, so a provider that de-duplicates recognises a retry. */
  idempotencyKey: string
}): Promise<ResetDeliveryResult> {
  const provider = getEmailProvider()
  if (!provider) {
    return {
      delivered: false,
      showLink: true,
      provider: null,
      reason: 'No email provider is configured, so no reset email was sent. Set RESEND_API_KEY '
        + '(or SMTP_URL) together with REPORT_EMAIL_FROM to enable delivery.',
    }
  }

  const message = buildPasswordResetEmail({
    recipientEmail: input.recipientEmail,
    recipientName: input.recipientName ?? null,
    resetUrl: passwordResetUrl(input.token),
    expiresInMinutes: input.expiresInMinutes,
    issuedByAdmin: input.issuedByAdmin,
  }, input.idempotencyKey)

  try {
    const result = await provider.send(message)
    /*
     * A provider can accept a request and still reject the recipient - a suppressed address,
     * a hard bounce on file. Treating that as success would tell an administrator the mail
     * is on its way when the provider has already decided it is not.
     */
    if (result.rejected.length && !result.accepted.length) {
      return {
        delivered: false,
        showLink: true,
        provider: provider.name,
        reason: 'The email provider rejected that address. Check it is correct and not on a '
          + 'suppression list, or pass the link on by hand.',
      }
    }
    return { delivered: true, showLink: false, provider: provider.name }
  } catch (err) {
    /*
     * Never rethrown. The reset token is already committed and still valid; failing the
     * whole request here would leave a live token nobody can use and an administrator
     * staring at a 500.
     *
     * Only the provider's own message and code are kept. Never the request body, never a
     * header, never the API key - this string is shown to an administrator and may be
     * stored.
     */
    const safe = err instanceof EmailProviderError
      ? `${err.message}${err.status ? ` (status ${err.status})` : ''}`
      : 'The email provider could not be reached.'
    /*
     * Logged without the token and without the URL - the URL contains the token, so the two
     * rules are the same rule. The address is logged because diagnosing "did it go?"
     * without knowing who it was for is not diagnosis.
     */
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({
      t: new Date().toISOString(),
      event: 'password_reset_email_failed',
      provider: provider.name,
      to: input.recipientEmail,
      reason: safe,
    }))
    return { delivered: false, showLink: true, provider: provider.name, reason: safe }
  }
}
