// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * The language setting offers only what the screens are in.
 *
 * It offered Bahasa Malaysia and Chinese and saved the choice, but nothing read it - every
 * screen stayed in English whatever was picked. Even a workspace that saved one of those
 * before is shown the language it actually gets.
 */
vi.mock('@/api/client', () => ({
  api: {
    adminGetOrgSettings: async () => ({
      companyId: 'big', displayName: 'Borneo Industrial Group', legalName: 'Borneo Industrial Group Sdn Bhd',
      industry: 'Diversified Industrial', timezone: 'Asia/Kuching', language: 'Bahasa Malaysia',
      brandAccent: '#2a78d6', logoInitials: 'BI',
    }),
  },
}))
vi.mock('@/features/org/OrgContext', () => ({ useOrg: () => ({ company: { id: 'big' }, sites: [], role: 'admin' }) }))
vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ user: { name: 'Admin' } }) }))

const { OrganizationSection } = await import('./OrganizationSection')

afterEach(cleanup)

describe('the organisation language setting', () => {
  it('offers English only, and says so', async () => {
    render(<MemoryRouter initialEntries={['/admin?s=organization&tab=profile']}><OrganizationSection /></MemoryRouter>)
    const select = await screen.findByLabelText('Language') as HTMLSelectElement
    expect([...select.options].map((o) => o.text)).toEqual(['English'])
    expect(select.value).toBe('English')
    expect(select.disabled).toBe(true)
    expect(screen.getByText('SafeChain is in English only for now.')).toBeTruthy()
  })
})
