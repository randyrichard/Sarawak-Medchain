// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import axe from 'axe-core'
import type { Role } from '@/api/types'
import { can } from '@/features/permissions/permissions'

let role: Role = 'employee'
vi.mock('@/features/org/OrgContext', () => ({
  useOrg: () => ({ role, allowed: (c: Parameters<typeof can>[1]) => can(role, c) }),
}))

const { HelpPage } = await import('./HelpPage')
const { Welcome, useWelcome } = await import('../dashboard/components/Welcome')

afterEach(() => { cleanup(); localStorage.clear() })

describe('the Help page', () => {
  it('puts the emergency first, then the reader’s own role', () => {
    role = 'employee'
    render(<MemoryRouter><HelpPage /></MemoryRouter>)
    const headings = screen.getAllByRole('heading').map((h) => h.textContent)
    expect(headings[0]).toBe('Help')
    expect(screen.getByText(/In an emergency, act first and report afterwards/)).toBeTruthy()
    expect(headings).toContain('Your role: Employee')
  })

  it('shows an employee only what an employee can do', () => {
    role = 'employee'
    render(<MemoryRouter><HelpPage /></MemoryRouter>)
    expect(screen.getByText('Report a near miss', { selector: 'summary' })).toBeTruthy()
    expect(screen.queryByText('Approve a permit', { selector: 'summary' })).toBeNull()
    expect(screen.queryByText('Investigate an incident', { selector: 'summary' })).toBeNull()
  })

  it('shows a safety officer the investigation guide', () => {
    role = 'safety_officer'
    render(<MemoryRouter><HelpPage /></MemoryRouter>)
    expect(screen.getByText('Investigate an incident', { selector: 'summary' })).toBeTruthy()
  })

  it('names the buttons in bold, the way they read on screen', () => {
    role = 'employee'
    const { container } = render(<MemoryRouter><HelpPage /></MemoryRouter>)
    const bold = [...container.querySelectorAll('details strong')].map((b) => b.textContent)
    expect(bold).toContain('Submit near miss')
  })

  it('explains the words', () => {
    role = 'employee'
    render(<MemoryRouter><HelpPage /></MemoryRouter>)
    expect(screen.getByText('Near miss', { selector: 'dt' })).toBeTruthy()
    expect(screen.getByText('TRIR', { selector: 'dt' })).toBeTruthy()
  })

  it('has no accessibility violations axe can find', async () => {
    role = 'hse_manager'
    const { container } = render(<MemoryRouter><HelpPage /></MemoryRouter>)
    // Colour contrast needs real layout, which jsdom does not do; the browser crawl checks it.
    const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })
})

describe('the welcome on Home', () => {
  function Harness({ who }: { who: Role }) {
    const w = useWelcome()
    return w.hidden ? <p>hidden</p> : <Welcome role={who} onDismiss={w.dismiss} />
  }

  it('names the first three jobs of the role and links the guide', () => {
    render(<MemoryRouter><Harness who="supervisor" /></MemoryRouter>)
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(links).toEqual(['/permits?status=awaiting', '/toolbox', '/visitors', '/help'])
  })

  it('stays dismissed', () => {
    const first = render(<MemoryRouter><Harness who="employee" /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Hide this introduction' }))
    expect(screen.getByText('hidden')).toBeTruthy()
    first.unmount()
    render(<MemoryRouter><Harness who="employee" /></MemoryRouter>)
    expect(screen.getByText('hidden')).toBeTruthy()
  })
})
