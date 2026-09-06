import { describe, expect, it } from 'vitest'
import { DEFAULT_TITLE, resolveTitle, titleOf } from './pageTitle'

// A cut-down stand-in for AppShell's NAV: the shape and the two entries whose
// prefixes overlap, which is where the matching rule actually earns its keep.
const SECTIONS = [
  { to: '/', label: 'Dashboard' },
  { to: '/incidents', label: 'Incidents' },
  { to: '/actions', label: 'Corrective Actions' },
  { to: '/admin', label: 'Administration' },
] as const

describe('resolveTitle', () => {
  it('uses the name a page claims for itself', () => {
    expect(resolveTitle('/incidents/INC-2601', SECTIONS, 'INC-2601')).toBe('INC-2601 · SafeOps')
  })

  it('lets a claimed name win over the section it sits in', () => {
    // The shell would otherwise call this "Incidents"; the page knows better.
    expect(resolveTitle('/incidents/new', SECTIONS, 'Report an incident'))
      .toBe('Report an incident · SafeOps')
  })

  it('falls back to the section when no page has claimed a name', () => {
    expect(resolveTitle('/incidents', SECTIONS, null)).toBe('Incidents · SafeOps')
  })

  it('titles a deep route after its section rather than the product', () => {
    expect(resolveTitle('/incidents/INC-2601', SECTIONS, null)).toBe('Incidents · SafeOps')
  })

  it('prefers the longest matching section, not the first', () => {
    // Every path starts with '/', so an unsorted match would title the whole product
    // "Dashboard". This is the case that guards against that.
    expect(resolveTitle('/actions', SECTIONS, null)).toBe('Corrective Actions · SafeOps')
  })

  it('gives the dashboard the product name, not "Dashboard"', () => {
    expect(resolveTitle('/', SECTIONS, null)).toBe(DEFAULT_TITLE)
  })

  it('gives an unknown path the product name', () => {
    expect(resolveTitle('/nothing-here', SECTIONS, null)).toBe(DEFAULT_TITLE)
  })

  it('does not treat a section as a prefix of an unrelated path', () => {
    // '/admin' must not match '/administration-of-nothing'; the rule is a path
    // segment boundary, not a string prefix.
    expect(resolveTitle('/administration-of-nothing', SECTIONS, null)).toBe(DEFAULT_TITLE)
  })

  it('formats a claimed name consistently with titleOf', () => {
    expect(resolveTitle('/anything', SECTIONS, 'Sign in')).toBe(titleOf('Sign in'))
  })
})
