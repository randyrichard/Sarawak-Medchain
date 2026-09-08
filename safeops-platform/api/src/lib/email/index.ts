import { env } from '../../env.js'
import { ResendEmailProvider } from './resendProvider.js'
import { SmtpEmailProvider } from './smtpProvider.js'
import { mailTransportChoice } from './credentials.js'
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
  /*
   * The choice is made in credentials.ts, not here, because it was also being made in
   * env.ts and the two disagreed - see mailTransportChoice. A credential nobody replaced is
   * not a configured transport: returning a provider for one is what made the failure
   * invisible, with invitations and resets reported as emailed and the link withheld, and
   * the refusal surfacing one message at a time at the relay.
   */
  const choice = mailTransportChoice(env)

  if (choice.transport === 'resend') {
    return {
      provider: new ResendEmailProvider(choice.key, choice.from, env.MAIL_REPLY_TO),
      problem: null,
    }
  }
  if (choice.transport === 'smtp') {
    return {
      provider: new SmtpEmailProvider(choice.url, choice.from, env.MAIL_REPLY_TO),
      problem: null,
    }
  }
  return { provider: null, problem: choice.problem }
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
