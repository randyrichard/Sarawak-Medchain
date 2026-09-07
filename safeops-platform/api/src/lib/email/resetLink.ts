import { env } from '../../env.js'

/**
 * What an operator is told after a reset link is issued: "we emailed it", or the link.
 *
 * One copy, used by every command that issues one. There were two, and they had already
 * drifted - the newer one printed the bare path underneath the full URL and the older one
 * did not, so the same deployment answered the same question differently depending on
 * which command you happened to run. A third copy was one CLI away.
 *
 * The link is printed only when the email did not go. Once a provider has accepted the
 * message there is no reason to also put a working credential on a terminal, into shell
 * history, and into whatever captures the output of a deploy script.
 */

/**
 * The token goes in the query string, not the path.
 *
 * The web app's route is `/reset-password` with no parameter - the page reads `?token=`,
 * and the admin console builds its links the same way. Printed as
 * `/reset-password/<token>` this matched no route at all, so the one link that lets a fresh
 * deployment's first administrator set a password opened a not-found page and the account
 * could never be used. The token itself was fine, which is exactly why testing it against
 * the API missed it: what needed checking was the URL.
 */
export function resetLinkPath(token: string): string {
  return `/reset-password?token=${encodeURIComponent(token)}`
}

export function linkOrSent(
  delivery: { delivered: boolean; showLink: boolean; reason?: string },
  token: string,
): string {
  if (delivery.delivered) return 'A single-use link has been emailed to them.\n'
  const path = resetLinkPath(token)
  return (
    `${delivery.reason ? `Email was not sent: ${delivery.reason}\n\n` : ''}`
    + 'Set a password with this single-use link:\n\n'
    + `  ${env.appUrl}${path}\n\n`
    /*
     * The host is APP_PUBLIC_URL, which is the address the deployment believes it is served
     * at - routinely not the address the operator's own browser can reach. A pilot box
     * answering on localhost while APP_PUBLIC_URL names the eventual public domain is the
     * normal case, not an edge one, and a link to a hostname that does not resolve is
     * indistinguishable from a broken token. That is a bad half hour to hand somebody who
     * is already locked out.
     */
    + 'If that host is not the one your browser reaches this deployment at, keep the path\n'
    + 'and change the host:\n\n'
    + `  ${path}\n`
  )
}
