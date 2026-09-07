import { env } from '../../env.js'
import { ResendEmailProvider } from './resendProvider.js'
import { SmtpEmailProvider } from './smtpProvider.js'
import { resendPlaceholderProblem, smtpPlaceholderProblem } from './credentials.js'
import type { EmailProvider } from './provider.js'

export * from './provider.js'
export { ResendEmailProvider } from './resendProvider.js'
export { SmtpEmailProvider } from './smtpProvider.js'

/**
 * Which provider, if any, is configured.
 *
 * Resend wins when both are set, because a deployment that has been given an API key has
 * been given it deliberately. Nothing configured returns null, and the delivery service
 * records that honestly rather than pretending.
 */
let override: EmailProvider | null | undefined

export function getEmailProvider(): EmailProvider | null {
  // Set by tests so the provider can be exercised without touching a real vendor.
  if (override !== undefined) return override
  return providerOrProblem().provider
}

/**
 * The provider, or the reason there is not one.
 *
 * Split out so the reason can reach a screen. "Email is not configured" sends an
 * administrator to add a setting that is already there; "the password in SMTP_URL is still
 * a placeholder" sends them to the line that is actually wrong.
 */
export function providerOrProblem(): { provider: EmailProvider | null; problem: string | null } {
  if (!env.REPORT_EMAIL_FROM) {
    return {
      provider: null,
      problem: env.RESEND_API_KEY || env.SMTP_URL
        ? 'A mail transport is configured but REPORT_EMAIL_FROM is not, so every message '
          + 'would be rejected for having no sender.'
        : null,
    }
  }

  if (env.RESEND_API_KEY) {
    const problem = resendPlaceholderProblem(env.RESEND_API_KEY)
    return problem
      ? { provider: null, problem }
      : {
          provider: new ResendEmailProvider(
            env.RESEND_API_KEY, env.REPORT_EMAIL_FROM, env.MAIL_REPLY_TO,
          ),
          problem: null,
        }
  }

  if (env.SMTP_URL) {
    /*
     * A credential nobody replaced is not a configured transport.
     *
     * Returning a provider here is what made the failure invisible: the product believed it
     * could send, so invitations and resets were reported as emailed and the link was not
     * offered, and the failure surfaced one message at a time at the relay. Reported as
     * unconfigured, every one of those paths already does the right thing - see
     * credentials.ts for why this is not a boot refusal.
     */
    const problem = smtpPlaceholderProblem(env.SMTP_URL)
    return problem
      ? { provider: null, problem }
      : {
          provider: new SmtpEmailProvider(
            env.SMTP_URL, env.REPORT_EMAIL_FROM, env.MAIL_REPLY_TO,
          ),
          problem: null,
        }
  }

  return { provider: null, problem: null }
}

/** Test seam. Pass null to simulate an unconfigured deployment, undefined to restore. */
export function setEmailProviderForTests(p: EmailProvider | null | undefined) {
  override = p
}

/**
 * What the UI is told: whether reports can actually be emailed, by whom, and if not, why.
 *
 * `problem` is null both when mail works and when nobody has configured any - those are
 * different states, and the second is a deliberate choice rather than a fault. It is set
 * only when somebody configured mail and it cannot work.
 */
export function emailConfiguration() {
  const { provider, problem } = override === undefined
    ? providerOrProblem()
    : { provider: override, problem: null }
  return { configured: !!provider, provider: provider?.name ?? null, problem }
}
