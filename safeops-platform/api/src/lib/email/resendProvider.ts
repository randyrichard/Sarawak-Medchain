import {
  EmailProviderError,
  type EmailMessage, type EmailProvider, type EmailResult,
} from './provider.js'

/**
 * Resend, over its REST API.
 *
 * Called with fetch rather than the SDK: the surface used here is one POST, and a
 * dependency that ships its own HTTP stack is not worth carrying for that. It also keeps
 * the failure handling ours, which matters because what we store in the run history has to
 * be safe to show an operator.
 */
const ENDPOINT = 'https://api.resend.com/emails'

export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend'
  /*
   * Resend honours an Idempotency-Key header: a repeat with the same key returns the
   * original response rather than sending again. That is what makes automatic retry of an
   * ambiguous failure safe here and unsafe over SMTP.
   */
  readonly idempotent = true

  constructor(
    private apiKey: string,
    private from: string,
    private replyTo?: string,
    /** Injected in tests so the provider can be exercised without network access. */
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: EmailMessage): Promise<EmailResult> {
    const addresses = message.to.map((r) => r.email)
    /*
     * Bcc protects a distribution list. With one recipient there is no list to protect,
     * and hiding them costs real delivery: an invitation addressed to safeops@ourselves
     * with the actual person bcc'd is a textbook bulk-mail signature, so the first thing a
     * new customer's administrator ever receives is the message most likely to be filtered
     * - and if it does arrive, it is not addressed to them, which reads as phishing.
     */
    const direct = addresses.length === 1

    let res: Response
    try {
      res = await this.fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...(message.idempotencyKey
            ? { 'Idempotency-Key': message.idempotencyKey }
            : {}),
        },
        body: JSON.stringify({
          from: this.from,
          ...(this.replyTo ? { reply_to: this.replyTo } : {}),
          /*
           * Several recipients go in bcc, with the sender as the visible to.
           *
           * A safety report names people and their overdue actions. Putting twelve managers
           * in the to line publishes the distribution list to all of them and invites
           * reply-all; worse, it tells every reader exactly who else was told.
           */
          to: direct ? addresses : [this.from],
          ...(direct ? {} : { bcc: addresses }),
          subject: message.subject,
          text: message.text,
          html: message.html,
          attachments: message.attachments.map((a) => ({
            filename: a.filename,
            content: a.content.toString('base64'),
            content_type: a.contentType,
          })),
        }),
        signal: AbortSignal.timeout(30_000),
      })
    } catch (e) {
      // A network failure is a provider error, not a crash: the report is already stored
      // and the run must record why delivery did not happen.
      throw new EmailProviderError(
        e instanceof Error ? e.message : 'Could not reach the mail provider.',
        'network_error',
      )
    }

    if (!res.ok) {
      /*
       * Only the provider's own message is kept, and only if it is short.
       *
       * A raw body can echo back the payload - including the recipient list and, with some
       * providers, part of the authorization header. The run history is read by operators
       * and exported, so it gets a sentence, not a dump.
       */
      let detail = `HTTP ${res.status}`
      try {
        const body = await res.json() as { message?: string; name?: string }
        if (typeof body?.message === 'string') detail = body.message.slice(0, 300)
        else if (typeof body?.name === 'string') detail = body.name.slice(0, 120)
      } catch { /* a non-JSON error page tells us nothing useful */ }

      throw new EmailProviderError(
        detail,
        // 429 is transient and worth retrying; 401/422 never are.
        res.status === 429 ? 'rate_limited'
          : res.status === 401 || res.status === 403 ? 'auth_failed'
            : res.status === 422 ? 'rejected'
              : res.status >= 500 ? 'provider_unavailable' : 'provider_error',
        res.status,
      )
    }

    const body = await res.json() as { id?: string }
    if (!body?.id) {
      // No id means we cannot later prove the message existed. Treated as a failure rather
      // than reporting a send we cannot evidence.
      throw new EmailProviderError('The provider accepted the request but returned no message id.', 'no_message_id')
    }

    return { messageId: body.id, accepted: addresses, rejected: [] }
  }

  async verify(): Promise<{ ok: boolean; error?: string }> {
    try {
      // Resend has no dedicated ping, so the cheapest authenticated read stands in.
      const res = await this.fetchImpl('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(15_000),
      })
      if (res.ok) return { ok: true }
      return {
        ok: false,
        error: res.status === 401 || res.status === 403
          ? 'The RESEND_API_KEY was rejected.'
          : `The provider answered HTTP ${res.status}.`,
      }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Could not reach the provider.' }
    }
  }
}
