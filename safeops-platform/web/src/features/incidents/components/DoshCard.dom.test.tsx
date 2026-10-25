// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { DoshView, DoshOutstanding } from '@/api/doshApi'
import { ApiError } from '@/api/types'

/**
 * The DOSH duty on an incident, as the incident page and the register show it.
 *
 * The rules are the server's; what is tested here is that the card says what the server
 * said - the question while undecided, the immediate notice while it is owed, the deadline
 * - and that what a person records is what is sent.
 */
let backend = true
vi.mock('@/api/authApi', async (orig) => ({ ...(await orig<object>()), isBackendConfigured: () => backend }))
const get = vi.fn()
const save = vi.fn()
const outstanding = vi.fn()
vi.mock('@/api/doshApi', async (orig) => ({
  ...(await orig<object>()),
  doshApi: {
    get: (...a: unknown[]) => get(...a), save: (...a: unknown[]) => save(...a), outstanding: (...a: unknown[]) => outstanding(...a),
  },
}))

const { DoshCard } = await import('./DoshCard')
const { DoshOutstandingBanner } = await import('./DoshOutstandingBanner')

afterEach(() => { cleanup(); vi.clearAllMocks(); backend = true })

const view = (over: Partial<DoshView> = {}): DoshView => ({
  incidentId: 'inc1', category: null, categoryLabel: null, detail: null, notRequiredReason: null,
  decidedBy: null, decidedAt: null, clockFrom: null, informedAt: null, informedHow: null, office: null,
  submittedAt: null, reference: null,
  suggestion: { category: 'over_four_days', flagged: true, reason: 'An injured person was off work for 6 days - more than four.' },
  status: { state: 'decide', form: null, immediate: false, immediateOutstanding: false, dueDate: '2026-10-22', daysLeft: 2 },
  canEdit: true,
  ...over,
})

describe('the DOSH card on an incident', () => {
  it('asks the question, with the deadline that is already running', async () => {
    get.mockResolvedValue(view())
    render(<DoshCard incidentId="inc1" />)
    expect(await screen.findByText('Decide whether DOSH must be told')).toBeTruthy()
    expect(screen.getByText(/off work for 6 days/)).toBeTruthy()
    expect(screen.getByText(/2 days left/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Record Decision' })).toBeTruthy()
  })

  it('says to tell DOSH at once while the immediate notice is owed', async () => {
    get.mockResolvedValue(view({
      category: 'death', categoryLabel: 'Death',
      status: { state: 'due', form: 'JKKP 6', immediate: true, immediateOutstanding: true, dueDate: '2026-10-22', daysLeft: 2 },
    }))
    render(<DoshCard incidentId="inc1" />)
    expect(await screen.findByText(/Tell DOSH now/)).toBeTruthy()
    expect(screen.getByText(/JKKP 6 due by/)).toBeTruthy()
  })

  it('sends what was recorded, and shows the server\'s refusal in its own words', async () => {
    get.mockResolvedValue(view())
    save.mockRejectedValueOnce(new ApiError('validation', 'Say why DOSH need not be told.'))
    render(<DoshCard incidentId="inc1" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Record Decision' }))
    fireEvent.click(screen.getByLabelText(/Not notifiable to DOSH/))
    fireEvent.change(screen.getByLabelText(/Why DOSH need not be told/), { target: { value: 'Back at work the same shift.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(save).toHaveBeenCalled())
    expect(save.mock.calls[0][0]).toBe('inc1')
    expect(save.mock.calls[0][1]).toMatchObject({ category: 'not_notifiable', notRequiredReason: 'Back at work the same shift.', submittedAt: null })
    expect(await screen.findByText('Say why DOSH need not be told.')).toBeTruthy()
  })

  it('starts the form on what the record points to', async () => {
    get.mockResolvedValue(view())
    render(<DoshCard incidentId="inc1" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Record Decision' }))
    expect((screen.getByLabelText(/Off normal work for more than 4 days/) as HTMLInputElement).checked).toBe(true)
  })

  it('tells someone who cannot record it who can', async () => {
    get.mockResolvedValue(view({ canEdit: false }))
    render(<DoshCard incidentId="inc1" />)
    expect(await screen.findByText(/HSE Manager, Safety Officer or Admin records this/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Record Decision' })).toBeNull()
  })

  it('says, calmly, that the offline demo cannot track it', () => {
    backend = false
    render(<DoshCard incidentId="inc1" />)
    expect(screen.getByText(/needs the server/)).toBeTruthy()
    expect(get).not.toHaveBeenCalled()
  })
})

describe('what is owed to DOSH, above the register', () => {
  const row = (over: Partial<DoshOutstanding> = {}): DoshOutstanding => ({
    incidentId: 'inc9', number: 'INC-2609', title: 'Fall from ladder', siteName: 'Bintulu', occurredAt: '2026-10-15T01:00:00Z',
    category: 'over_four_days', categoryLabel: 'Off normal work for more than 4 days', state: 'overdue', form: 'JKKP 6',
    dueDate: '2026-10-22', daysLeft: -1, immediateOutstanding: false, reason: '',
    ...over,
  })

  it('names each incident and what is owed, linked to it', async () => {
    outstanding.mockResolvedValue([row()])
    render(<MemoryRouter><DoshOutstandingBanner companyId="big" /></MemoryRouter>)
    const link = await screen.findByRole('link', { name: 'INC-2609' })
    expect(link.getAttribute('href')).toBe('/incidents/inc9')
    expect(screen.getByText(/JKKP 6 was due/)).toBeTruthy()
  })

  it('says nothing when nothing is owed', async () => {
    outstanding.mockResolvedValue([])
    const { container } = render(<MemoryRouter><DoshOutstandingBanner companyId="big" /></MemoryRouter>)
    await waitFor(() => expect(outstanding).toHaveBeenCalled())
    expect(container.innerHTML).toBe('')
  })
})
