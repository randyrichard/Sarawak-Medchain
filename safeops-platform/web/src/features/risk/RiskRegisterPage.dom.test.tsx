// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { RiskRegister, RiskRow } from '@/api/riskApi'
import { ApiError } from '@/api/types'

/**
 * The HIRARC register as the safety team uses it.
 *
 * What each row needs is the server's judgement (api/src/domain/hirarc.ts, tested over HTTP
 * there). What is tested here: that the matrix shows the server's counts and narrows the
 * register, that the form previews the risk it will save, and that what a person records
 * is what is sent.
 */
let backend = true
vi.mock('@/api/authApi', async (orig) => ({ ...(await orig<object>()), isBackendConfigured: () => backend }))
vi.mock('@/features/org/OrgContext', () => ({
  useOrg: () => ({
    company: { id: 'big', name: 'Big Co' },
    site: null,
    sites: [{ id: 'btu', name: 'Bintulu Yard', short: 'BTU' }, { id: 'mri', name: 'Miri Base', short: 'MRI' }],
  }),
}))
vi.mock('@/lib/saveBlob', () => ({ saveBlob: vi.fn() }))
const list = vi.fn()
const get = vi.fn()
const create = vi.fn()
const raiseAction = vi.fn()
vi.mock('@/api/riskApi', async (orig) => ({
  ...(await orig<object>()),
  riskApi: {
    list: (...a: unknown[]) => list(...a), get: (...a: unknown[]) => get(...a), create: (...a: unknown[]) => create(...a),
    raiseAction: (...a: unknown[]) => raiseAction(...a), update: vi.fn(), archive: vi.fn(), restore: vi.fn(), exportCsv: vi.fn(),
  },
}))

const { RiskRegisterPage } = await import('./RiskRegisterPage')

afterEach(() => { cleanup(); vi.clearAllMocks(); backend = true })

const row = (over: Partial<RiskRow> = {}): RiskRow => ({
  id: 'r1', code: 'HZ-1001', companyId: 'big', siteId: 'btu', siteName: 'Bintulu Yard',
  activity: 'Loading at Bay 4', hazard: 'Reversing forklift', effect: 'Struck-by injury', existingControls: 'Reversing alarm',
  likelihood: 4, severity: 4, riskScore: 16, level: 'high',
  additionalControls: 'Banksman; exclusion zone', owner: 'Ali Hassan', controlsDue: '2026-11-30',
  residualLikelihood: null, residualSeverity: null, residualScore: null, residualLevel: null,
  controls: 'planned', needsControls: false, needsDate: false, controlsOverdue: false, reviewOverdue: false,
  assessedBy: 'Grace Lim', assessedOn: '2026-10-20', reviewDue: '2027-10-20',
  archivedAt: null, archivedBy: null, archivedReason: null, actions: [], version: 1, updatedAt: '2026-10-20T00:00:00Z', canEdit: true,
  ...over,
})

const empty = () => Array.from({ length: 5 }, () => Array<number>(5).fill(0))
const register = (over: Partial<RiskRegister> = {}): RiskRegister => {
  const now = empty()
  now[3][3] = 1
  return {
    rows: [row()], total: 1, capped: false, matrix: { now, residual: empty() },
    counts: { high: 1, medium: 0, low: 0, reviewOverdue: 0, needsControls: 0, controlsOverdue: 0 }, canEdit: true, ...over,
  }
}

const renderPage = () => render(<MemoryRouter><RiskRegisterPage /></MemoryRouter>)

describe('the HIRARC register', () => {
  it('shows the server\'s count in its cell, and narrows the register to a cell when it is pressed', async () => {
    list.mockResolvedValue(register())
    renderPage()
    const cell = await screen.findByRole('button', { name: /Likelihood 4 Possible, severity 4 Fatal: risk 16, High\. 1 hazard\./ })
    expect(within(cell).getByText('1')).toBeTruthy()
    fireEvent.click(cell)
    await waitFor(() => expect(list).toHaveBeenLastCalledWith('big', expect.objectContaining({ likelihood: 4, severity: 4, residual: false })))
    expect(await screen.findByText(/Showing Possible × Fatal/)).toBeTruthy()
  })

  it('previews the risk the form will save, with what its band asks for, and sends what was entered', async () => {
    list.mockResolvedValue(register())
    create.mockResolvedValue(row({ id: 'r2', code: 'HZ-1002' }))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Add Hazard/ }))
    fireEvent.change(screen.getByLabelText(/Work Activity/), { target: { value: 'Hot work' } })
    fireEvent.change(screen.getByLabelText(/^Hazard/), { target: { value: 'Sparks near solvent store' } })
    fireEvent.change(screen.getByLabelText(/Which Can Cause/), { target: { value: 'Fire, burns' } })
    fireEvent.click(screen.getByRole('radio', { name: /4 Possible/ }))
    fireEvent.click(screen.getByRole('radio', { name: /5 Catastrophic/ }))
    expect(screen.getByText('4 × 5 = 20')).toBeTruthy()
    expect(screen.getAllByText(/Act now to control the hazard/).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(create.mock.calls[0][0]).toBe('big')
    expect(create.mock.calls[0][1]).toMatchObject({
      siteId: 'btu', activity: 'Hot work', hazard: 'Sparks near solvent store', effect: 'Fire, burns', likelihood: 4, severity: 5,
    })
  })

  it('shows the server\'s refusal in its own words, beside the button that was pressed', async () => {
    list.mockResolvedValue(register())
    create.mockRejectedValue(new ApiError('validation', 'Name the work activity.'))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Add Hazard/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Name the work activity.')).toBeTruthy()
  })

  it('raises the recommended controls as an action, with the row\'s owner and date, and links to it', async () => {
    list.mockResolvedValue(register())
    raiseAction.mockResolvedValue({ id: 'ca9', code: 'CA-409' })
    get.mockResolvedValue(row({ controls: 'in_progress', actions: [{ id: 'ca9', code: 'CA-409', title: 'Control: Reversing forklift', owner: 'Ali Hassan', dueDate: '2026-11-30', status: 'open' }] }))
    renderPage()
    fireEvent.click(await screen.findByText('Reversing forklift'))
    fireEvent.click(await screen.findByRole('button', { name: 'Raise Corrective Action' }))
    expect((screen.getByLabelText('Owner') as HTMLInputElement).value).toBe('Ali Hassan')
    fireEvent.click(screen.getByRole('button', { name: 'Raise Action' }))
    await waitFor(() => expect(raiseAction).toHaveBeenCalledWith('r1', { title: 'Control: Reversing forklift', owner: 'Ali Hassan', dueDate: '2026-11-30' }))
    const link = await screen.findByRole('link', { name: 'Open it in Corrective Actions' })
    expect(link.getAttribute('href')).toBe('/actions?open=ca9')
  })

  it('offers no changes to someone who can only read it', async () => {
    list.mockResolvedValue(register({ canEdit: false, rows: [row({ canEdit: false })] }))
    renderPage()
    expect(await screen.findByText('Reversing forklift')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Add Hazard/ })).toBeNull()
  })

  it('says, calmly, that the offline demo does not keep one', () => {
    backend = false
    renderPage()
    expect(screen.getByText(/The HIRARC register needs the server/)).toBeTruthy()
    expect(list).not.toHaveBeenCalled()
  })
})
