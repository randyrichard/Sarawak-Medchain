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
// jsdom has no IndexedDB, so the real one reports the queue as memory-only. The page then
// says so, correctly — but that is not what these tests are about, so they stand in a
// browser that does have it.
let persistent = true
vi.mock('@/api/client', () => ({
  api: {
    createIncident: (...a: unknown[]) => createIncident(...a),
    addIncidentAttachment: (...a: unknown[]) => addIncidentAttachment(...a),
  },
}))
vi.mock('./outbox', async (orig) => ({
  ...(await orig<object>()),
  enqueue: (...a: unknown[]) => enqueue(...a),
  isPersistent: () => persistent,
}))
vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', name: 'Melissa Bong' } }) }))
vi.mock('@/features/org/OrgContext', () => ({
  useOrg: () => ({ company: { id: 'big' }, sites: [{ id: 'kch', name: 'Kuching Assembly Plant' }], role: 'employee', membership: null }),
}))
vi.mock('@/features/org/departments', () => ({ useDepartments: () => ['Maintenance'] }))
vi.mock('@/app/pageTitle', () => ({ usePageTitle: () => {} }))

const { ReportIncidentPage } = await import('./ReportIncidentPage')

afterEach(() => {
  cleanup()
  createIncident.mockReset()
  addIncidentAttachment.mockReset()
  enqueue.mockReset()
  persistent = true
  localStorage.clear()
})

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

  it('queues the photo’s bytes with a report that had no signal, and says they were kept', async () => {
    /*
     * The hole this closes. The queue was localStorage, which holds strings, so a report
     * saved in a yard kept its text and dropped its evidence — and the screen told the
     * reporter the photos could not be kept, which at least was honest, but meant going back
     * to photograph the scene again. It no longer does either.
     */
    createIncident.mockRejectedValue(new ApiError('network', 'Could not reach the server.'))
    const photo = new File([new Uint8Array(2048)], 'scene.jpg', { type: 'image/jpeg' })
    await fillAndSubmit([photo])

    await screen.findByRole('heading', { name: 'Report saved' })
    const [, , , files] = enqueue.mock.calls[0]
    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({ name: 'scene.jpg', type: 'image/jpeg' })
    // The bytes themselves, not a name and a size.
    expect(files[0].blob).toBe(photo)
    expect(screen.getByText(/goes up with the report/)).toBeTruthy()
    expect(screen.queryByText(/could not be kept/)).toBeNull()
  })

  it('does not say a report is saved when the device would not store it', async () => {
    // A confirmation here would be the worst possible lie to tell about an injury report.
    createIncident.mockRejectedValue(new ApiError('network', 'Could not reach the server.'))
    enqueue.mockRejectedValue(new Error('QuotaExceededError'))
    await fillAndSubmit()

    await screen.findByText(/would not store the report/)
    expect(screen.queryByRole('heading', { name: 'Report saved' })).toBeNull()
  })

  it('tells a browser with no storage that the report only lives in this tab', async () => {
    persistent = false
    createIncident.mockRejectedValue(new ApiError('network', 'Could not reach the server.'))
    await fillAndSubmit()

    await screen.findByRole('heading', { name: 'Report saved' })
    expect(screen.getByText(/only held while this tab stays open/)).toBeTruthy()
    expect(screen.queryByText(/safe to close the app/)).toBeNull()
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

describe('ReportIncidentPage, getting through and out of it', () => {
  it('offers a way out on the first step, instead of a Back that cannot be pressed', () => {
    render(<MemoryRouter><ReportIncidentPage /></MemoryRouter>)
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Cancel' }).getAttribute('href')).toBe('/incidents')
  })

  it('takes the keyboard to the first thing to put right when Continue is pressed too soon', () => {
    render(<MemoryRouter><ReportIncidentPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByText('Pick the type that fits best.')).toBeTruthy()
    // The first type in the picker: the first thing on the step still to be answered.
    expect(document.activeElement).toBe(document.querySelector('[aria-labelledby="incident-type-label"] button'))

    fireEvent.click(document.querySelector('[aria-labelledby="incident-type-label"] button')!)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(document.activeElement).toBe(screen.getByLabelText(/Severity/))
  })
})

