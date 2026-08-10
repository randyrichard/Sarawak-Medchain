import type { ReportData } from './reportService.js'
import type { RenderedReport } from './reportPdf.js'

/**
 * Delivering a generated report to its recipients.
 *
 * There is no mail provider configured in this codebase - no SMTP settings, no provider
 * SDK, nothing in env.ts. Rather than pretend, this module is the seam a provider drops
 * into, and it reports honestly that nothing was sent.
 *
 * That honesty matters more than it looks. A report run that claims "delivered" when no
 * mail server exists is worse than a visible failure: the HSE manager stops checking the
 * app because they believe the email is coming, and the overdue actions sit there.
 */

export interface ReportRecipient {
  userId: string
  name: string
  email: string
}

export interface DeliveryResult {
  /** True only when a provider actually accepted the message. */
  delivered: boolean
  /** Shown in the run history, verbatim. Says what happened, not what was intended. */
  note: string
  accepted: string[]
  rejected: string[]
}

/**
 * Whether a mail provider is wired up.
 *
 * Reads configuration rather than a build flag, so configuring SMTP in an environment is
 * all it takes to switch delivery on - no code change and no redeploy of a different
 * build.
 */
export function mailProviderConfigured(): boolean {
  return Boolean(process.env.SMTP_URL || process.env.MAIL_PROVIDER_API_KEY)
}

/** Rejects an address that could not be delivered to, before a provider is even asked. */
const DELIVERABLE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export async function deliverReport(input: {
  data: ReportData
  pdf: RenderedReport
  recipients: ReportRecipient[]
}): Promise<DeliveryResult> {
  const { recipients } = input

  if (recipients.length === 0) {
    return {
      delivered: false,
      note: 'No active recipients. Nobody in this workspace was addressed.',
      accepted: [], rejected: [],
    }
  }

  // Malformed addresses are separated out before anything is sent, so one bad entry in a
  // distribution list does not fail the whole run.
  const usable = recipients.filter((r) => DELIVERABLE.test(r.email))
  const rejected = recipients.filter((r) => !DELIVERABLE.test(r.email)).map((r) => r.email)

  if (!mailProviderConfigured()) {
    /*
     * The report exists and is stored; only the transport is missing. Saying so exactly is
     * what lets an operator download it from the run history in the meantime, and tells an
     * administrator precisely what to configure.
     */
    return {
      delivered: false,
      note: `Report generated (${input.pdf.fileName}, ${Math.round(input.pdf.bytes.length / 1024)} KB) `
        + `for ${usable.length} recipient${usable.length === 1 ? '' : 's'}, but no mail provider is `
        + 'configured. Set SMTP_URL or MAIL_PROVIDER_API_KEY to enable email delivery. '
        + 'The PDF is available to download from the run history.'
        + (rejected.length ? ` ${rejected.length} address(es) were not usable.` : ''),
      accepted: [],
      rejected: [...rejected, ...usable.map((r) => r.email)],
    }
  }

  /*
   * A provider is configured but no adapter is implemented yet.
   *
   * Deliberately not a silent success. Whoever wires up the provider implements the send
   * here; until then this states plainly that the transport is unfinished rather than
   * letting the run history fill with "delivered" against messages nobody received.
   */
  return {
    delivered: false,
    note: 'A mail provider is configured but no send adapter is implemented in this build. '
      + 'The report was generated and stored; it was not emailed.',
    accepted: [],
    rejected: usable.map((r) => r.email),
  }
}
