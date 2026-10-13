// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/*
 * A page somebody's role cannot open said they lacked 'the "visitors:view" permission' - the
 * code's name for it. It now says what the page needs in words.
 */
vi.mock('@/features/org/OrgContext', () => ({ useOrg: () => ({ role: 'ceo' }) }))

const { ForbiddenPage } = await import('./ForbiddenPage')
const { CAPABILITY_LABEL } = await import('@/features/permissions/permissions')

afterEach(cleanup)

describe('the page a role cannot open', () => {
  it('names what it needs in words, never the key', () => {
    render(<MemoryRouter><ForbiddenPage capability="visitors:view" /></MemoryRouter>)
    const text = document.body.textContent ?? ''
    expect(text).toContain(`It needs “${CAPABILITY_LABEL['visitors:view']}”, which your role (CEO) does not include.`)
    expect(text).not.toContain('visitors:view')
    expect(screen.getByRole('link', { name: 'Back to Home' })).toBeTruthy()
  })

  it('has a name for every capability', () => {
    for (const [key, label] of Object.entries(CAPABILITY_LABEL)) {
      expect(label, key).toMatch(/^[A-Z][a-z]/)
      expect(label, key).not.toContain(':')
    }
  })
})
