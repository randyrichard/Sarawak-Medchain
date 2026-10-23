import { describe, expect, it, vi } from 'vitest'

/**
 * Starting an investigation's action from Corrective Actions keeps it an investigation's action.
 *
 * The page puts the server's reply in place of the row it had. That reply went through the
 * incident-scoped mapper, which has no incident in it, so the drawer took the action for a
 * standalone one and sent its evidence to field evidence - which the server refuses for an
 * incident's action. An evidence-required action started there could then not be completed.
 */
vi.mock('./authApi', async (orig) => ({
  ...(await orig<typeof import('./authApi')>()),
  isBackendConfigured: () => true,
}))
const request = vi.fn()
vi.mock('./http', async (orig) => ({
  ...(await orig<typeof import('./http')>()),
  request: (...a: unknown[]) => request(...a),
}))

const { api } = await import('./client')

const reply = {
  id: 'a1', code: 'CA-1', incidentId: 'inc1', companyId: 'c1', siteId: 's1', title: 'Refit the guard', detail: '',
  owner: 'Grace Lim', ownerId: null, dueDate: '2026-10-30T00:00:00.000Z', priority: 'High', status: 'in_progress',
  evidenceRequired: true, evidenceNote: null, completedAt: null, verifiedBy: null, verifiedAt: null,
  source: 'incident', version: 2, createdAt: '2026-10-20T00:00:00.000Z',
  incidentNumber: 'INC-2748', incidentTitle: 'Slip on the jetty', department: 'Operations',
}

describe('updating a corrective action on a server', () => {
  it('keeps the incident it belongs to, so its evidence still goes to the incident', async () => {
    request.mockResolvedValueOnce(reply)
    const item = await api.updateCapa('a1', { status: 'In Progress' }, { name: 'Marcus Tan', role: 'hse_manager' })
    expect(request).toHaveBeenCalledWith('/incidents/actions/a1', expect.objectContaining({ method: 'PATCH' }))
    expect(item).toMatchObject({
      id: 'a1', status: 'In Progress', incidentId: 'inc1', incidentNumber: 'INC-2748', siteId: 's1', companyId: 'c1',
    })
  })
})
