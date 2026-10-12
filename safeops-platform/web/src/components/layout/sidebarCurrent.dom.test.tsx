// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/*
 * One menu row is the current page, and only that one says so.
 *
 * "Incidents" matches "/incidents/board" by prefix. The highlight already went only to
 * "Incident Board", but both rows still carried aria-current="page", so a screen reader
 * announced two current pages.
 */
vi.mock('@/features/org/OrgContext', () => ({
  useOrg: () => ({ allowed: () => true, company: { id: 'big', name: 'Borneo Industrial Group', plan: 'Enterprise' } }),
}))
vi.mock('@/features/platform/usePlatformAdmin', () => ({ usePlatformAdmin: () => false }))
vi.mock('./Switchers', () => ({ CompanySwitcher: () => null }))

const { SidebarContent } = await import('./AppShell')

afterEach(cleanup)

const current = (path: string) => {
  render(<MemoryRouter initialEntries={[path]}><SidebarContent /></MemoryRouter>)
  return screen.getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.textContent)
}

describe('the menu row for the current page', () => {
  it('is only the Incident Board on the board', () => {
    expect(current('/incidents/board')).toEqual(['Incident Board'])
  })

  it('is Incidents on the list and on one incident', () => {
    expect(current('/incidents')).toEqual(['Incidents'])
    cleanup()
    expect(current('/incidents/INC-2601')).toEqual(['Incidents'])
  })
})
