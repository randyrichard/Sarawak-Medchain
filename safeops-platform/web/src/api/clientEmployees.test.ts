import { describe, expect, it, vi } from 'vitest'

/**
 * With a server, the people list comes from the employee register, not the demo fixtures.
 *
 * It used to read only the offline demo's fixture people. Outside development those are
 * empty, so on a real deployment the training "New session" dialog listed nobody to enrol
 * and Organization → People was blank. Found by scheduling a session in a browser.
 */
vi.mock('./authApi', async (orig) => ({
  ...(await orig<typeof import('./authApi')>()),
  isBackendConfigured: () => true,
}))

const list = vi.fn()
vi.mock('./employeesApi', () => ({ employeesApi: { list: (...a: unknown[]) => list(...a) } }))

const { api } = await import('./client')

const row = (n: number) => ({
  id: `e${n}`, companyId: 'c1', siteId: 's1', departmentId: null, teamId: null,
  name: `Person ${n}`, position: 'Rigger', email: null,
})

describe('api.listEmployees on a server', () => {
  it('returns every active person in the register, across pages', async () => {
    list.mockImplementation(async (_c: string, f: { page: number; pageSize: number }) => ({
      rows: f.page === 1 ? Array.from({ length: f.pageSize }, (_, i) => row(i)) : [row(f.pageSize)],
      total: f.pageSize + 1, page: f.page, pageSize: f.pageSize,
    }))
    const people = await api.listEmployees('c1')

    expect(list).toHaveBeenCalledWith('c1', expect.objectContaining({ page: 1, status: 'active' }))
    expect(people).toHaveLength(list.mock.calls[0][1].pageSize + 1)
    expect(people[0]).toEqual({
      id: 'e0', companyId: 'c1', siteId: 's1', departmentId: '', teamId: undefined,
      name: 'Person 0', position: 'Rigger', email: undefined,
    })
  })
})
