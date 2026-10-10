import { describe, it, expect, afterEach, vi } from 'vitest'
import { setEmailProviderForTests } from './index.js'
import type { EmailMessage, EmailProvider, EmailResult } from './provider.js'
import { EmailProviderError } from './provider.js'
import { sendPasswordResetEmail, passwordResetUrl } from './passwordResetDelivery.js'
import { buildPasswordResetEmail, passwordResetSubject } from './passwordResetEmail.js'

/**
 * The password-reset email, and the rules about what may leave the building with it.
 *
 * A fake provider throughout - nothing here contacts a real vendor, and the suite would
 * fail closed rather than send if one were configured, because the seam is set explicitly
 * in `beforeEach`.
 */

const TOKEN = 'reset-token-abc123-DO-NOT-LOG'

class FakeProvider implements EmailProvider {
  readonly name = 'fake'
  readonly idempotent = true
  sent: EmailMessage[] = []
  constructor(
    private behaviour: 'ok' | 'throw' | 'rejected' = 'ok',
  ) {}

  async send(message: EmailMessage): Promise<EmailResult> {
    this.sent.push(message)
    if (this.behaviour === 'throw') {
      throw new EmailProviderError('mailbox unavailable', 'provider_error', 550)
    }
    if (this.behaviour === 'rejected') {
      return { messageId: 'm1', accepted: [], rejected: message.to.map((t) => t.email) }
    }
    return { messageId: 'm1', accepted: message.to.map((t) => t.email), rejected: [] }
  }

  async verify() { return { ok: true } }
}

afterEach(() => {
  setEmailProviderForTests(undefined)
  vi.restoreAllMocks()
})

describe('the reset link itself', () => {
  it('is built from APP_PUBLIC_URL, never from a request', () => {
    // An attacker who can set the Host header would otherwise be sent a valid token
    // pointing at their own server, which is the entire account.
    const url = passwordResetUrl(TOKEN)
    expect(url).toContain('/reset-password?token=')
    expect(url.startsWith('http')).toBe(true)
  })

  it('percent-encodes the token so it survives the query string intact', () => {
    const url = passwordResetUrl('a+b/c=d&e')
    expect(url).toContain(encodeURIComponent('a+b/c=d&e'))
    // A raw & would end the token parameter and start a new one.
    expect(url.split('token=')[1]).not.toContain('&')
  })
})

describe('what the message says', () => {
  const base = {
    recipientEmail: 'aina@example.test',
    resetUrl: 'https://app.test.invalid/reset-password?token=x',
    expiresInMinutes: 30,
  }

  it('names the product in the subject', () => {
    expect(passwordResetSubject(base)).toBe('Reset your SafeChain password')
  })

  it('tells someone who did not ask for it that they can ignore it', () => {
    // The one signal a user gets that somebody is trying their account.
    const msg = buildPasswordResetEmail(base, 'k1')
    expect(msg.text).toMatch(/did not request this/i)
    expect(msg.html).toMatch(/did not request this/i)
  })

  it('states the expiry in both bodies', () => {
    const msg = buildPasswordResetEmail(base, 'k1')
    expect(msg.text).toContain('30 minutes')
    expect(msg.html).toContain('30 minutes')
  })

  it('carries a plain-text alternative, because many clients refuse HTML', () => {
    const msg = buildPasswordResetEmail(base, 'k1')
    expect(msg.text.length).toBeGreaterThan(80)
    expect(msg.text).toContain(base.resetUrl)
  })

  it('never says who requested it', () => {
    /*
     * The request endpoint is unauthenticated, so any "requested by" string would be
     * attacker-controlled text rendered inside a trusted-looking email.
     */
    const msg = buildPasswordResetEmail(base, 'k1')
    expect(msg.text).not.toMatch(/requested by/i)
    expect(msg.html).not.toMatch(/requested by/i)
  })

  it('escapes the address rather than interpolating it raw into HTML', () => {
    const msg = buildPasswordResetEmail(
      { ...base, recipientEmail: 'x<script>alert(1)</script>@example.test' }, 'k1',
    )
    expect(msg.html).not.toContain('<script>')
    expect(msg.html).toContain('&lt;script&gt;')
  })
})

describe('delivery', () => {
  const input = {
    token: TOKEN,
    recipientEmail: 'aina@example.test',
    recipientName: 'Aina',
    expiresInMinutes: 30,
    idempotencyKey: 'k-1',
  }

  it('sends to the right person and reports success', async () => {
    const p = new FakeProvider('ok')
    setEmailProviderForTests(p)

    const r = await sendPasswordResetEmail(input)

    expect(r.delivered).toBe(true)
    expect(r.provider).toBe('fake')
    expect(p.sent).toHaveLength(1)
    expect(p.sent[0].to[0].email).toBe('aina@example.test')
  })

  it('withholds the link once a provider has accepted it', async () => {
    // No reason to also hand a working credential back through the browser.
    setEmailProviderForTests(new FakeProvider('ok'))
    const r = await sendPasswordResetEmail(input)
    expect(r.showLink).toBe(false)
  })

  it('puts the reset URL in the message it sends', async () => {
    const p = new FakeProvider('ok')
    setEmailProviderForTests(p)
    await sendPasswordResetEmail(input)
    expect(p.sent[0].text).toContain(passwordResetUrl(TOKEN))
  })

  it('reports failure honestly when the provider throws, and does not throw itself', async () => {
    /*
     * The token is already committed and still valid. Rethrowing would leave a live link
     * nobody can use and an administrator looking at a 500.
     */
    setEmailProviderForTests(new FakeProvider('throw'))

    const r = await sendPasswordResetEmail(input)

    expect(r.delivered).toBe(false)
    expect(r.showLink).toBe(true)
    expect(r.reason).toMatch(/mailbox unavailable/)
  })

  it('treats an accepted request with a rejected recipient as a failure', async () => {
    // A provider can take the request and still refuse the address.
    setEmailProviderForTests(new FakeProvider('rejected'))
    const r = await sendPasswordResetEmail(input)
    expect(r.delivered).toBe(false)
    expect(r.showLink).toBe(true)
  })

  it('sends nothing and says so when no provider is configured', async () => {
    setEmailProviderForTests(null)

    const r = await sendPasswordResetEmail(input)

    expect(r.delivered).toBe(false)
    expect(r.showLink).toBe(true)
    expect(r.provider).toBeNull()
    expect(r.reason).toMatch(/no email provider is configured/i)
  })
})

describe('what must never be logged', () => {
  const input = {
    token: TOKEN,
    recipientEmail: 'aina@example.test',
    expiresInMinutes: 30,
    idempotencyKey: 'k-1',
  }

  it('keeps the token and the whole URL out of the failure log', async () => {
    /*
     * The URL contains the token, so these are one rule. Application logs are shipped to
     * aggregators, read by support and pasted into tickets; a reset link in one is a
     * takeover waiting for whoever reads it first.
     */
    const errors: string[] = []
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '))
    })

    setEmailProviderForTests(new FakeProvider('throw'))
    await sendPasswordResetEmail(input)

    expect(errors.length).toBeGreaterThan(0)
    const all = errors.join('\n')
    expect(all).not.toContain(TOKEN)
    expect(all).not.toContain('reset-password?token=')
    // The address is deliberately present - diagnosing delivery without it is not
    // diagnosis.
    expect(all).toContain('aina@example.test')
  })

  it('does not put the token in the reason handed back to a caller', async () => {
    setEmailProviderForTests(new FakeProvider('throw'))
    const r = await sendPasswordResetEmail(input)
    expect(r.reason ?? '').not.toContain(TOKEN)
  })
})
