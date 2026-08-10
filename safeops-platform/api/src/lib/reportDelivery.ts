import { env } from '../env.js'
import { EmailProviderError, getEmailProvider } from './email/index.js'
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
}

export function mailProviderConfigured(): boolean {
  return env.mailConfigured
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
  return `${data.companyName} - ${data.title}${count ? ` - ${count}` : ''} - ${date}`
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

export async function deliverReport(input: {
  data: ReportData
  pdf: RenderedReport
  recipients: ReportRecipient[]
}): Promise<DeliveryResult> {
  const { data, pdf, recipients } = input

  const base: DeliveryResult = {
    status: 'generated', delivered: false, note: '', messageId: null,
    sentAt: null, failureReason: null, provider: null, accepted: [], rejected: [],
  }

  if (recipients.length === 0) {
    return {
      ...base,
      note: 'No active recipients. Nobody in this workspace was addressed.',
      failureReason: 'No active recipients.',
    }
  }

  // Malformed addresses are separated before a provider is asked, so one bad entry in a
  // distribution list does not fail the whole run.
  const usable = recipients.filter((r) => DELIVERABLE.test(r.email))
  const malformed = recipients.filter((r) => !DELIVERABLE.test(r.email)).map((r) => r.email)

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
        + `recipient${usable.length === 1 ? '' : 's'}, but no email provider is configured. `
        + 'Set RESEND_API_KEY (or SMTP_URL) and REPORT_EMAIL_FROM to enable delivery. '
        + 'The PDF is available to download from the run history.'
        + (malformed.length ? ` ${malformed.length} address(es) were not usable.` : ''),
      rejected: [...malformed, ...usable.map((r) => r.email)],
    }
  }

  if (usable.length === 0) {
    return {
      ...base,
      status: 'failed',
      note: `No usable email addresses among ${recipients.length} recipient(s): ${malformed.join(', ')}.`,
      failureReason: 'Every recipient address was malformed.',
      provider: provider.name,
      rejected: malformed,
    }
  }

  const appUrl = env.corsOrigins[0] ?? 'http://localhost:5181'

  try {
    const result = await provider.send({
      to: usable,
      subject: reportSubject(data),
      text: textBody(data, appUrl),
      html: htmlBody(data, appUrl),
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
        provider: provider.name,
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
      provider: provider.name,
      accepted: result.accepted,
      rejected,
    }
  } catch (e) {
    /*
     * A provider refusal is reported, not thrown.
     *
     * The report itself generated and stored successfully; only delivery failed. Throwing
     * would mark the whole run failed and lose the PDF with it, when the operator can
     * still download it and act on the contents today.
     */
    const err = e instanceof EmailProviderError ? e : null
    const reason = err ? `${err.code}: ${err.message}` : (e as Error)?.message ?? 'Unknown mail error.'
    return {
      ...base,
      status: 'failed',
      note: `Report generated, but email delivery failed. ${reason}. `
        + 'The report was not marked as sent. The PDF is available to download from the run history.',
      failureReason: reason.slice(0, 400),
      provider: provider.name,
      rejected: [...malformed, ...usable.map((r) => r.email)],
    }
  }
}
