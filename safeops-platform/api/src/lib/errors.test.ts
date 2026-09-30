import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Every service error that carries an HTTP status must extend DomainError.
 *
 * The central handler answers DomainError and nothing else it does not recognise; a module
 * that declared `class XError extends Error { status ... }` again would compile, pass its
 * own tests, and have every refusal it raises reach the caller as a 500.
 */
describe('service errors', () => {
  it('all extend DomainError', () => {
    const dir = join(__dirname)
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'errors.ts')
      .filter((f) => /class \w+Error extends Error \{[^}]*public status/s.test(readFileSync(join(dir, f), 'utf8')))
    expect(offenders).toEqual([])
  })
})
