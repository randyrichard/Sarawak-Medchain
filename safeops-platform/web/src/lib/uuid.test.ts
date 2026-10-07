import { afterEach, describe, expect, it, vi } from 'vitest'
import { uuid } from './uuid'

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('uuid', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses crypto.randomUUID when the browser has it', () => {
    expect(uuid()).toMatch(V4)
  })

  it('still works without crypto.randomUUID (Safari before 15.4, plain http)', () => {
    const real = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: <T extends ArrayBufferView>(a: T) => real.getRandomValues(a) })
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) seen.add(uuid())
    expect(seen.size).toBe(200)
    for (const id of seen) expect(id).toMatch(V4)
  })

  it('falls back when randomUUID exists but refuses to run', () => {
    const real = globalThis.crypto
    vi.stubGlobal('crypto', {
      randomUUID: () => { throw new Error('insecure context') },
      getRandomValues: <T extends ArrayBufferView>(a: T) => real.getRandomValues(a),
    })
    expect(uuid()).toMatch(V4)
  })
})
