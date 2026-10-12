import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * What a manager types into a corrective action reaches the server, and what comes back
 * is what the server holds.
 *
 * On a server the new-action form dropped its details and its evidence rule on the way in,
 * the register then said every action needed a file to close, and Edit and Reassign saved
 * nothing but the due date: the old owner kept the work and the new one never heard of it.
 * Each looked saved. Found by reading the request each form sends.
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

/** An action as the server sends it. */
const row = (over: Record<string, unknown> = {}) => ({
  id: 'a1', code: 'CA-401', incidentId: null, companyId: 'c1', siteId: 's1',
  title: 'Replace extinguisher', detail: 'Block C, level 2', owner: 'Ahmad Ali', ownerId: null,
  dueDate: '2030-01-01T00:00:00.000Z', priority: 'Medium', status: 'open', evidenceRequired: false,
  evidenceNote: null, completedAt: null, verifiedBy: null, verifiedAt: null, source: 'manual',
  version: 1, createdAt: '2026-10-12T00:00:00.000Z', ...over,
})
/** The body of the nth request, as the server receives it. */
const sent = (n: number) => JSON.parse(request.mock.calls[n][1].body as string)
const actor = { name: 'Marcus Tan', role: 'hse_manager' }

afterEach(() => request.mockReset())

describe('corrective actions on a server', () => {
  it('raises an action with its details and its evidence rule', async () => {
    request.mockResolvedValue(row({ evidenceRequired: true }))
    const item = await api.addStandaloneAction({
      title: 'Replace extinguisher', description: 'Block C, level 2', companyId: 'c1', siteId: 's1',
      department: '', owner: 'Ahmad Ali', priority: 'Medium', dueDate: '2030-01-01', evidenceRequired: true,
    }, actor)
    expect(sent(0)).toMatchObject({ detail: 'Block C, level 2', evidenceRequired: true })
    expect(item).toMatchObject({ description: 'Block C, level 2', evidenceRequired: true })
  })

  it('asks for a file to close an action only when it was raised that way', async () => {
    request.mockResolvedValue(row({ evidenceRequired: false }))
    expect((await api.updateCapa('a1', { status: 'In Progress' }, actor)).evidenceRequired).toBe(false)
  })

  it('saves a new owner, priority and details', async () => {
    request.mockResolvedValue(row({ owner: 'Grace Lim', priority: 'High', detail: 'Both sides' }))
    const item = await api.updateCapa('a1', { owner: 'Grace Lim', priority: 'High', description: 'Both sides' }, actor)
    expect(sent(0)).toMatchObject({ owner: 'Grace Lim', priority: 'High', detail: 'Both sides' })
    expect(item).toMatchObject({ owner: 'Grace Lim', priority: 'High', description: 'Both sides' })
  })

  it('sends nothing it was not given, so an owner moving their own action on is not refused', async () => {
    request.mockResolvedValue(row({ status: 'in_progress' }))
    await api.updateCapa('a1', { status: 'In Progress' }, actor)
    expect(Object.keys(sent(0))).toEqual(['status'])
  })

  it('raises an investigation\'s action with its evidence rule', async () => {
    // The action, then the incident re-read; only what was sent matters here.
    request.mockResolvedValueOnce(row({ incidentId: 'i1', evidenceRequired: true })).mockRejectedValueOnce(new Error('not needed'))
    await api.addIncidentAction('i1', {
      title: 'Refit guard', causeId: null, owner: 'Ahmad Ali', dueDate: '2030-01-01', priority: 'High', evidenceRequired: true,
    }, actor).catch(() => {})
    expect(sent(0)).toMatchObject({ title: 'Refit guard', evidenceRequired: true })
  })
})
