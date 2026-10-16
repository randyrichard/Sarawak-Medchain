// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/*
 * The public demo keeps no visitors. The page opened on "needs the SafeChain server" in a red
 * alarm, twice on the live board, with a Register Visitor that could only fail. It now says
 * so once, calmly, in place of the page.
 */
vi.mock('@/api/authApi', async (orig) => ({
  ...(await orig<object>()),
  isBackendConfigured: () => false,
}))
vi.mock('@/features/org/OrgContext', async (orig) => ({
  ...(await orig<object>()),
  useOrg: () => ({ company: { id: 'big', name: 'Borneo Industrial Group' }, site: null, sites: [], role: 'admin', allowed: () => true }),
  // The real one reads the context through the module's own useOrg, which the line above does not reach.
  useSiteScope: () => [],
}))
// Every visitor call is refused the way the demo build refuses it.
vi.mock('@/api/visitorsApi', async (orig) => {
  const { notApiError } = await import('@/api/http')
  const refuse = () => Promise.reject(notApiError())
  return { ...(await orig<object>()), visitorsApi: new Proxy({}, { get: () => refuse }) }
})

const { VisitorsPage } = await import('./VisitorsPage')

afterEach(cleanup)

describe('Visitors in the offline demo', () => {
  it('says once, calmly, that the demo does not include them', async () => {
    render(<MemoryRouter initialEntries={['/visitors']}><VisitorsPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getAllByText('Not in this demo')).toHaveLength(1))
    expect(screen.getByRole('heading', { name: 'Visitors' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: /Register Visitor/ })).toBeNull()
    expect(screen.queryByRole('tab')).toBeNull()
  })
})
