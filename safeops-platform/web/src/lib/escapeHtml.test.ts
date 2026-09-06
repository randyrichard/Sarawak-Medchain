import { describe, expect, it } from 'vitest'
import { escapeHtml } from './escapeHtml'

/**
 * The print views build raw HTML strings and hand them to `document.write`, which puts them
 * outside the escaping React does for everything rendered through JSX. This is the only
 * thing standing between a text field somebody typed and script running in that window.
 *
 * The case that prompted it: `audit.gps` in the audit report, free text captured from a
 * device, interpolated unescaped next to fields that were escaped.
 */
describe('escapeHtml', () => {
  it('neutralises a script tag', () => {
    expect(escapeHtml('<script>alert(1)</script>'))
      .toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('escapes an img onerror payload', () => {
    // The shape an injected GPS string would actually take.
    expect(escapeHtml('" onerror="alert(1)'))
      .toBe('&quot; onerror=&quot;alert(1)')
  })

  it('escapes all five characters, not just the two the old helper did', () => {
    // The previous local copies handled & and < only. A value breaking out of an attribute
    // needs the quotes, and every print view interpolates into attributes somewhere.
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
  })

  it('escapes the ampersand first, so an entity is not double-decoded', () => {
    // Replacing < before & would turn "<" into "&lt;" and then the & into "&amp;lt;".
    // Getting this order wrong produces visible mojibake rather than a security hole, but
    // it is the classic way a hand-rolled escaper goes wrong.
    expect(escapeHtml('a & b < c')).toBe('a &amp; b &lt; c')
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
  })

  it('leaves ordinary text alone', () => {
    expect(escapeHtml('1.5533° N, 110.3592° E')).toBe('1.5533° N, 110.3592° E')
    expect(escapeHtml('Bay 4, press shop')).toBe('Bay 4, press shop')
  })

  it('renders null and undefined as nothing rather than as words', () => {
    // A helper typed to `string` would have callers skipping it for optional fields, and
    // printing the literal text "undefined" onto a certificate is its own kind of wrong.
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
  })

  it('accepts non-strings, so a caller never has to decide it is safe to skip', () => {
    expect(escapeHtml(42)).toBe('42')
    expect(escapeHtml(0)).toBe('0')
    expect(escapeHtml(false)).toBe('false')
  })

  it('escapes every occurrence, not only the first', () => {
    expect(escapeHtml('<<<')).toBe('&lt;&lt;&lt;')
  })
})
