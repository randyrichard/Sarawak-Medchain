/**
 * A random v4 UUID.
 *
 * `crypto.randomUUID` is missing before Safari 15.4 and on any page not served over HTTPS
 * (a phone opening the app by its LAN address during a site trial), where calling it threw
 * and the report form never rendered. `crypto.getRandomValues` exists in both cases.
 */
export function uuid(): string {
  const c = globalThis.crypto
  if (typeof c?.randomUUID === 'function') {
    try {
      return c.randomUUID()
    } catch {
      // An insecure context may expose the function and still refuse to run it.
    }
  }
  const b = c.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40 // version 4
  b[8] = (b[8] & 0x3f) | 0x80 // RFC 4122 variant
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
