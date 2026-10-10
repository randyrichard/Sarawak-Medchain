import type { ReportRun, ReportSchedule } from '@/api/reportsApi'

/**
 * The decisions the Reports page makes before it renders anything.
 *
 * Kept out of the component for the same reason the incident board's filters are: these are
 * the parts that can be wrong in a way a person notices - a delivery that failed shown as
 * sent, a download button offered for a file that was never written, a management action
 * shown to somebody the server will refuse. Testing them here tests the real path, because
 * the page has no second copy of any of it.
 */

export type BadgeTone = 'good' | 'critical' | 'warning' | 'neutral'

export interface DeliveryBadge {
  label: string
  tone: BadgeTone
}

/**
 * What the run's delivery state should say.
 *
 * Four states, and the difference between two of them matters most: "Generated" means
 * nobody configured a provider and no email was ever going to be sent, while "Retrying"
 * means one is still coming. Collapsing those into a single amber badge is how an operator
 * ends up waiting a week for an email that was never attempted.
 */
export function deliveryBadge(run: Pick<
  ReportRun, 'deliveryStatus' | 'attempts' | 'maxAttempts' | 'nextAttemptAt'
>): DeliveryBadge {
  switch (run.deliveryStatus) {
    case 'sent':
      return { label: 'Sent', tone: 'good' }
    case 'failed':
      return { label: 'Delivery Failed', tone: 'critical' }
    case 'email_pending':
      return {
        // A time on it means a backoff is running, not that it is stuck.
        label: run.nextAttemptAt
          ? `Retrying (${run.attempts} of ${run.maxAttempts})`
          : 'Sending…',
        tone: 'warning',
      }
    default:
      return { label: 'Generated', tone: 'neutral' }
  }
}

/**
 * Whether this role may create, edit, run or delete schedules.
 *
 * Mirrors the server's report roles. Presentation only: every call is re-checked
 * server-side, so hiding a button is a courtesy and never the control.
 */
export const REPORT_MANAGER_ROLES = ['admin', 'hse_manager', 'safety_officer']

export function canManageReports(role: string | null | undefined): boolean {
  return REPORT_MANAGER_ROLES.includes(role ?? '')
}

/**
 * Whether a run has a file to download.
 *
 * Deliberately independent of delivery: a report whose email bounced is still a report, and
 * the operator needs it today. Tying the button to `delivered` would hide the one copy of
 * the thing they are chasing.
 */
export function canDownloadRun(run: Pick<ReportRun, 'status' | 'originalName'>): boolean {
  return run.status === 'success' && Boolean(run.originalName)
}

/** Who a schedule addresses, including anyone who has since left. */
export function recipientSummary(
  s: Pick<ReportSchedule, 'recipients' | 'unreachableRecipients'>,
): string {
  const named = s.recipients.length > 0
    ? `To ${s.recipients.map((r) => r.name).join(', ')}`
    : 'No recipients yet'
  return s.unreachableRecipients > 0
    ? `${named} (${s.unreachableRecipients} no longer in this workspace)`
    : named
}

/**
 * What to tell somebody who just pressed Run now.
 *
 * Never claims an email was sent when no provider is configured - the run history would
 * disagree the moment they looked, and the point of this feature is that the report
 * actually arrives.
 */
export function runFlashMessage(input: {
  name: string
  recipientCount: number
  mailConfigured: boolean | null
  rowCount?: number
}): string {
  if (input.mailConfigured) {
    return `${input.name} generated and sent to ${input.recipientCount} recipient(s).`
  }
  return `${input.name} generated (${input.rowCount ?? 0} rows). `
    + 'Email delivery needs a mail provider — download it from History.'
}
