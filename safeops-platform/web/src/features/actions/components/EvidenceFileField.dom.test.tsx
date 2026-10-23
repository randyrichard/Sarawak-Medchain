// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Incident } from '@/api/incidents'

/*
 * Completing an action that asked for evidence, from wherever "Complete" is offered.
 *
 * The server refuses to complete such an action without a file. Only the Corrective Actions
 * drawer could take one: the incident's Actions tab and the board offered Complete with a
 * note and nothing else, so an investigation's action - evidence-required by default - was
 * refused there every time, with nowhere to add the file. And where a file goes depends on
 * whose action it is: an incident's action keeps its files with the incident.
 */
const upload = vi.fn()
vi.mock('@/api/http', async (orig) => ({ ...(await orig<object>()), upload: (...a: unknown[]) => upload(...a) }))
/** A deployment with a server, unless a test says it is the offline demo. */
let backend = true
vi.mock('@/api/authApi', async (orig) => ({ ...(await orig<object>()), isBackendConfigured: () => backend }))
vi.mock('@/api/client', () => ({ api: { updateIncidentAction: vi.fn() } }))
vi.mock('@/features/org/OrgContext', () => ({ useOrg: () => ({ role: 'hse_manager', company: { id: 'big' }, sites: [] }) }))
vi.mock('@/features/incidents/lib', async (orig) => ({
  ...(await orig<object>()),
  usePeople: () => ['Grace Lim'],
  useActor: () => ({ name: 'Marcus Tan', role: 'hse_manager' }),
}))

const { EvidenceFileField } = await import('./EvidenceFileField')
const { ActionsPanel } = await import('@/features/incidents/components/ActionsPanel')

afterEach(() => { cleanup(); upload.mockReset(); backend = true })

const photo = () => new File(['x'], 'guard-refitted.jpg', { type: 'image/jpeg' })
const attach = () => fireEvent.change(document.querySelector('input[type=file]')!, { target: { files: [photo()] } })
const sent = () => upload.mock.calls[0] as [string, FormData]

describe('the evidence file an action closes on', () => {
  it('files an investigation\'s action with its incident', async () => {
    upload.mockResolvedValue({})
    render(<EvidenceFileField actionId="a1" incidentId="inc1" onError={() => {}} />)
    attach()
    await waitFor(() => expect(upload).toHaveBeenCalled())
    expect(sent()[0]).toBe('/incidents/inc1/attachments')
    expect(sent()[1].get('actionId')).toBe('a1')
    expect(await screen.findByText('guard-refitted.jpg')).toBeTruthy()
  })

  it('files a standalone action\'s as field evidence', async () => {
    upload.mockResolvedValue({})
    render(<EvidenceFileField actionId="a2" onError={() => {}} />)
    attach()
    await waitFor(() => expect(upload).toHaveBeenCalled())
    expect(sent()[0]).toBe('/evidence/actions/a2')
    expect(sent()[1].get('actionId')).toBeNull()
  })

  it('says what went wrong where the host shows its problems', async () => {
    upload.mockRejectedValue(new Error('That file type is not allowed.'))
    const onError = vi.fn()
    render(<EvidenceFileField actionId="a1" incidentId="inc1" onError={onError} />)
    attach()
    await waitFor(() => expect(onError).toHaveBeenLastCalledWith('That file type is not allowed.'))
  })

  it('is not offered by the offline demo, which has nowhere to keep a file', () => {
    backend = false
    const { container } = render(<EvidenceFileField actionId="a1" incidentId="inc1" onError={() => {}} />)
    expect(container.innerHTML).toBe('')
  })

  it('is offered by the incident\'s own Complete dialog, which had only a note', async () => {
    const incident = {
      id: 'inc1', stage: 'actions', rca: { causes: [] },
      actions: [{
        id: 'a1', title: 'Refit the guard', owner: 'Grace Lim', dueDate: '2026-10-30', priority: 'High',
        status: 'In Progress', evidenceRequired: true, causeId: null, notes: [],
      }],
    } as unknown as Incident
    render(<ActionsPanel incident={incident} onUpdate={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Complete…' }))
    expect(screen.getByText('Evidence file')).toBeTruthy()

    upload.mockResolvedValue({})
    attach()
    await waitFor(() => expect(upload).toHaveBeenCalled())
    expect(sent()[0]).toBe('/incidents/inc1/attachments')
    expect(sent()[1].get('actionId')).toBe('a1')
  })
})
