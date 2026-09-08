import { env } from '../env.js'
import {
  EmailProviderError, emailConfiguration, getEmailProvider, headerSafe,
} from './email/index.js'
import type { ReportData } from './reportService.js'
import type { RenderedReport } from './reportPdf.js'

/**
 * Turning a generated report into an email somebody receives.
 *
 * Two honest outcomes and no third: either a provider accepted the message and gave us an
 * id to prove it, or it did not and the reason is recorded. A run that claims "sent" when
 * nothing left the building is worse than a visible failure - the HSE manager stops
 * checking the app because they believe the email is coming, and the overdue actions sit
 * there for another week.
 */

export interface ReportRecipient {
  userId: string
  name: string
  email: string
}

export interface DeliveryResult {
  /** generated | email_pending | sent | failed */
  status: 'generated' | 'email_pending' | 'sent' | 'failed'
  /** True only when a provider accepted the message for at least one recipient. */
  delivered: boolean
  /** Shown in the run history, verbatim. Says what happened, not what was intended. */
  note: string
  messageId: string | null
  sentAt: Date | null
  failureReason: string | null
  provider: string | null
  accepted: string[]
  rejected: string[]
  /**
   * The provider's error code, kept so the retry policy can tell a blip from a rejected
   * key without re-parsing prose. Null when nothing failed.
   */
  errorCode: string | null
  /** Whether this provider can recognise a repeat, which decides if a retry is safe. */
  providerIdempotent: boolean
}

export function mailProviderConfigured(): boolean {
  /*
   * Asked of the provider rather than of the environment. These were two different
   * questions with two different answers - the environment said a transport was set, the
   * provider said its credential was a placeholder - and this is the one the Reports screen
   * shows, so it was the one telling somebody mail worked when it did not. Going through
   * the factory also means a test that stubs the provider gets a consistent answer here.
   */
  return getEmailProvider() !== null
}

/**
 * Rejects an address that could not be delivered to, before a provider is asked.
 *
 * Deliberately permissive: this catches the empty, the obviously malformed and the
 * pasted-with-a-name cases. Anything subtler is the provider's job to refuse, and its
 * refusal is recorded per address rather than failing the whole run.
 */
const DELIVERABLE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const KB = (n: number) => `${Math.round(n / 1024)} KB`
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** The subject line. Carries the headline number so the inbox list alone is useful. */
export function reportSubject(data: ReportData): string {
  const date = data.periodEnd.toISOString().slice(0, 10)
  const headline = data.summary[0]
  const count = headline ? `${headline.value} ${headline.label.toLowerCase()}` : ''
  // Same reasoning as the invitation subject: this is a header and the company name is
  // tenant-controlled.
  return headerSafe(`${data.companyName} - ${data.title}${count ? ` - ${count}` : ''} - ${date}`)
}

function textBody(data: ReportData, appUrl: string): string {
  return [
    'Good morning,',
    '',
    `Here is your scheduled ${data.title.toLowerCase()} for ${data.companyName}`
      + `${data.siteName ? ` (${data.siteName})` : ''}.`,
    '',
    'Summary:',
    ...data.summary.map((s) => `- ${s.label}: ${s.value}`),
    '',
    data.rows.length === 0
      ? data.emptyMessage
      : `The detailed report is attached as a PDF (${data.rows.length} row(s)).`,
    '',
    `Open SafeOps: ${appUrl}`,
    '',
    'This report was generated automatically by SafeOps.',
    'Not for external distribution.',
  ].join('\n')
}

/**
 * The HTML body.
 *
 * Deliberately plain: table layout, inline styles, no images and no web fonts, because
 * Outlook is what these are read in and it renders almost nothing else reliably. The
 * numbers are in the body so the report is useful on a phone without opening the
 * attachment, which is most of the point of sending it.
 */
function htmlBody(data: ReportData, appUrl: string): string {
  const scope = data.siteName ? `${data.companyName} - ${data.siteName}` : data.companyName
  const cells = data.summary.map((s) => {
    const alarming = /overdue|no investigator|awaiting/i.test(s.label)
      && s.value !== '0' && s.value !== '-'
    return `<td style="padding:0 18px 0 0;vertical-align:top">
      <div style="font:600 10px/1.4 Arial,sans-serif;color:#6b7280;text-transform:uppercase;letter-spacing:.5px">${esc(s.label)}</div>
      <div style="font:700 24px/1.3 Arial,sans-serif;color:${alarming ? '#b91c1c' : '#111827'}">${esc(s.value)}</div>
    </td>`
  }).join('')

  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f3f4f6">
  <table role="presentation" width="100%" style="max-width:640px;margin:0 auto;background:#fff;border-radius:8px;border:1px solid #e5e7eb">
    <tr><td style="padding:24px 24px 8px">
      <div style="font:700 18px/1.2 Arial,sans-serif;color:#0f766e">SafeOps</div>
      <div style="font:400 10px/1.4 Arial,sans-serif;color:#6b7280;letter-spacing:1px">SAFETY INTELLIGENCE PLATFORM</div>
    </td></tr>
    <tr><td style="padding:8px 24px 0">
      <div style="font:700 20px/1.3 Arial,sans-serif;color:#111827">${esc(data.title)}</div>
      <div style="font:400 13px/1.5 Arial,sans-serif;color:#6b7280">${esc(scope)}</div>
    </td></tr>
    <tr><td style="padding:16px 24px 8px;font:400 13px/1.6 Arial,sans-serif;color:#374151">
      Good morning,<br>Here is your scheduled ${esc(data.title.toLowerCase())} for ${esc(data.companyName)}.
    </td></tr>
    <tr><td style="padding:8px 24px 16px">
      <table role="presentation"><tr>${cells}</tr></table>
    </td></tr>
    <tr><td style="padding:0 24px 16px;font:400 13px/1.6 Arial,sans-serif;color:#374151">
      ${data.rows.length === 0
        ? esc(data.emptyMessage)
        : `The detailed report is attached as a PDF (${data.rows.length} row(s)).`}
    </td></tr>
    <tr><td style="padding:0 24px 24px">
      <a href="${esc(appUrl)}" style="display:inline-block;background:#0f766e;color:#fff;font:600 13px Arial,sans-serif;padding:10px 16px;border-radius:6px;text-decoration:none">Open SafeOps</a>
    </td></tr>
    <tr><td style="padding:12px 24px 20px;border-top:1px solid #e5e7eb;font:400 11px/1.5 Arial,sans-serif;color:#9ca3af">
      Generated automatically by SafeOps. Not for external distribution.
    </td></tr>
  </table></body></html>`
}

/**
 * The exact message a run produced.
 *
 * Stored on the run so a retry re-sends this rather than rebuilding it. Rebuilding would
 * re-read the database, and the numbers move: an email saying "4 overdue" with a PDF
 * attached listing 6 is the kind of inconsistency that costs an audit.
 */
export interface DeliveryPayload {
  subject: string
  text: string
  html: string
  /** Who was addressed at generation time. A retry goes to the same people. */
  recipients: ReportRecipient[]
  /** Addresses rejected before a provider was asked. Carried so the note stays accurate. */
  malformed: string[]
}

/** Split the addressees into those worth sending to and those that cannot be delivered. */
function partition(recipients: ReportRecipient[]) {
  return {
    usable: recipients.filter((r) => DELIVERABLE.test(r.email)),
    malformed: recipients.filter((r) => !DELIVERABLE.test(r.email)).map((r) => r.email),
  }
}

/** Build the message for a report, without sending it. */
export function buildDeliveryPayload(
  data: ReportData,
  recipients: ReportRecipient[],
): DeliveryPayload {
  // One definition of where this deployment lives, shared with invitation links. In
  // production it is validated at boot, so this can never be a localhost address there.
  const appUrl = env.appUrl
  const { usable, malformed } = partition(recipients)
  return {
    subject: reportSubject(data),
    text: textBody(data, appUrl),
    html: htmlBody(data, appUrl),
    recipients: usable,
    malformed,
  }
}

/**
 * Hand a prepared message to whichever provider is configured.
 *
 * Every outcome is returned, never thrown. The report itself generated and stored
 * successfully; only delivery is in question, and throwing here would mark the whole run
 * failed and lose the PDF with it when the operator can still download it and act today.
 */
export async function sendDeliveryPayload(input: {
  payload: DeliveryPayload
  pdf: { fileName: string; bytes: Buffer }
  idempotencyKey?: string
}): Promise<DeliveryResult> {
  const { payload, pdf } = input
  const { recipients: usable, malformed } = payload

  const base: DeliveryResult = {
    status: 'generated', delivered: false, note: '', messageId: null,
    sentAt: null, failureReason: null, provider: null, accepted: [], rejected: [],
    errorCode: null, providerIdempotent: false,
  }

  if (usable.length === 0 && malformed.length === 0) {
    return {
      ...base,
      note: 'No active recipients. Nobody in this workspace was addressed.',
      failureReason: 'No active recipients.',
      errorCode: 'no_recipients',
    }
  }

  const provider = getEmailProvider()
  if (!provider) {
    /*
     * The report exists and is stored; only the transport is missing. Saying so exactly is
     * what lets an operator download it from the run history in the meantime, and tells an
     * administrator precisely what to configure.
     */
    return {
      ...base,
      note: `Report generated (${pdf.fileName}, ${KB(pdf.bytes.length)}) for ${usable.length} `
        + `recipient${usable.length === 1 ? '' : 's'}, but it could not be emailed. `
        /*
         * The specific reason when there is one. Telling somebody to "set SMTP_URL" on a
         * deployment that has set SMTP_URL - and whose only fault is the password inside it
         * - sends them to check a line that is already there and reads as a bug in the
         * product rather than a value they still have to fill in.
         */
        + (emailConfiguration().problem
          ?? 'No email provider is configured. Set RESEND_API_KEY (or SMTP_URL) and '
            + 'REPORT_EMAIL_FROM to enable delivery.')
        + ' The PDF is available to download from the run history.'
        + (malformed.length ? ` ${malformed.length} address(es) were not usable.` : ''),
      rejected: [...malformed, ...usable.map((r) => r.email)],
    }
  }

  if (usable.length === 0) {
    return {
      ...base,
      status: 'failed',
      note: `No usable email addresses among ${malformed.length} recipient(s): ${malformed.join(', ')}.`,
      failureReason: 'Every recipient address was malformed.',
      errorCode: 'no_recipients',
      provider: provider.name,
      providerIdempotent: provider.idempotent,
      rejected: malformed,
    }
  }

  try {
    const result = await provider.send({
      to: usable,
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      attachments: [{
        // The exact PDF this run generated, never a second render.
        filename: pdf.fileName,
        content: pdf.bytes,
        contentType: 'application/pdf',
      }],
    })

    const rejected = [...malformed, ...result.rejected]
    if (result.accepted.length === 0) {
      return {
        ...base,
        status: 'failed',
        note: `The provider accepted no recipients. Rejected: ${rejected.join(', ') || 'none reported'}.`,
        failureReason: 'The provider accepted no recipients.',
        errorCode: 'rejected',
        provider: provider.name,
        providerIdempotent: provider.idempotent,
        messageId: result.messageId || null,
        rejected,
      }
    }

    return {
      status: 'sent',
      delivered: true,
      note: `Emailed to ${result.accepted.length} recipient(s).`
        + (rejected.length ? ` ${rejected.length} address(es) were rejected.` : ''),
      messageId: result.messageId || null,
      sentAt: new Date(),
      failureReason: null,
      errorCode: null,
      provider: provider.name,
      providerIdempotent: provider.idempotent,
      accepted: result.accepted,
      rejected,
    }
  } catch (e) {
    const err = e instanceof EmailProviderError ? e : null
    const reason = err ? `${err.code}: ${err.message}` : (e as Error)?.message ?? 'Unknown mail error.'
    return {
      ...base,
      status: 'failed',
      note: `Report generated, but email delivery failed. ${reason}. `
        + 'The report was not marked as sent. The PDF is available to download from the run history.',
      failureReason: reason.slice(0, 400),
      // An unrecognised throw is deliberately not classified as transient: the retry policy
      // only repeats codes somebody has decided are safe to repeat.
      errorCode: err?.code ?? 'unknown_error',
      provider: provider.name,
      providerIdempotent: provider.idempotent,
      rejected: [...malformed, ...usable.map((r) => r.email)],
    }
  }
}

/** First attempt: build the message and send it. */
export async function deliverReport(input: {
  data: ReportData
  pdf: RenderedReport
  recipients: ReportRecipient[]
  idempotencyKey?: string
}): Promise<DeliveryResult & { payload: DeliveryPayload }> {
  const payload = buildDeliveryPayload(input.data, input.recipients)
  const result = await sendDeliveryPayload({
    payload,
    pdf: { fileName: input.pdf.fileName, bytes: input.pdf.bytes },
    idempotencyKey: input.idempotencyKey,
  })
  return { ...result, payload }
}
