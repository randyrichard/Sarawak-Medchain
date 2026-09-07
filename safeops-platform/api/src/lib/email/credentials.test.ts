import { describe, it, expect } from 'vitest'
import { resendPlaceholderProblem, smtpPlaceholderProblem } from './credentials.js'

/**
 * Telling a credential nobody replaced from one that simply is not working.
 *
 * The deployment that prompted this ran for weeks with
 * `SMTP_URL=smtps://user:APP_PASSWORD@smtp.gmail.com:465`. Every existing check passed, so
 * the product believed it could send mail, and every invitation and password reset failed
 * at the relay one at a time - each one at the moment somebody needed it.
 *
 * The tests that matter most here are the ones in the second half. A guard that refuses a
 * working deployment because it disapproves of the password is worse than the bug it
 * replaces, so what is asserted is that real configurations are left alone.
 */
describe('smtpPlaceholderProblem', () => {
  it('catches the exact value that was sitting in production', () => {
    const problem = smtpPlaceholderProblem('smtps://randy@gmail.com:APP_PASSWORD@smtp.gmail.com:465')
    expect(problem).toMatch(/placeholder/i)
    // Names the fix, because "mail is misconfigured" sends somebody to read all of it.
    expect(problem).toMatch(/app password/i)
  })

  it('catches the placeholder that ships in .env.prod.example', () => {
    // smtps://user:password@smtp.yourcompany.com:465 - all three parts are markers, and a
    // half-edited copy of that line is the likeliest way this goes wrong twice.
    expect(smtpPlaceholderProblem('smtps://user:password@smtp.yourcompany.com:465')).toBeTruthy()
    expect(smtpPlaceholderProblem('smtps://user:realpw@smtp.relay.test:465')).toMatch(/username/i)
    expect(smtpPlaceholderProblem('smtps://ops:realpw@smtp.yourcompany.com:465')).toMatch(/documentation hostname/i)
  })

  it('catches the other shapes a template value takes', () => {
    for (const pw of ['CHANGEME', 'change_me', 'your_password', 'TODO', '<password>', '{{smtp_password}}', 'xxxxxxxx', '****', 'PLACEHOLDER']) {
      const url = `smtps://ops@relay.test:${encodeURIComponent(pw)}@smtp.relay.test:465`
      expect(smtpPlaceholderProblem(url), pw).toBeTruthy()
    }
  })

  it('catches a documentation hostname', () => {
    expect(smtpPlaceholderProblem('smtps://ops:s3cret@smtp.example.com:465')).toBeTruthy()
    expect(smtpPlaceholderProblem('smtps://ops:s3cret@mail.example.org:465')).toBeTruthy()
  })

  it('catches a URL that parses but names no host', () => {
    /*
     * "usable", not "valid": `smtp.gmail.com:465` is a perfectly valid URL. It is read as
     * the scheme "smtp.gmail.com:" with the path "465", so it throws nothing, has no host,
     * no user and no password, and every other check here finds nothing wrong with it.
     * Dropping the scheme is an easy thing to do while editing an environment file.
     */
    const problem = smtpPlaceholderProblem('smtp.gmail.com:465')
    expect(problem).toMatch(/usable URL/i)
    // And shows the shape, rather than only saying the shape is wrong.
    expect(problem).toContain('smtps://')
    expect(smtpPlaceholderProblem('not a url at all')).toMatch(/usable URL/i)
  })

  // ── The half that protects working deployments ─────────────────────────────

  it('leaves a real Gmail app password alone', () => {
    // Sixteen lowercase letters, which is what Google issues.
    expect(smtpPlaceholderProblem('smtps://randy@gmail.com:abcdefghijklmnop@smtp.gmail.com:465'))
      .toBeNull()
  })

  it('leaves an ordinary relay credential alone', () => {
    for (const url of [
      'smtps://safeops:Tr0ub4dor-and-3@smtp.sendgrid.net:465',
      'smtp://apikey:SG.abc123.def456@smtp.sendgrid.net:587',
      'smtps://AKIAIOSFODNN7:wJalrXUtnFEMI%2FK7MDENG@email-smtp.ap-southeast-1.amazonaws.com:465',
    ]) {
      expect(smtpPlaceholderProblem(url), url).toBeNull()
    }
  })

  it('leaves a relay with no credential at all alone', () => {
    /*
     * Plenty of relays authenticate by IP allow-list or client certificate, and an internal
     * Exchange server commonly needs no credential from inside the network. Refusing those
     * would break working deployments to catch a typo, which is the wrong trade.
     */
    expect(smtpPlaceholderProblem('smtp://mail.internal.acme:25')).toBeNull()
    expect(smtpPlaceholderProblem('smtps://relay.acme.local:465')).toBeNull()
  })

  it('does not judge how good a password is, only whether it was ever set', () => {
    // 'hunter2' is a terrible password and a real one. Locking somebody out of their own
    // mail over an opinion about entropy is not this function's job.
    expect(smtpPlaceholderProblem('smtps://ops:hunter2@smtp.relay.test:465')).toBeNull()
  })

  it('does not mistake a password that merely contains a marker word', () => {
    // Substring matching here would refuse a perfectly good credential.
    expect(smtpPlaceholderProblem('smtps://ops:my-app_password-2026@smtp.relay.test:465'))
      .toBeNull()
    expect(smtpPlaceholderProblem('smtps://ops:xxenophobia@smtp.relay.test:465')).toBeNull()
  })

  it('never repeats the value it is complaining about', () => {
    /*
     * If the guess is wrong and that really is somebody's password, this must not be the
     * thing that writes it into a container log.
     */
    const secret = 'APP_PASSWORD'
    const problem = smtpPlaceholderProblem(`smtps://ops:${secret}@smtp.relay.test:465`)
    expect(problem).toBeTruthy()
    expect(problem).not.toContain(secret)
  })
})

describe('resendPlaceholderProblem', () => {
  it('accepts a key of the shape Resend issues', () => {
    expect(resendPlaceholderProblem('re_abc123_DEF456ghi')).toBeNull()
  })

  it('catches an empty or template value', () => {
    for (const v of ['', '   ', 'CHANGEME', '<your key>', 'your_password']) {
      expect(resendPlaceholderProblem(v), JSON.stringify(v)).toBeTruthy()
    }
  })

  it('catches a value that is not a Resend key at all', () => {
    // The likeliest version of this: somebody pastes an API key from a different vendor.
    expect(resendPlaceholderProblem('SG.abc123.def456')).toMatch(/re_/)
  })
})
