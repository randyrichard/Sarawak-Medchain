// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

/**
 * The forced password change says why it is being asked for.
 *
 * Two different things put somebody here: a password somebody else set (an administrator
 * created the account or forced a reset), and a password older than the company's policy
 * allows. Telling the second person "somebody else set this password" is false, and
 * alarming.
 */
let user: Record<string, unknown> = {}
vi.mock('../AuthContext', () => ({ useAuth: () => ({ user, logout: vi.fn() }) }))
vi.mock('@/api/accountApi', () => ({ accountApi: { changePassword: vi.fn() } }))
vi.mock('./AuthLayout', () => ({ AuthLayout: ({ children }: { children: unknown }) => children }))

const { ChangePasswordRequiredPage } = await import('./ChangePasswordRequiredPage')

afterEach(cleanup)

describe('ChangePasswordRequiredPage', () => {
  it('says the password has expired when the policy is the reason', () => {
    user = { email: 'a@example.test', mustChangePassword: true, passwordExpired: true }
    render(<ChangePasswordRequiredPage />)
    expect(screen.getByRole('heading', { name: 'Your password has expired' })).toBeTruthy()
    expect(screen.queryByText(/somebody else set/)).toBeNull()
  })

  it('says somebody else set it when an administrator is the reason', () => {
    user = { email: 'a@example.test', mustChangePassword: true }
    render(<ChangePasswordRequiredPage />)
    expect(screen.getByRole('heading', { name: 'Choose your own password' })).toBeTruthy()
  })
})
