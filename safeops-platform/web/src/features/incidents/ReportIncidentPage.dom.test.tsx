// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ApiError } from '@/api/types'

/**
 * One report, one incident, however the reply is lost.
 *
 * The idempotency key used to be made only after the first attempt failed. A report the
 * server had already saved - its reply lost on site wifi, or the page left mid-send - was
 * then queued under a new key and filed a second time. Found in the browser workflow test:
 * one submission, two incidents. The key now goes with the first attempt, and a queued
 * resend carries the same key, so the server recognises it.
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
  useOrg: () => ({ company: { id: 'big' }, sites: [{ id: 'kch', name: 'Kuching Assembly Plant' }], role: 'employee', membership: null }),
}))
vi.mock('@/features/org/departments', () => ({ useDepartments: () => ['Maintenance'] }))
vi.mock('@/app/pageTitle', () => ({ usePageTitle: () => {} }))

const { ReportIncidentPage } = await import('./ReportIncidentPage')

afterEach(() => { cleanup(); createIncident.mockReset(); addIncidentAttachment.mockReset(); enqueue.mockReset(); localStorage.clear() })

async function fillAndSubmit(files: File[] = []) {
  render(<MemoryRouter><ReportIncidentPage /></MemoryRouter>)
  fireEvent.click(document.querySelector('[aria-labelledby="incident-type-label"] button')!)
  const severity = screen.getByLabelText(/Severity/) as HTMLSelectElement
  fireEvent.change(severity, { target: { value: severity.options[1].value } })
  fireEvent.change(screen.getByLabelText(/One-line title/), { target: { value: 'Slip near wash bay' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.change(await screen.findByLabelText(/^Site/), { target: { value: 'kch' } })
  fireEvent.change(screen.getByLabelText(/Department/), { target: { value: 'Maintenance' } })
  fireEvent.change(screen.getByLabelText(/Exact location/), { target: { value: 'Wash bay 2' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.change(await screen.findByLabelText(/What happened\?/), { target: { value: 'Slipped on oily water near the drain.' } })
  fireEvent.change(screen.getByLabelText(/Immediate actions taken/), { target: { value: 'Area cordoned and cleaned.' } })
  if (files.length) fireEvent.change(document.querySelector('input[type=file]')!, { target: { files } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.change(await screen.findByLabelText(/Type your full name to sign/), { target: { value: 'Melissa Bong' } })
  fireEvent.click(screen.getByLabelText(/I confirm this report is accurate/))
  fireEvent.click(screen.getByRole('button', { name: 'Submit Report' }))
}

describe('ReportIncidentPage submission', () => {
  it('says a time in the future is wrong, and will not go on until it is fixed', () => {
    render(<MemoryRouter><ReportIncidentPage /></MemoryRouter>)
    fireEvent.click(document.querySelector('[aria-labelledby="incident-type-label"] button')!)
    const severity = screen.getByLabelText(/Severity/) as HTMLSelectElement
    fireEvent.change(severity, { target: { value: severity.options[1].value } })
    fireEvent.change(screen.getByLabelText(/One-line title/), { target: { value: 'Slip near wash bay' } })
    fireEvent.change(screen.getByLabelText(/Date & time of occurrence/), { target: { value: '2099-01-01T08:00' } })
    expect(screen.getByText('That is in the future. Check the date and time.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.queryByLabelText(/^Site/)).toBeNull()
  })

  it('sends the idempotency key with the first attempt', async () => {
    createIncident.mockResolvedValue({ id: 'inc-1' })
    await fillAndSubmit()
    await waitFor(() => expect(createIncident).toHaveBeenCalledTimes(1))
    expect(createIncident.mock.calls[0][0].clientRef).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('queues a lost send under the same key, so the server can tell it is a repeat', async () => {
    createIncident.mockRejectedValue(new ApiError('network', 'Could not reach the server.'))
    await fillAndSubmit()
    await waitFor(() => expect(enqueue).toHaveBeenCalledTimes(1))
    const sentKey = createIncident.mock.calls[0][0].clientRef
    const [, queuedInput, queuedKey] = enqueue.mock.calls[0]
    expect(sentKey).toBeTruthy()
    expect(queuedKey).toBe(sentKey)
    expect(queuedInput.clientRef).toBe(sentKey)
  })

  it('uploads the photos to the new incident, rather than only listing their names', async () => {
    // Both report forms listed the files and confirmed them, and never sent them.
    createIncident.mockResolvedValue({ id: 'inc-1' })
    addIncidentAttachment.mockResolvedValue({})
    const photo = new File([new Uint8Array(2048)], 'scene.jpg', { type: 'image/jpeg' })
    await fillAndSubmit([photo])
    await waitFor(() => expect(addIncidentAttachment).toHaveBeenCalledTimes(1))
    const [incidentId, meta, , file] = addIncidentAttachment.mock.calls[0]
    expect(incidentId).toBe('inc-1')
    expect(file).toBe(photo)
    expect(meta).toMatchObject({ name: 'scene.jpg', kind: 'image', sizeKb: 2 })
  })

  it('refuses up front, in words, a file the server would reject', async () => {
    createIncident.mockResolvedValue({ id: 'inc-1' })
    const video = new File([new Uint8Array(10)], 'clip.mp4', { type: 'video/mp4' })
    await fillAndSubmit([video])
    await waitFor(() => expect(createIncident).toHaveBeenCalledTimes(1))
    expect(addIncidentAttachment).not.toHaveBeenCalled()
  })
})
