import { headerSafe, type EmailMessage } from './provider.js'

/**
 * The password-reset email.
 *
 * Deliberately the same shape, layout and provider as the invitation beside it - a person
 * who has seen one should recognise the other as coming from the same system, because
 * "does this look like the last SafeChain email I got?" is most of how anybody judges whether
 * a link is safe to click.
 *
 * Three things differ from the invitation, all on purpose:
 *
 *   - It says plainly what to do if you did not ask for it. A reset arriving unrequested is
 *     the one signal a user gets that somebody is trying their account, and it is useless
 *     unless the mail says so in words they will act on.
 *   - It never names who requested it. The request endpoint is unauthenticated, so that
 *     would be attacker-controlled text printed into a trusted-looking email.
 *   - The expiry is in minutes, not days, and is stated twice. Reset windows are short and
 *     people read email late.
 *
 * No images, no external assets, no JavaScript - corporate mail clients strip all three.
 */

export interface PasswordResetEmailInput {
  recipientEmail: string
  /** Their display name, when known. Falls back to the address. */
  recipientName?: string | null
  resetUrl: string
  expiresInMinutes: number
  /**
   * Set when an administrator issued the link rather than the user asking for it, so the
   * mail can say why it arrived. Never a user-supplied string from an anonymous request.
   */
  issuedByAdmin?: boolean
  productName?: string
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function passwordResetSubject(input: PasswordResetEmailInput): string {
  const product = headerSafe(input.productName ?? 'SafeChain')
  return `Reset your ${product} password`
}

/** Why this landed in their inbox, in one sentence. */
function reason(input: PasswordResetEmailInput): string {
  return input.issuedByAdmin
    ? 'An administrator has issued you a password reset link.'
    : 'Somebody asked to reset the password for this account.'
}

export function passwordResetText(input: PasswordResetEmailInput): string {
  const product = input.productName ?? 'SafeChain'
  return [
    reason(input),
    '',
    `Account: ${input.recipientEmail}`,
    '',
    'Choose a new password here:',
    input.resetUrl,
    '',
    `This link works once and expires in ${input.expiresInMinutes} minutes.`,
    '',
    'If you did not request this, you can ignore this email - your password has not',
    'changed and the link above will expire on its own. If you keep receiving these,',
    'tell your administrator: it may mean somebody is trying to get into your account.',
    '',
    `Sent by ${product}. We will never ask you for your password.`,
  ].join('\n')
}

export function passwordResetHtml(input: PasswordResetEmailInput): string {
  const product = esc(input.productName ?? 'SafeChain')
  const url = esc(input.resetUrl)

  /*
   * Table layout with inline styles throughout, matching the invitation email: Outlook
   * renders with Word's engine, which ignores most modern CSS and collapses a flex layout
   * into one column with the button's background dropped entirely.
   */
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f3f4f6">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;border:1px solid #e5e7eb">
    <tr><td style="padding:24px 24px 4px">
      <div style="font:700 18px/1.2 Arial,sans-serif;color:#0f766e">${product}</div>
      <div style="font:400 10px/1.4 Arial,sans-serif;color:#6b7280;letter-spacing:1px">SAFETY INTELLIGENCE PLATFORM</div>
    </td></tr>

    <tr><td style="padding:16px 24px 0">
      <div style="font:700 20px/1.3 Arial,sans-serif;color:#111827">Reset your password</div>
      <div style="padding-top:8px;font:400 14px/1.6 Arial,sans-serif;color:#374151">
        ${esc(reason(input))} Choose a new one below.
      </div>
    </td></tr>

    <tr><td style="padding:16px 24px 0">
      <table role="presentation" style="border-collapse:collapse">
        <tr>
          <td style="padding:3px 12px 3px 0;font:400 12px/1.5 Arial,sans-serif;color:#6b7280;white-space:nowrap">Account</td>
          <td style="padding:3px 0;font:600 12px/1.5 Arial,sans-serif;color:#111827">${esc(input.recipientEmail)}</td>
        </tr>
        <tr>
          <td style="padding:3px 12px 3px 0;font:400 12px/1.5 Arial,sans-serif;color:#6b7280;white-space:nowrap">Link expires</td>
          <td style="padding:3px 0;font:600 12px/1.5 Arial,sans-serif;color:#111827">${input.expiresInMinutes} minutes from now</td>
        </tr>
      </table>
    </td></tr>

    <tr><td style="padding:20px 24px 8px">
      <a href="${url}" style="display:inline-block;background:#0f766e;color:#fff;font:600 14px Arial,sans-serif;padding:12px 22px;border-radius:6px;text-decoration:none">Choose a new password</a>
    </td></tr>

    <tr><td style="padding:4px 24px 16px">
      <div style="font:400 11px/1.5 Arial,sans-serif;color:#6b7280">
        If the button does not work, copy this address into your browser:
      </div>
      <div style="padding-top:4px;font:400 11px/1.5 'Courier New',monospace;color:#374151;word-break:break-all">${url}</div>
    </td></tr>

    <tr><td style="padding:0 24px 20px">
      <div style="border-left:3px solid #f59e0b;padding:8px 12px;background:#fffbeb;font:400 12px/1.6 Arial,sans-serif;color:#92400e">
        This link works once and expires in ${input.expiresInMinutes} minutes.
        Do not forward it &mdash; anyone who opens it can take over the account.
      </div>
    </td></tr>

    <tr><td style="padding:12px 24px 20px;border-top:1px solid #e5e7eb;font:400 11px/1.5 Arial,sans-serif;color:#9ca3af">
      If you did not request this, ignore this email &mdash; your password has not changed and
      the link expires on its own. If these keep arriving, tell your administrator: it may
      mean somebody is trying to get into your account.<br>
      Sent by ${product}. We will never ask you for your password.
    </td></tr>
  </table></body></html>`
}

/** The whole message, ready for whichever provider is configured. */
export function buildPasswordResetEmail(
  input: PasswordResetEmailInput,
  idempotencyKey: string,
): EmailMessage {
  const name = input.recipientName?.trim() || input.recipientEmail
  return {
    to: [{ name, email: input.recipientEmail }],
    subject: passwordResetSubject(input),
    text: passwordResetText(input),
    html: passwordResetHtml(input),
    attachments: [],
    idempotencyKey,
  }
}
