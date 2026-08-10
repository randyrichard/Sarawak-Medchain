import nodemailer, { type Transporter } from 'nodemailer'
import {
  EmailProviderError,
  type EmailMessage, type EmailProvider, type EmailResult,
} from './provider.js'

/**
 * SMTP, for customers whose mail policy requires everything to leave through their own
 * relay. In this market that is most of the large ones, so it is a first-class provider
 * rather than a fallback.
 */
export class SmtpEmailProvider implements EmailProvider {
  readonly name = 'smtp'
  /*
   * An SMTP relay cannot be asked "did you already receive this?". Once the message is
   * handed over there is no key to repeat and no way to de-duplicate, so an interrupted
   * delivery is reported to the operator rather than retried into a second copy.
   */
  readonly idempotent = false
  private transporter: Transporter | null = null

  constructor(
    private url: string,
    private from: string,
    private replyTo?: string,
    /** Injected in tests so the adapter runs without opening a socket. */
    private transportFactory?: () => Transporter,
  ) {}

  /**
   * One pooled transport, built lazily.
   *
   * A fresh transport per send means a new TCP and TLS handshake for every report, which a
   * relay eventually reads as abuse.
   */
  private transport(): Transporter {
    if (!this.transporter) {
      if (this.transportFactory) return (this.transporter = this.transportFactory())
      this.transporter = nodemailer.createTransport({
        url: this.url,
        pool: true,
        maxConnections: 2,
        // A relay that has stopped answering must not hold a scheduler sweep open.
        connectionTimeout: 15_000,
        greetingTimeout: 10_000,
        socketTimeout: 30_000,
      } as nodemailer.TransportOptions)
    }
    return this.transporter
  }

  async send(message: EmailMessage): Promise<EmailResult> {
    const flat = (v: unknown): string[] =>
      Array.isArray(v)
        ? v.map((x) => (typeof x === 'string' ? x : (x as { address?: string })?.address ?? String(x)))
        : []
    try {
      const info = await this.transport().sendMail({
        from: this.from,
        ...(this.replyTo ? { replyTo: this.replyTo } : {}),
        // Bcc for the same reason as the Resend provider: the distribution list is not
        // something every reader should be handed.
        to: this.from,
        bcc: message.to.map((r) => `${r.name} <${r.email}>`),
        subject: message.subject,
        text: message.text,
        html: message.html,
        attachments: message.attachments.map((a) => ({
          filename: a.filename, content: a.content, contentType: a.contentType,
        })),
      })
      /*
       * The sender is not a recipient.
       *
       * The visible To is our own from-address (recipients are bcc'd), and a relay reports
       * every envelope address as accepted - so the count came back one too high and the
       * history read "Emailed to 3 recipient(s)" when two people received it. An inflated
       * delivery count is exactly the kind of number this feature must not produce.
       */
      const senderAddress = this.from.match(/<([^>]+)>/)?.[1] ?? this.from
      const isSender = (a: string) => a.toLowerCase() === senderAddress.toLowerCase()

      return {
        messageId: info.messageId ?? '',
        accepted: flat(info.accepted).filter((a) => !isSender(a)),
        rejected: flat(info.rejected).filter((a) => !isSender(a)),
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'The mail relay refused the message.'
      const code = (e as { code?: string }).code
      throw new EmailProviderError(
        msg.slice(0, 300),
        /*
         * nodemailer's codes say where in the conversation it broke, which is exactly what
         * decides whether a retry is safe. A connection that never opened delivered
         * nothing; a rejected envelope or a refused login will be rejected identically
         * forever.
         */
        code === 'EAUTH' ? 'auth_failed'
          : code === 'EENVELOPE' || code === 'EMESSAGE' ? 'rejected'
            : code === 'ECONNECTION' || code === 'ESOCKET' || code === 'EDNS' ? 'network_error'
              : code === 'ETIMEDOUT' ? 'timeout'
                : 'provider_error',
      )
    }
  }

  async verify(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.transport().verify()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'SMTP verification failed.' }
    }
  }
}
