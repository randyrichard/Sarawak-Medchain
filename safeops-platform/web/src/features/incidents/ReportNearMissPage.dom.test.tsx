// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ApiError } from '@/api/types'

/**
 * The near-miss form on a phone: photos that are said to be attached are sent, and a report
 * made with no signal is kept rather than lost.
 *
 * It said "1 photo(s) attached" and sent only the file's name; and with no connection it
 * said "try again", which on site means retyping it later or not at all.
 */
const createIncident = vi.fn()
const addIncidentAttachment = vi.fn()
const enqueue = vi.fn()
vi.mock('@/api/client', () => ({
  api: {
    createIncident: (...a: unknown[]) => createIncident(...a),
    addIncidentAttachment: (...a: unknown[]) => addIncidentAttachment(...a),
  },
}))
vi.mock('./outbox', async (orig) => ({ ...(await orig<object>()), enqueue: (...a: unknown[]) => enqueue(...a) }))
vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', name: 'Melissa Bong' } }) }))
vi.mock('@/features/org/OrgContext', () => ({
  useOrg: () => ({ company: { id: 'big' }, site: null, sites: [{ id: 'kch', name: 'Kuching Assembly Plant' }], role: 'employee', membership: null }),
}))

const { ReportNearMissPage } = await import('./ReportNearMissPage')

afterEach(() => { cleanup(); createIncident.mockReset(); addIncidentAttachment.mockReset(); enqueue.mockReset(); localStorage.clear() })

async function fillAndSubmit(files: File[] = []) {
  render(<MemoryRouter><ReportNearMissPage /></MemoryRouter>)
  fireEvent.change(screen.getByLabelText(/What happened/), { target: { value: 'Unsecured plank on the scaffold.' } })
  fireEvent.change(screen.getByLabelText(/Where was it/), { target: { value: 'Level 3 walkway' } })
  if (files.length) fireEvent.change(document.querySelector('input[type=file]')!, { target: { files } })
  fireEvent.click(screen.getByRole('button', { name: /Submit Near Miss/ }))
}

describe('ReportNearMissPage', () => {
  it('sends the photo to the new report', async () => {
    createIncident.mockResolvedValue({ id: 'inc-9', number: 'INC-9' })
    addIncidentAttachment.mockResolvedValue({})
    const photo = new File([new Uint8Array(1024)], 'plank.jpg', { type: 'image/jpeg' })
    await fillAndSubmit([photo])
    await screen.findByText(/worth reporting/)
    expect(addIncidentAttachment).toHaveBeenCalledTimes(1)
    expect(addIncidentAttachment.mock.calls[0][0]).toBe('inc-9')
    expect(addIncidentAttachment.mock.calls[0][3]).toBe(photo)
  })

  it('keeps a report made with no signal, under its key, and says the photos were not kept', async () => {
    createIncident.mockRejectedValue(new ApiError('network', 'Could not reach the server.'))
    const photo = new File([new Uint8Array(1024)], 'plank.jpg', { type: 'image/jpeg' })
    await fillAndSubmit([photo])
    await screen.findByText('Saved on this phone')
    expect(enqueue).toHaveBeenCalledTimes(1)
    const [userId, input, key] = enqueue.mock.calls[0]
    expect(userId).toBe('u1')
    expect(input.type).toBe('near_miss')
    expect(key).toBe(createIncident.mock.calls[0][0].clientRef)
    expect(screen.getByText(/could not be kept with it/)).toBeTruthy()
  })

  it('still refuses, rather than queues, what the server turned down', async () => {
    createIncident.mockRejectedValue(new ApiError('validation', 'Location is required.'))
    await fillAndSubmit()
    await screen.findByText('Location is required.')
    expect(enqueue).not.toHaveBeenCalled()
  })
})
