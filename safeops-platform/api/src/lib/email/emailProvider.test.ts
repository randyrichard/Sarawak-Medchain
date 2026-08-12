import { describe, it, expect } from 'vitest'
import { EmailProviderError, headerSafe } from './provider.js'
import { buildInvitationEmail } from './invitationEmail.js'
import { ResendEmailProvider } from './resendProvider.js'
import { SmtpEmailProvider } from './smtpProvider.js'

/**
 * The Resend adapter.
 *
 * Exercised against a stub fetch, never the real API — an automated test must not put
 * anything in a real inbox, and a suite that needs an API key does not run in CI. What is
 * asserted is the contract the report system depends on: an id comes back on success, a
 * controlled error with a safe message comes back on failure, and nothing that could carry
 * a credential is ever surfaced.
 */
const FROM = 'SafeOps <safeops@example.com>'

const message = {
  to: [{ name: 'Marcus Tan', email: 'marcus@example.com' }],
  subject: 'Overdue actions',
  text: 'plain',
  html: '<p>rich</p>',
  attachments: [{
    filename: 'report.pdf',
    content: Buffer.from('%PDF-1.4 fake'),
    contentType: 'application/pdf',
  }],
}

/** A fetch that records what it was asked and answers however the test wants. */
function stubFetch(response: { status: number; body: unknown }) {
  const calls: { url: string; init: RequestInit }[] = []
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => response.body,
    } as Response
  }) as unknown as typeof fetch
  return { impl, calls }
}

describe('ResendEmailProvider', () => {
  it('returns the provider message id on success', async () => {
    const { impl } = stubFetch({ status: 200, body: { id: 'msg_abc123' } })
    const p = new ResendEmailProvider('re_test', FROM, undefined, impl)

    const result = await p.send(message)
    expect(result.messageId).toBe('msg_abc123')
    expect(result.accepted).toEqual(['marcus@example.com'])
    expect(result.rejected).toEqual([])
  })

  it('attaches the PDF with the right filename and MIME type', async () => {
    const { impl, calls } = stubFetch({ status: 200, body: { id: 'msg_1' } })
    await new ResendEmailProvider('re_test', FROM, undefined, impl).send(message)

    const body = JSON.parse(String(calls[0].init.body))
    expect(body.attachments).toHaveLength(1)
    expect(body.attachments[0].filename).toBe('report.pdf')
    expect(body.attachments[0].content_type).toBe('application/pdf')
    // Base64 of the exact bytes handed in, not a re-render.
    expect(Buffer.from(body.attachments[0].content, 'base64').toString()).toBe('%PDF-1.4 fake')
  })

  it('puts recipients in bcc so the distribution list is not published to them', async () => {
    const { impl, calls } = stubFetch({ status: 200, body: { id: 'msg_1' } })
    await new ResendEmailProvider('re_test', FROM, undefined, impl).send({
      ...message,
      to: [
        { name: 'A', email: 'a@example.com' },
        { name: 'B', email: 'b@example.com' },
      ],
    })

    const body = JSON.parse(String(calls[0].init.body))
    // A safety report names people and their overdue actions; every reader should not be
    // handed the list of who else was told.
    expect(body.bcc).toEqual(['a@example.com', 'b@example.com'])
    expect(body.to).toEqual([FROM])
  })

  it('sends the key as a bearer token and nowhere else', async () => {
    const { impl, calls } = stubFetch({ status: 200, body: { id: 'msg_1' } })
    await new ResendEmailProvider('re_secret_key', FROM, undefined, impl).send(message)

    const headers = calls[0].init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer re_secret_key')
    // Never in the payload, where it could be logged or echoed back in an error.
    expect(String(calls[0].init.body)).not.toContain('re_secret_key')
  })

  it('carries a reply-to only when one is configured', async () => {
    const withReply = stubFetch({ status: 200, body: { id: 'm' } })
    await new ResendEmailProvider('k', FROM, 'hse@example.com', withReply.impl).send(message)
    expect(JSON.parse(String(withReply.calls[0].init.body)).reply_to).toBe('hse@example.com')

    const without = stubFetch({ status: 200, body: { id: 'm' } })
    await new ResendEmailProvider('k', FROM, undefined, without.impl).send(message)
    expect(JSON.parse(String(without.calls[0].init.body))).not.toHaveProperty('reply_to')
  })

  it('raises a controlled error when the key is rejected', async () => {
    const { impl } = stubFetch({ status: 401, body: { message: 'API key is invalid' } })
    const p = new ResendEmailProvider('bad', FROM, undefined, impl)

    await expect(p.send(message)).rejects.toMatchObject({
      name: 'EmailProviderError', code: 'auth_failed', status: 401,
    })
  })

  it('distinguishes a rejected payload from an outage', async () => {
    const rejected = stubFetch({ status: 422, body: { message: 'Invalid recipient' } })
    await expect(new ResendEmailProvider('k', FROM, undefined, rejected.impl).send(message))
      .rejects.toMatchObject({ code: 'rejected' })

    const down = stubFetch({ status: 503, body: { message: 'Service unavailable' } })
    await expect(new ResendEmailProvider('k', FROM, undefined, down.impl).send(message))
      .rejects.toMatchObject({ code: 'provider_unavailable' })
  })

  it('keeps the provider message but never a whole response body', async () => {
    const { impl } = stubFetch({
      status: 422,
      body: { message: 'Invalid recipient', request: { authorization: 'Bearer re_secret' } },
    })
    try {
      await new ResendEmailProvider('re_secret', FROM, undefined, impl).send(message)
      expect.unreachable('should have thrown')
    } catch (e) {
      const err = e as EmailProviderError
      // The run history is read by operators and exported; it gets a sentence, not a dump.
      expect(err.message).toBe('Invalid recipient')
      expect(err.message).not.toContain('re_secret')
      expect(err.message).not.toContain('authorization')
    }
  })

  it('treats an unreachable provider as a provider error, not a crash', async () => {
    const impl = (async () => { throw new Error('getaddrinfo ENOTFOUND api.resend.com') }) as unknown as typeof fetch
    await expect(new ResendEmailProvider('k', FROM, undefined, impl).send(message))
      .rejects.toMatchObject({ code: 'network_error' })
  })

  it('refuses to report a send it cannot evidence', async () => {
    // Accepted but no id: we could never answer "did it actually go?" afterwards.
    const { impl } = stubFetch({ status: 200, body: {} })
    await expect(new ResendEmailProvider('k', FROM, undefined, impl).send(message))
      .rejects.toMatchObject({ code: 'no_message_id' })
  })

  it('verifies credentials without sending anything', async () => {
    const ok = stubFetch({ status: 200, body: { data: [] } })
    expect(await new ResendEmailProvider('k', FROM, undefined, ok.impl).verify())
      .toEqual({ ok: true })
    expect(ok.calls[0].url).toContain('/domains')

    const bad = stubFetch({ status: 401, body: {} })
    const res = await new ResendEmailProvider('k', FROM, undefined, bad.impl).verify()
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/RESEND_API_KEY was rejected/)
  })
})

describe('SmtpEmailProvider', () => {
  /** A transport that answers the way a relay does, without opening a socket. */
  const fakeTransport = (accepted: string[], rejected: string[] = []) => () => ({
    sendMail: async () => ({ messageId: '<abc@relay>', accepted, rejected }),
    verify: async () => true,
  }) as never

  it('does not count our own sender address as a recipient', async () => {
    /*
     * The visible To is the from-address, because the real recipients are bcc'd - and a
     * relay reports every envelope address as accepted. Counting it made the history read
     * "Emailed to 3 recipient(s)" when two people received the report.
     */
    const p = new SmtpEmailProvider(
      'smtp://localhost:2525', FROM, undefined,
      fakeTransport(['safeops@example.com', 'a@example.com', 'b@example.com']),
    )
    const result = await p.send({
      ...message,
      to: [{ name: 'A', email: 'a@example.com' }, { name: 'B', email: 'b@example.com' }],
    })
    expect(result.accepted).toEqual(['a@example.com', 'b@example.com'])
  })

  it('matches the sender regardless of case', async () => {
    const p = new SmtpEmailProvider(
      'smtp://localhost:2525', FROM, undefined,
      fakeTransport(['SafeOps@Example.com', 'a@example.com']),
    )
    expect((await p.send(message)).accepted).toEqual(['a@example.com'])
  })

  it('returns the relay message id', async () => {
    const p = new SmtpEmailProvider(
      'smtp://localhost:2525', FROM, undefined, fakeTransport(['a@example.com']),
    )
    expect((await p.send(message)).messageId).toBe('<abc@relay>')
  })

  it('turns a relay refusal into a controlled provider error', async () => {
    const failing = () => ({
      sendMail: async () => { const e = new Error('535 auth failed'); (e as never as { code: string }).code = 'EAUTH'; throw e },
      verify: async () => true,
    }) as never
    const p = new SmtpEmailProvider('smtp://localhost:2525', FROM, undefined, failing)
    await expect(p.send(message)).rejects.toMatchObject({
      name: 'EmailProviderError', code: 'auth_failed',
    })
  })
})

describe('header safety', () => {
  /*
   * A subject is a header, and a header ends at a newline. The company name is
   * tenant-controlled and reaches the subject, so a name carrying CRLF could end the
   * Subject line and start whatever follows it.
   *
   * nodemailer was tested against a real relay and collapses this before the wire, so the
   * SMTP path was never exploitable. These assertions exist so the guarantee does not
   * depend on which provider is configured - the Resend path hands the subject to an API
   * this environment cannot test.
   */
  it('flattens CRLF out of a value bound for a header', () => {
    expect(headerSafe('Acme\r\nBcc: attacker@evil.test')).toBe('Acme Bcc: attacker@evil.test')
    expect(headerSafe('a\nb\tc')).toBe('a b c')
    expect(headerSafe('  padded  ')).toBe('padded')
  })

  it('bounds the length so a subject cannot become an essay', () => {
    expect(headerSafe('x'.repeat(500))).toHaveLength(200)
  })

  it('leaves ordinary names untouched', () => {
    expect(headerSafe('Borneo Industrial Group')).toBe('Borneo Industrial Group')
    // Non-ASCII is normal in this market and must survive.
    expect(headerSafe('Syarikat Bhd — Kuching')).toBe('Syarikat Bhd — Kuching')
  })

  const hostile = {
    companyName: 'Acme\r\nBcc: attacker@evil.test',
    recipientEmail: 'victim@example.com',
    inviterName: '<img src=x onerror=alert(1)>Bob',
    roleLabel: 'HSE Manager',
    siteNames: ['Yard <script>alert(2)</script>'],
    departmentName: 'Maint\r\nX-Injected: yes',
    acceptUrl: 'https://app.test/accept-invitation/TOKEN123',
    expiresAt: new Date('2026-08-19T00:00:00Z'),
  }

  it('keeps a hostile company name out of the subject line', () => {
    const m = buildInvitationEmail(hostile, 'k')
    expect(m.subject).not.toMatch(/[\r\n]/)
  })

  it('escapes markup rather than rendering it', () => {
    const m = buildInvitationEmail(hostile, 'k')
    expect(m.html).not.toContain('<img src=x')
    expect(m.html).not.toContain('<script>')
    expect(m.html).toContain('&lt;img')
    expect(m.html).toContain('&lt;script&gt;')
  })

  it('addresses exactly the one invitee, whatever the other fields contain', () => {
    // Recipient injection: nothing in the content may add an address.
    const m = buildInvitationEmail(hostile, 'k')
    expect(m.to).toHaveLength(1)
    expect(m.to[0].email).toBe('victim@example.com')
  })
})
