// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

/*
 * On the public demo, the pages that need the server showed "Could not load HSE performance"
 * in red with a Try Again button: read by a prospect as something broken, and a button that
 * could only fail again. It is not a fault there, so it no longer looks like one. With a
 * server configured the same refusal means a wrong address, which is a fault, and stays one.
 */
const backend = { on: false }
vi.mock('@/api/authApi', async (orig) => ({
  ...(await orig<object>()),
  isBackendConfigured: () => backend.on,
}))

const { ErrorState } = await import('./AsyncContent')
const { ErrorAlert } = await import('./ErrorAlert')
const { notApiError } = await import('@/api/http')

afterEach(() => { cleanup(); backend.on = false })

// Made the way the HTTP client makes it, with the server configured or not at that moment.
const refusal = () => notApiError()

describe('a part of the app the demo does not include', () => {
  it('says so calmly, with nothing to retry', () => {
    render(<ErrorState title="Could not load HSE performance" error={refusal()} onRetry={() => {}} />)
    expect(screen.getByRole('status').textContent).toContain('Not in this demo')
    expect(screen.getByText(/needs the SafeChain server/)).toBeTruthy()
    expect(screen.queryByText('Could not load HSE performance')).toBeNull()
    expect(screen.queryByRole('button', { name: /Try Again/ })).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('is still a fault, with a retry, where a server is configured', () => {
    backend.on = true
    render(<ErrorState title="Could not load HSE performance" error={refusal()} onRetry={() => {}} />)
    expect(screen.getByRole('alert').textContent).toContain('Could not load HSE performance')
    expect(screen.getByRole('button', { name: /Try Again/ })).toBeTruthy()
  })

  it('leaves every other failure as it was', () => {
    render(<ErrorState title="Couldn't load this" error={new Error('Server unavailable')} onRetry={() => {}} />)
    expect(screen.getByRole('alert').textContent).toContain('Server unavailable')
    expect(screen.getByRole('button', { name: /Try Again/ })).toBeTruthy()
  })
})

/*
 * The same refusal above a page. Visitors, Employees, Contractors, Reports, the Incident Board
 * and the Equipment Board kept only its message, so each showed it as a red alarm.
 */
describe('a failure shown above a page', () => {
  it('is a calm note, with nothing to dismiss, where the demo does not include the part', () => {
    render(<ErrorAlert error={refusal()} onDismiss={() => {}} />)
    expect(screen.getByRole('status').textContent).toContain('Not in this demo')
    expect(screen.getByText(/needs the SafeChain server/)).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull()
  })

  it('is still an alarm where a server is configured', () => {
    backend.on = true
    render(<ErrorAlert error={refusal()} onDismiss={() => {}} />)
    expect(screen.getByRole('alert').textContent).toContain('not SafeChain data')
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy()
  })

  it('shows a message it is given as it is, and nothing for no error', () => {
    const { container } = render(<ErrorAlert error={null} />)
    expect(container.textContent).toBe('')
    render(<ErrorAlert error="Could not download that report." />)
    expect(screen.getByRole('alert').textContent).toContain('Could not download that report.')
  })
})
