/**
 * When a failed report delivery is worth trying again.
 *
 * Two questions decide it, and they are not the same question.
 *
 * The first is whether the failure is transient. A 503 or a dropped connection will very
 * likely succeed in ten minutes; a rejected API key or a malformed address will fail
 * identically forever, and retrying it just fills the history with noise and delays the
 * moment somebody notices the configuration is wrong.
 *
 * The second is whether the provider might already have accepted the message. A request
 * that timed out, or a 500 returned after the payload was received, leaves us genuinely
 * unable to say whether the email went out. Retrying that is only safe if the provider
 * de-duplicates for us. Resend does, via an idempotency key. An SMTP relay does not: once
 * the message is handed over there is no way to ask "did you already get this?", so a retry
 * is a second email in somebody's inbox.
 *
 * Hence the rule: retry a transient failure, and retry an ambiguous one only when the
 * provider can recognise the repeat. Everything else is reported to the operator, who still
 * has the PDF and can decide.
 */

/** Three attempts total. Enough to ride out a blip, few enough to notice a real outage. */
export const MAX_ATTEMPTS = 3

/**
 * Backoff before attempt 2 and attempt 3, in minutes.
 *
 * Tuned to the scheduler's own cadence rather than to a queue's: reports are daily or
 * weekly, so minutes of delay cost nothing, while retrying in seconds would just hit the
 * same outage three times and burn the budget before it cleared.
 */
export const BACKOFF_MINUTES = [5, 15]

/** How long a delivery may sit in email_pending before it is treated as interrupted. */
export const STALE_PENDING_MINUTES = 10

/**
 * Provider error codes that can succeed later.
 *
 * Deliberately a list of what may be retried rather than what may not: a code nobody has
 * classified yet should stop and be looked at, not loop.
 */
const TRANSIENT = new Set(['network_error', 'provider_unavailable', 'timeout', 'rate_limited'])

/**
 * Codes where the provider may already have the message.
 *
 * `network_error` is here because a socket that dies after the request is written is
 * indistinguishable from one that dies before it. `provider_unavailable` is here because a
 * 5xx can be returned by a load balancer that already forwarded the payload.
 */
const AMBIGUOUS = new Set(['network_error', 'provider_unavailable', 'timeout'])

export interface RetryDecision {
  retry: boolean
  /** When the next attempt becomes due. Null when there will not be one. */
  nextAttemptAt: Date | null
  /** Why, in a sentence an operator can act on. Appended to the failure reason. */
  explanation: string
}

/**
 * Decide what happens after a failed delivery attempt.
 *
 * `attempts` is the number already made, including the one that just failed.
 */
export function decideRetry(input: {
  code: string
  attempts: number
  providerIdempotent: boolean
  now?: Date
}): RetryDecision {
  const { code, attempts, providerIdempotent } = input
  const now = input.now ?? new Date()

  if (!TRANSIENT.has(code)) {
    return {
      retry: false,
      nextAttemptAt: null,
      explanation: 'This failure will not resolve on its own, so it was not retried.',
    }
  }

  if (AMBIGUOUS.has(code) && !providerIdempotent) {
    /*
     * The honest answer is "we do not know", and the safe action is to stop.
     *
     * An SMTP relay that vanished mid-conversation may have queued the message. Sending it
     * again could put two copies of a safety report in twelve inboxes, and there is no way
     * to check first. Better to tell the operator, who has the PDF and can re-run it.
     */
    return {
      retry: false,
      nextAttemptAt: null,
      explanation:
        'Delivery was interrupted and this provider cannot confirm whether the message was '
        + 'already accepted, so it was not retried automatically. Download the report from '
        + 'the history, or run it again once the mail server is reachable.',
    }
  }

  if (attempts >= MAX_ATTEMPTS) {
    return {
      retry: false,
      nextAttemptAt: null,
      explanation: `Gave up after ${MAX_ATTEMPTS} attempts.`,
    }
  }

  const minutes = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)]
  return {
    retry: true,
    nextAttemptAt: new Date(now.getTime() + minutes * 60_000),
    explanation: `Attempt ${attempts} of ${MAX_ATTEMPTS} failed; retrying in ${minutes} minutes.`,
  }
}

/**
 * Whether a delivery left stranded in email_pending may be picked up again.
 *
 * This is the crash case: the process died somewhere between "about to send" and "recorded
 * the outcome". Same reasoning as an ambiguous failure - only a provider that recognises a
 * repeat can be asked twice.
 */
export function canResumePending(input: {
  attempts: number
  providerIdempotent: boolean
}): { resume: boolean; reason: string } {
  if (input.attempts === 0) {
    /*
     * The attempt counter is written before the provider is called, so zero means the send
     * had not started when the process stopped. Nothing can have been delivered.
     */
    return { resume: true, reason: 'Delivery had not started when it was interrupted.' }
  }
  if (input.providerIdempotent) {
    return {
      resume: true,
      reason: 'Delivery was interrupted; the provider de-duplicates by idempotency key.',
    }
  }
  if (input.attempts >= MAX_ATTEMPTS) {
    return { resume: false, reason: `Gave up after ${MAX_ATTEMPTS} attempts.` }
  }
  return {
    resume: false,
    reason:
      'Delivery was interrupted after the message was handed to the mail server, which '
      + 'cannot confirm whether it was already accepted. It was not resent automatically. '
      + 'The report is available to download from the history.',
  }
}

/** The idempotency key for a run. Stable across retries, unique per report. */
export function idempotencyKeyFor(runId: string) {
  return `safeops-report-run-${runId}`
}
