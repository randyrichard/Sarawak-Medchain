import { headerSafe, type EmailMessage } from './provider.js'
import { businessTimeZone } from '../../domain/businessDay.js'

/**
 * The invitation email.
 *
 * Same shape as the scheduled report email and the same provider behind it - this module
 * only decides what the message says. It is the first thing a new user ever sees from the
 * product, and it arrives unsolicited, so it has to read like an invitation from their own
 * company rather than a marketing blast: who invited them, to what, what it lets them do,
 * when it stops working, and a plain sentence about not forwarding it.
 *
 * No images, no external assets, no JavaScript. Corporate mail clients strip all three, and
 * an invitation that renders as a blank rectangle behind a "load remote content" prompt is
 * an invitation nobody accepts.
 */

export interface InvitationEmailInput {
  companyName: string
  recipientEmail: string
  inviterName: string
  roleLabel: string
  siteNames: string[]
  departmentName: string | null
  acceptUrl: string
  expiresAt: Date
  /** Product name, so the subject reads the same wherever branding is set. */
  productName?: string
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** "18 August 2026" — unambiguous across the locales this product ships to. */
function longDate(d: Date): string {
  return d.toLocaleDateString('en-GB', {
    // The recipient's business day, not UTC: an invitation expiring at 01:00 local is that day's.
    day: 'numeric', month: 'long', year: 'numeric', timeZone: businessTimeZone(),
  })
}

export function invitationSubject(input: InvitationEmailInput): string {
  const product = headerSafe(input.productName ?? 'SafeChain')
  // The company name is tenant-controlled and this is a header.
  return `You're invited to join ${headerSafe(input.companyName)} on ${product}`
}

/** The details worth repeating in both bodies, in the order somebody reads them. */
function facts(input: InvitationEmailInput): [string, string][] {
  const rows: [string, string][] = [
    ['Organisation', input.companyName],
    ['Your email', input.recipientEmail],
    ['Role', input.roleLabel],
  ]
  if (input.departmentName) rows.push(['Department', input.departmentName])
  if (input.siteNames.length === 1) rows.push(['Site', input.siteNames[0]])
  else if (input.siteNames.length > 1) rows.push(['Sites', input.siteNames.join(', ')])
  rows.push(['Invitation expires', longDate(input.expiresAt)])
  return rows
}

export function invitationText(input: InvitationEmailInput): string {
  const product = input.productName ?? 'SafeChain'
  const lines = [
    `${input.inviterName} has invited you to join ${input.companyName} on ${product}.`,
    '',
    ...facts(input).map(([k, v]) => `${k}: ${v}`),
    '',
    'Accept your invitation and choose a password:',
    input.acceptUrl,
    '',
    `This link works once and expires on ${longDate(input.expiresAt)}.`,
    'Do not forward it - anyone who opens it can create the account in your name.',
    '',
    `If you were not expecting this, ignore this email and tell ${input.inviterName}.`,
    '',
    `Sent by ${product} on behalf of ${input.companyName}.`,
  ]
  return lines.join('\n')
}

export function invitationHtml(input: InvitationEmailInput): string {
  const product = esc(input.productName ?? 'SafeChain')
  const url = esc(input.acceptUrl)

  const rows = facts(input).map(([k, v]) => `
      <tr>
        <td style="padding:3px 12px 3px 0;font:400 12px/1.5 Arial,sans-serif;color:#6b7280;white-space:nowrap">${esc(k)}</td>
        <td style="padding:3px 0;font:600 12px/1.5 Arial,sans-serif;color:#111827">${esc(v)}</td>
      </tr>`).join('')

  /*
   * Table layout with inline styles throughout. Outlook renders with Word's engine, which
   * ignores most modern CSS; a flexbox layout collapses into a single column there and the
   * button loses its background entirely.
   */
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f3f4f6">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;border:1px solid #e5e7eb">
    <tr><td style="padding:24px 24px 4px">
      <div style="font:700 18px/1.2 Arial,sans-serif;color:#0f766e">${product}</div>
      <div style="font:400 10px/1.4 Arial,sans-serif;color:#6b7280;letter-spacing:1px">SAFETY INTELLIGENCE PLATFORM</div>
    </td></tr>

    <tr><td style="padding:16px 24px 0">
      <div style="font:700 20px/1.3 Arial,sans-serif;color:#111827">
        Join ${esc(input.companyName)}
      </div>
      <div style="padding-top:8px;font:400 14px/1.6 Arial,sans-serif;color:#374151">
        ${esc(input.inviterName)} has invited you to ${esc(input.companyName)}&rsquo;s safety
        workspace. Accept below to choose a password and sign in.
      </div>
    </td></tr>

    <tr><td style="padding:16px 24px 0">
      <table role="presentation" style="border-collapse:collapse">${rows}</table>
    </td></tr>

    <tr><td style="padding:20px 24px 8px">
      <a href="${url}" style="display:inline-block;background:#0f766e;color:#fff;font:600 14px Arial,sans-serif;padding:12px 22px;border-radius:6px;text-decoration:none">Accept invitation</a>
    </td></tr>

    <tr><td style="padding:4px 24px 16px">
      <div style="font:400 11px/1.5 Arial,sans-serif;color:#6b7280">
        If the button does not work, copy this address into your browser:
      </div>
      <div style="padding-top:4px;font:400 11px/1.5 'Courier New',monospace;color:#374151;word-break:break-all">${url}</div>
    </td></tr>

    <tr><td style="padding:0 24px 20px">
      <div style="border-left:3px solid #f59e0b;padding:8px 12px;background:#fffbeb;font:400 12px/1.6 Arial,sans-serif;color:#92400e">
        This link works once and expires on ${esc(longDate(input.expiresAt))}.
        Do not forward it &mdash; anyone who opens it can create the account in your name.
      </div>
    </td></tr>

    <tr><td style="padding:12px 24px 20px;border-top:1px solid #e5e7eb;font:400 11px/1.5 Arial,sans-serif;color:#9ca3af">
      If you were not expecting this, ignore this email and tell ${esc(input.inviterName)}.<br>
      Sent by ${product} on behalf of ${esc(input.companyName)}.
    </td></tr>
  </table></body></html>`
}

/** The whole message, ready for whichever provider is configured. */
export function buildInvitationEmail(
  input: InvitationEmailInput,
  idempotencyKey: string,
): EmailMessage {
  return {
    to: [{ name: input.recipientEmail, email: input.recipientEmail }],
    subject: invitationSubject(input),
    text: invitationText(input),
    html: invitationHtml(input),
    attachments: [],
    idempotencyKey,
  }
}
