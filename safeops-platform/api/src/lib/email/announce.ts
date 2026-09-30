import { env } from '../../env.js'

/**
 * Says at boot whether this deployment can send mail.
 *
 * It could not, for weeks, and nothing said so. The product handled it correctly - links
 * were handed to administrators instead of being emailed, reports recorded as not sent -
 * but the operator's only way to find out was to open the Reports screen and read a field.
 * A password left as `APP_PASSWORD` deserves a line in the log the morning it is deployed,
 * not a discovery through a customer who never received an invitation.
 *
 * A warning rather than a refusal to start, for the reason in credentials.ts: mail being
 * off is a workable state, and taking the API down over it would be a poor trade.
 *
 * Both processes say it: the API sends invitations and resets, the worker sends the
 * scheduled reports.
 */
export function announceMail(tag: string): void {
  /* eslint-disable no-console */
  if (env.mail.problem) {
    console.warn(`[${tag}] mail is NOT working: ${env.mail.problem}`)
    console.warn(`[${tag}] run "node dist/cli/verifyMail.js" once fixed to confirm it.`)
  } else if (env.mail.transport) {
    console.log(`[${tag}] mail via ${env.mail.transport} as ${env.mail.from}`)
  } else {
    console.log(`[${tag}] no mail transport configured; links are handed over in-app`)
  }
  /* eslint-enable no-console */
}
