import { env } from '../../env.js'
import { ResendEmailProvider } from './resendProvider.js'
import { SmtpEmailProvider } from './smtpProvider.js'
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

  if (!env.REPORT_EMAIL_FROM) return null
  if (env.RESEND_API_KEY) {
    return new ResendEmailProvider(env.RESEND_API_KEY, env.REPORT_EMAIL_FROM, env.MAIL_REPLY_TO)
  }
  if (env.SMTP_URL) {
    return new SmtpEmailProvider(env.SMTP_URL, env.REPORT_EMAIL_FROM, env.MAIL_REPLY_TO)
  }
  return null
}

/** Test seam. Pass null to simulate an unconfigured deployment, undefined to restore. */
export function setEmailProviderForTests(p: EmailProvider | null | undefined) {
  override = p
}

/** What the UI is told: whether reports can actually be emailed, and by whom. */
export function emailConfiguration() {
  const p = getEmailProvider()
  return { configured: !!p, provider: p?.name ?? null }
}
