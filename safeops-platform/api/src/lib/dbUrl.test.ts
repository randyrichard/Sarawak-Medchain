import { describe, it, expect } from 'vitest'
import { withConnectionLimit } from './dbUrl.js'

describe('withConnectionLimit', () => {
  it('replaces an existing limit and keeps every other parameter', () => {
    const out = new URL(withConnectionLimit(
      'postgresql://u:p%40ss@db:5432/safeops?schema=public&connection_limit=20&pool_timeout=15', 5))
    expect(out.searchParams.get('connection_limit')).toBe('5')
    expect(out.searchParams.get('schema')).toBe('public')
    expect(out.searchParams.get('pool_timeout')).toBe('15')
    expect(out.password).toBe('p%40ss') // an encoded password survives
    expect(out.host).toBe('db:5432')
  })

  it('adds a limit to a managed URL that has none', () => {
    const out = new URL(withConnectionLimit('postgresql://u:p@host.example:25060/safeops?sslmode=require', 5))
    expect(out.searchParams.get('connection_limit')).toBe('5')
    expect(out.searchParams.get('sslmode')).toBe('require')
  })
})
