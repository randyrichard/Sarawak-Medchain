// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ApiError } from '@/api/types'

/**
 * Why an incident could not be shown, told truthfully.
 *
 * Every failure used to read "This incident is no longer available. It may have been
 * archived". That was false when the reader simply may not see it (a 403), and false when
 * the request failed: a worker on patchy site wifi was told their report had gone.
 */
const getIncident = vi.fn()
vi.mock('@/api/client', () => ({ api: { getIncident: (...a: unknown[]) => getIncident(...a) } }))
vi.mock('@/features/org/OrgContext', () => ({ useOrg: () => ({ sites: [], role: 'employee' }) }))
vi.mock('./lib', async (orig) => ({ ...(await orig<object>()), useActor: () => ({ name: 'Test' }) }))
vi.mock('@/app/pageTitle', () => ({ usePageTitle: () => {} }))

const { IncidentDetailPage } = await import('./IncidentDetailPage')

const open = () => render(
  <MemoryRouter initialEntries={['/incidents/inc-1']}>
    <Routes><Route path="/incidents/:id" element={<IncidentDetailPage />} /></Routes>
  </MemoryRouter>,
)

afterEach(() => { cleanup(); getIncident.mockReset() })

describe('IncidentDetailPage when the incident cannot be shown', () => {
  it('says it is gone only when it is gone', async () => {
    getIncident.mockRejectedValue(new ApiError('not_found', 'Incident not found.'))
    open()
    expect(await screen.findByText('This incident is no longer available.')).toBeTruthy()
  })

  it('says the reader has no access, not that it was archived', async () => {
    getIncident.mockRejectedValue(new ApiError('forbidden', 'You do not have access to this incident.'))
    open()
    expect(await screen.findByText("You don't have access to this incident.")).toBeTruthy()
    expect(screen.queryByText(/archived/)).toBeNull()
  })

  it('offers a retry when the request failed, and loads on retry', async () => {
    getIncident.mockRejectedValueOnce(new ApiError('network', 'Could not reach the server.'))
    getIncident.mockReturnValueOnce(new Promise(() => {})) // the retry is in flight
    open()
    expect(await screen.findByText("Couldn't load this incident")).toBeTruthy()
    expect(screen.queryByText(/no longer available/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /try again|retry/i }))
    await waitFor(() => expect(getIncident).toHaveBeenCalledTimes(2))
  })
})
