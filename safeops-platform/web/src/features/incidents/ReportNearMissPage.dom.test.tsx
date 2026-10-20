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
// jsdom has no IndexedDB, so the real one reports the queue as memory-only. The page says
// so, correctly — but these tests are about the report, so they stand in a browser with it.
let persistent = true
vi.mock('./outbox', async (orig) => ({
  ...(await orig<object>()),
  enqueue: (...a: unknown[]) => enqueue(...a),
  isPersistent: () => persistent,
}))
vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', name: 'Melissa Bong' } }) }))
vi.mock('@/features/org/OrgContext', () => ({
  useOrg: () => ({ company: { id: 'big' }, site: null, sites: [{ id: 'kch', name: 'Kuching Assembly Plant' }], role: 'employee', membership: null }),
}))

const { ReportNearMissPage } = await import('./ReportNearMissPage')

afterEach(() => {
  cleanup()
  createIncident.mockReset()
  addIncidentAttachment.mockReset()
  enqueue.mockReset()
  persistent = true
  localStorage.clear()
})

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

  it('keeps a report made with no signal, under its key, and keeps the photo with it', async () => {
    /*
     * The photo used to be dropped here: the queue was localStorage, which holds strings, so
     * the screen told the reporter to come back and photograph the plank again. The bytes go
     * into the queue now (see ./outbox.ts), which on a scaffold is the difference between
     * evidence and a memory of it.
     */
    createIncident.mockRejectedValue(new ApiError('network', 'Could not reach the server.'))
    const photo = new File([new Uint8Array(1024)], 'plank.jpg', { type: 'image/jpeg' })
    await fillAndSubmit([photo])
    await screen.findByText('Saved on this phone')
    expect(enqueue).toHaveBeenCalledTimes(1)
    const [userId, input, key, files] = enqueue.mock.calls[0]
    expect(userId).toBe('u1')
    expect(input.type).toBe('near_miss')
    expect(key).toBe(createIncident.mock.calls[0][0].clientRef)
    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({ name: 'plank.jpg', type: 'image/jpeg' })
    expect(files[0].blob).toBe(photo)
    expect(screen.getByText(/kept with it and goes/)).toBeTruthy()
    expect(screen.queryByText(/could not be kept/)).toBeNull()
  })

  it('does not say it was saved when the phone would not store it', async () => {
    createIncident.mockRejectedValue(new ApiError('network', 'Could not reach the server.'))
    enqueue.mockRejectedValue(new Error('QuotaExceededError'))
    await fillAndSubmit()

    await screen.findByText(/would not store the report/)
    expect(screen.queryByText('Saved on this phone')).toBeNull()
  })

  it('tells a browser with no storage that the report only lives in this tab', async () => {
    persistent = false
    createIncident.mockRejectedValue(new ApiError('network', 'Could not reach the server.'))
    await fillAndSubmit()

    await screen.findByText('Saved on this phone')
    expect(screen.getByText(/only held while this tab stays open/)).toBeTruthy()
  })

  it('still refuses, rather than queues, what the server turned down', async () => {
    createIncident.mockRejectedValue(new ApiError('validation', 'Location is required.'))
    await fillAndSubmit()
    await screen.findByText('Location is required.')
    expect(enqueue).not.toHaveBeenCalled()
  })

  /*
   * "Submit Near Miss" stayed grey until "What happened" had five letters and "Where" two,
   * written nowhere. "Fire" was refused without a word.
   */
  it('can always be pressed, and then says what is missing under the field', () => {
    render(<MemoryRouter><ReportNearMissPage /></MemoryRouter>)
    const submit = screen.getByRole('button', { name: /Submit Near Miss/ }) as HTMLButtonElement
    expect(submit.disabled).toBe(false)

    fireEvent.click(submit)
    expect(createIncident).not.toHaveBeenCalled()
    const what = screen.getByLabelText(/What happened/)
    expect(what.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('Say what happened or what you saw.')).toBeTruthy()
    expect(screen.getByText(/Say where it was/)).toBeTruthy()
    // The keyboard is taken to the first thing to put right.
    expect(document.activeElement).toBe(what)
  })

  it('asks for a few more words rather than refusing "Fire" in silence', () => {
    render(<MemoryRouter><ReportNearMissPage /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText(/What happened/), { target: { value: 'Fire' } })
    fireEvent.change(screen.getByLabelText(/Where was it/), { target: { value: 'Jetty 2' } })
    fireEvent.click(screen.getByRole('button', { name: /Submit Near Miss/ }))
    expect(screen.getByText(/A few more words/)).toBeTruthy()
    expect(screen.queryByText(/Say where it was/)).toBeNull()
    expect(document.activeElement).toBe(screen.getByLabelText(/What happened/))
  })

  it('clears each message as the field is put right, then sends', async () => {
    createIncident.mockResolvedValue({ id: 'inc-10', number: 'INC-10' })
    render(<MemoryRouter><ReportNearMissPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /Submit Near Miss/ }))
    fireEvent.change(screen.getByLabelText(/What happened/), { target: { value: 'Oil on the stairs to the control room' } })
    expect(screen.queryByText('Say what happened or what you saw.')).toBeNull()
    fireEvent.change(screen.getByLabelText(/Where was it/), { target: { value: 'Control room stairs' } })
    fireEvent.click(screen.getByRole('button', { name: /Submit Near Miss/ }))
    await screen.findByText(/worth reporting/)
    expect(createIncident).toHaveBeenCalledTimes(1)
  })
})
