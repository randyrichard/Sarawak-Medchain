/**
 * Does this deployment's mail configuration actually work?
 *
 * Until now the only way to find out was to do something that sends a message - invite
 * somebody, reset a password, wait for Monday's report - and see whether it arrived. That
 * makes a wrong credential something you discover through a customer, which is the worst
 * possible channel for it. This asks the relay directly.
 *
 *   node dist/cli/verifyMail.js                       (connect and authenticate only)
 *   node dist/cli/verifyMail.js --send-to me@work.com (also send one real message)
 *
 * Without --send-to nothing leaves the building: an SMTP connection is opened, TLS is
 * negotiated and the credential is authenticated, then the connection is closed. That is
 * enough to catch every configuration fault that matters - wrong password, wrong host,
 * blocked port, expired certificate - and it can be run against production without putting
 * a test message in anybody's inbox.
 *
 * Lives under src/ rather than scripts/ for the same reason as the other two: the runtime
 * installs with --omit=dev and copies only dist/, so a tsx script is not present on the
 * machine that needs to answer this question.
 */
import { env } from '../env.js'
import { providerOrProblem } from '../lib/email/index.js'
import { EmailProviderError } from '../lib/email/provider.js'

const sendTo = (() => {
  const i = process.argv.indexOf('--send-to')
  return i === -1 ? undefined : process.argv[i + 1]
})()

/** Present on the SMTP provider, which is the only one with a connection to check. */
function canVerify(p: unknown): p is { verify(): Promise<{ ok: boolean; error?: string }> } {
  return typeof (p as { verify?: unknown })?.verify === 'function'
}

async function main() {
  const { provider, problem } = providerOrProblem()

  if (!provider) {
    if (problem) {
      console.error(`Mail is configured but cannot send.\n\n  ${problem}\n`)
      console.error(
        'Until this is fixed the product does the honest thing rather than the silent one:\n'
        + 'invitations and password resets hand the administrator a link to pass on, and the\n'
        + 'report history records them as not sent.',
      )
      process.exitCode = 1
      return
    }
    console.log(
      'No mail transport is configured on this deployment.\n\n'
      + 'That is a valid state, not a fault: invitations and password resets return a link\n'
      + 'to pass on by hand, and scheduled reports are generated and stored without being\n'
      + 'emailed. To enable delivery set REPORT_EMAIL_FROM together with either\n'
      + 'RESEND_API_KEY or SMTP_URL.',
    )
    return
  }

  console.log(`Provider: ${provider.name}`)
  console.log(`Sender:   ${env.REPORT_EMAIL_FROM}`)
  if (env.MAIL_REPLY_TO) console.log(`Reply-to: ${env.MAIL_REPLY_TO}`)
  console.log('')

  if (canVerify(provider)) {
    const result = await provider.verify()
    if (!result.ok) {
      /*
       * The relay's own words, not a summary of them.
       *
       * "Username and Password not accepted" and "self signed certificate in certificate
       * chain" need completely different fixes, and any wording invented here would blur
       * the two. Gmail in particular answers a normal account password with an
       * authentication failure, which is the single most common way this is got wrong.
       */
      console.error(`Could not authenticate with the relay:\n\n  ${result.error}\n`)
      console.error(
        'If this is Gmail, the credential must be a 16-character app password from\n'
        + 'https://myaccount.google.com/apppasswords, not the account password, and\n'
        + '2-Step Verification has to be on before that page will issue one.',
      )
      process.exitCode = 1
      return
    }
    console.log('Connected and authenticated. The relay accepts this credential.')
  } else {
    // Resend has no connection to open; its key is only exercised by a real send.
    console.log(
      'This provider has no connection to test. Use --send-to to check the key with a\n'
      + 'real message.',
    )
  }

  if (!sendTo) {
    console.log(
      '\nNothing was sent. To confirm a message actually arrives:\n'
      + '  node dist/cli/verifyMail.js --send-to you@yourcompany.com',
    )
    return
  }

  console.log(`\nSending one test message to ${sendTo} ...`)
  try {
    const result = await provider.send({
      to: [{ email: sendTo, name: 'SafeChain test' }],
      subject: 'SafeChain mail test',
      text: 'This is a test message from SafeChain. If it arrived, mail delivery works on '
        + 'this deployment - invitations, password resets and scheduled reports will be '
        + 'delivered.',
      html: '<p>This is a test message from SafeChain. If it arrived, mail delivery works on '
        + 'this deployment &mdash; invitations, password resets and scheduled reports will '
        + 'be delivered.</p>',
      attachments: [],
      idempotencyKey: `safeops-mailtest-${Date.now()}`,
    })
    if (result.rejected.length && !result.accepted.length) {
      /*
       * A relay can accept the conversation and refuse the recipient - a bad address, or a
       * hard bounce already on file. Reporting that as success is exactly the lie this
       * command exists to stop.
       */
      console.error(`The relay refused the recipient: ${result.rejected.join(', ')}`)
      process.exitCode = 1
      return
    }
    console.log(
      `Accepted for ${result.accepted.join(', ') || sendTo}.\n`
      + 'Check the inbox, including spam. Accepted by the relay is not the same as landed '
      + 'in a mailbox.',
    )
  } catch (e) {
    const why = e instanceof EmailProviderError ? `${e.code}: ${e.message}` : String(e)
    console.error(`The send failed:\n\n  ${why}`)
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exitCode = 1
})
