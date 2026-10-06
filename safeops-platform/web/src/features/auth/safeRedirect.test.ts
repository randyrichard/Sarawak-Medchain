import { describe, it, expect } from 'vitest'
import { safeInternalPath } from './safeRedirect'

describe('safeInternalPath — open-redirect guard', () => {
  it('allows genuine internal paths (with query and hash)', () => {
    expect(safeInternalPath('/')).toBe('/')
    expect(safeInternalPath('/incidents')).toBe('/incidents')
    expect(safeInternalPath('/incidents/inc-2607')).toBe('/incidents/inc-2607')
    expect(safeInternalPath('/actions?open=CA-12')).toBe('/actions?open=CA-12')
    expect(safeInternalPath('/training?verify=CERT-2026-0001')).toBe('/training?verify=CERT-2026-0001')
  })

  it('falls back to home for empty or non-string input', () => {
    expect(safeInternalPath(null)).toBe('/')
    expect(safeInternalPath(undefined)).toBe('/')
    expect(safeInternalPath('')).toBe('/')
  })

  it('rejects protocol-relative and backslash-tricked targets', () => {
    expect(safeInternalPath('//evil.com')).toBe('/')
    expect(safeInternalPath('/\\evil.com')).toBe('/')
    expect(safeInternalPath('/\\/evil.com')).toBe('/')
    // A backslash anywhere, and encoded slashes where the host would start.
    expect(safeInternalPath('/incidents/..\\..\\evil.com')).toBe('/')
    expect(safeInternalPath('/%2F%2Fevil.com')).toBe('/')
    expect(safeInternalPath('/%5Cevil.com')).toBe('/')
    expect(safeInternalPath('/incidents?q=a%2Fb')).toBe('/incidents?q=a%2Fb') // encoded slash later is fine
  })

  it('rejects absolute URLs and scheme-based targets', () => {
    expect(safeInternalPath('https://evil.com')).toBe('/')
    expect(safeInternalPath('http://evil.com')).toBe('/')
    expect(safeInternalPath('javascript:alert(1)')).toBe('/')
    expect(safeInternalPath('mailto:x@y.com')).toBe('/')
  })

  it('rejects control-character smuggling and honours a custom fallback', () => {
    expect(safeInternalPath('/foo\nhttp://evil.com')).toBe('/')
    expect(safeInternalPath('evil.com', '/login')).toBe('/login')
  })
})
