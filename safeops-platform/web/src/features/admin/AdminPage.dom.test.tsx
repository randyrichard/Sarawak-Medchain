// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * Switching company in the admin console shows, and saves, the company now selected.
 *
 * Most sections loaded their data once when they opened. After switching company the Security
 * policy form kept the previous company's values on screen, and Save wrote them into the new
 * company. The console now rebuilds its section for each company.
 */
let company = { id: 'big', name: 'Borneo Industrial' }
const policies: Record<string, number> = { big: 14, kcs: 20 }
const adminGetSecurity = vi.fn(async (id: string) => ({
  passwordMinLength: policies[id], requireUppercase: true, requireNumber: true, requireSymbol: false,
  passwordExpiryDays: 0, lockoutThreshold: 5, sessionTimeoutHours: 12, mfaRequired: false,
}))
const adminUpdateSecurity = vi.fn(async () => ({}))
vi.mock('@/api/client', () => ({ api: { adminGetSecurity: (id: string) => adminGetSecurity(id), adminUpdateSecurity: (...a: unknown[]) => adminUpdateSecurity(...(a as [])) } }))
vi.mock('@/features/org/OrgContext', () => ({ useOrg: () => ({ company, role: 'admin' }) }))
vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ user: { name: 'Admin', email: 'a@example.test' } }) }))

const { AdminPage } = await import('./AdminPage')

const ui = () => (
  <MemoryRouter initialEntries={['/admin?s=security&tab=policy']}>
    <AdminPage />
  </MemoryRouter>
)

afterEach(() => { cleanup(); company = { id: 'big', name: 'Borneo Industrial' }; vi.clearAllMocks() })

describe('AdminPage company switch', () => {
  it('loads and saves the security policy of the company now selected', async () => {
    const { rerender } = render(ui())
    expect((await screen.findByLabelText('Minimum length') as HTMLInputElement).value).toBe('14')

    company = { id: 'kcs', name: 'Kenyalang Construction' }
    rerender(ui())
    await waitFor(() => expect((screen.getByLabelText('Minimum length') as HTMLInputElement).value).toBe('20'))

    fireEvent.click(screen.getByRole('button', { name: 'Save Policy' }))
    await waitFor(() => expect(adminUpdateSecurity).toHaveBeenCalled())
    const [savedFor, saved] = adminUpdateSecurity.mock.calls[0] as unknown as [string, { passwordMinLength: number }]
    expect(savedFor).toBe('kcs')
    expect(saved.passwordMinLength).toBe(20) // not big's 14
  })
})
