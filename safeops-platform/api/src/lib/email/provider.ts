/**
 * The email provider seam.
 *
 * Report generation must not know which vendor sends the mail. Behind this interface sit
 * Resend (the default) and SMTP (for customers who insist their own Exchange server sends
 * anything leaving their domain, which in this market is most of the large ones). Swapping
 * or adding one is a new file and a line in the factory, not a change to the report system.
 */

/**
 * Flatten a value that is about to become part of a header.
 *
 * A subject is a header, and a header ends at a newline. Tenant-controlled text reaches
 * ours - the company name, the report title - so a name containing CRLF would end the
 * Subject line and start whatever the rest of it spells, which is how "Bcc: someone-else"
 * gets added to a message.
 *
 * nodemailer already collapses this before it reaches the wire, and that was confirmed
 * against a real relay rather than assumed. This exists so the guarantee does not depend on
 * which provider happens to be configured: the Resend path hands the subject to an API this
 * environment cannot test, and a subject reading "Acme Bcc: attacker@evil.test" is a
 * phishing aid even where no header is actually injected.
 */
export function headerSafe(value: string): string {
  /*
   * Filtered by code point rather than by a regex character class. A class spelling out the
   * control range needs \u escapes, and those are exactly the characters most likely to be
   * mangled by whatever edits this file next - which would silently turn the guard off.
   * This form cannot be quietly broken by an escaping mistake.
   */
  let flat = ''
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0
    flat += code < 0x20 || code === 0x7f ? ' ' : ch
  }
  // Runs of whitespace collapsed, and bounded: a subject is not a place for an essay.
  return flat.replace(/\s{2,}/g, ' ').trim().slice(0, 200)
}

export interface EmailAttachment {
  filename: string
  content: Buffer
  contentType: string
}

export interface EmailMessage {
  /** Resolved server-side from the schedule's user ids. Never taken from the browser. */
  to: { name: string; email: string }[]
  subject: string
  text: string
  html: string
  attachments: EmailAttachment[]
  /**
   * Stable per report run, so a provider that supports it can recognise a retry of the
   * same message and return the original result instead of sending a second copy.
   */
  idempotencyKey?: string
}

export interface EmailResult {
  /** The provider's own id, for answering "did it actually go?" from their dashboard. */
  messageId: string
  accepted: string[]
  rejected: string[]
}

/**
 * A provider refusal, as distinct from a bug in our code.
 *
 * Carries a code and a message that are safe to store and show. Never the request body,
 * never a header, never the API key - a run history is read by operators and exported.
 */
export class EmailProviderError extends Error {
  constructor(
    message: string,
    public code: string = 'provider_error',
    /** HTTP status where the provider gave one. Useful for telling 4xx from 5xx. */
    public status?: number,
  ) {
    super(message)
    this.name = 'EmailProviderError'
  }
}

export interface EmailProvider {
  /** Short identifier stored on the run: resend | smtp */
  readonly name: string
  /**
   * Whether repeating a send with the same idempotency key is safe.
   *
   * This is what decides if an interrupted delivery can be retried automatically. A vendor
   * API that de-duplicates says true; an SMTP relay, which has no way to be asked "did you
   * already get this?", says false and its failures are reported instead of retried.
   */
  readonly idempotent: boolean
  send(message: EmailMessage): Promise<EmailResult>
  /** Checks the credentials without sending, for the configuration health view. */
  verify(): Promise<{ ok: boolean; error?: string }>
}
