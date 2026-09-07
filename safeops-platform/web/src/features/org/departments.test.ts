import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The departments a workspace already has, offered as suggestions.
 *
 * Six dialogs asked for a department as free text with a placeholder of "e.g. Warehouse",
 * so a workspace that had created Maintenance and Safety got no help from any of them and
 * the same department arrived spelled three ways.
 *
 * The constraint that shapes all of this is in the last two tests: it must never become a
 * closed list. Department is required on an incident, an asset and a corrective action, so
 * a workspace with no departments yet has to be able to type one - the alternative is a
 * form that cannot be submitted, which is exactly the state the Owner picker was in.
 */
const listDepartments = vi.fn()
const employeeDepartments = vi.fn()
const backendConfigured = vi.fn(() => true)

vi.mock('@/api/orgApi', () => ({
  orgApi: { listDepartments: (...a: unknown[]) => listDepartments(...a) },
}))
vi.mock('@/api/employeesApi', () => ({
  employeesApi: { departments: (...a: unknown[]) => employeeDepartments(...a) },
}))
vi.mock('@/api/authApi', () => ({ isBackendConfigured: () => backendConfigured() }))
vi.mock('@/api/mock/fixtures', () => ({
  SITES: [{ id: 's1', companyId: 'demo' }],
  DEPARTMENTS: [{ siteId: 's1', name: 'Fixture Department' }],
}))
vi.mock('@/features/org/OrgContext', () => ({ useOrg: () => ({ company: null, sites: [] }) }))

let mod: typeof import('./departments')

beforeEach(async () => {
  vi.resetModules()
  listDepartments.mockReset()
  employeeDepartments.mockReset()
  backendConfigured.mockReset()
  backendConfigured.mockReturnValue(true)
  listDepartments.mockResolvedValue([])
  employeeDepartments.mockResolvedValue([])
  mod = await import('./departments')
})

describe('loadDepartments', () => {
  it('offers what the workspace created', async () => {
    // The reported case: Maintenance and Safety exist under LMG and nothing suggested them.
    listDepartments.mockResolvedValue([
      { id: 'd1', siteId: 's1', name: 'Maintenance' },
      { id: 'd2', siteId: 's1', name: 'Safety' },
    ])

    expect(await mod.loadDepartments('acme', ['s1'])).toEqual(['Maintenance', 'Safety'])
  })

  it('also offers departments only ever typed onto employee records', async () => {
    /*
     * A workspace that has been filling this in by hand has real departments that were
     * never added to the organisation tree. Hiding them would make the suggestions
     * disagree with the register on the next screen.
     */
    listDepartments.mockResolvedValue([{ id: 'd1', siteId: 's1', name: 'Maintenance' }])
    employeeDepartments.mockResolvedValue(['Warehouse'])

    expect(await mod.loadDepartments('acme', ['s1'])).toEqual(['Maintenance', 'Warehouse'])
  })

  it('lists a department in both places only once', async () => {
    listDepartments.mockResolvedValue([{ id: 'd1', siteId: 's1', name: 'Maintenance' }])
    employeeDepartments.mockResolvedValue(['Maintenance'])

    expect(await mod.loadDepartments('acme', ['s1'])).toEqual(['Maintenance'])
  })

  it('still suggests from one source when the other is refused', async () => {
    // Neither lookup is worth failing a field that accepts free text anyway.
    listDepartments.mockRejectedValue(new Error('forbidden'))
    employeeDepartments.mockResolvedValue(['Warehouse'])
    expect(await mod.loadDepartments('acme', ['s1'])).toEqual(['Warehouse'])

    mod.forgetDepartments('acme')
    listDepartments.mockResolvedValue([{ id: 'd1', siteId: 's1', name: 'Maintenance' }])
    employeeDepartments.mockRejectedValue(new Error('forbidden'))
    expect(await mod.loadDepartments('acme', ['s1'])).toEqual(['Maintenance'])
  })

  it('returns nothing rather than throwing when both are refused', async () => {
    // A suggestion list that throws would take the whole dialog down with it.
    listDepartments.mockRejectedValue(new Error('nope'))
    employeeDepartments.mockRejectedValue(new Error('nope'))

    expect(await mod.loadDepartments('acme', ['s1'])).toEqual([])
  })

  it('fetches once however many fields ask', async () => {
    listDepartments.mockResolvedValue([{ id: 'd1', siteId: 's1', name: 'Maintenance' }])

    await Promise.all([
      mod.loadDepartments('acme', ['s1']),
      mod.loadDepartments('acme', ['s1']),
      mod.loadDepartments('acme', ['s1']),
    ])
    expect(listDepartments).toHaveBeenCalledTimes(1)
  })

  it('keeps workspaces apart', async () => {
    listDepartments.mockImplementation((siteIds: string[]) =>
      Promise.resolve([{ id: 'd', siteId: siteIds[0], name: siteIds[0] === 's1' ? 'Acme Dept' : 'Other Dept' }]))

    expect(await mod.loadDepartments('acme', ['s1'])).toEqual(['Acme Dept'])
    expect(await mod.loadDepartments('other', ['s9'])).toEqual(['Other Dept'])
  })

  it('offers a newly created department without a reload', async () => {
    listDepartments.mockResolvedValue([{ id: 'd1', siteId: 's1', name: 'Maintenance' }])
    await mod.loadDepartments('acme', ['s1'])

    mod.forgetDepartments('acme')
    listDepartments.mockResolvedValue([
      { id: 'd1', siteId: 's1', name: 'Maintenance' },
      { id: 'd2', siteId: 's1', name: 'Stores' },
    ])
    expect(await mod.loadDepartments('acme', ['s1'])).toEqual(['Maintenance', 'Stores'])
  })

  it('trims and drops blanks rather than offering an empty suggestion', async () => {
    listDepartments.mockResolvedValue([{ id: 'd1', siteId: 's1', name: '  Maintenance  ' }])
    employeeDepartments.mockResolvedValue(['', '   '])

    expect(await mod.loadDepartments('acme', ['s1'])).toEqual(['Maintenance'])
  })

  it('falls back to the fixtures when there is no API to ask', async () => {
    backendConfigured.mockReturnValue(false)

    expect(await mod.loadDepartments('demo', ['s1'])).toEqual(['Fixture Department'])
    expect(listDepartments).not.toHaveBeenCalled()
  })

  // ── The property that must not be lost ────────────────────────────────────

  it('answers an empty list for a workspace with no departments yet', async () => {
    /*
     * And that has to stay usable. Department is required on an incident, an asset and a
     * corrective action, so this list being empty must not stop the field being filled -
     * which is why the control is a datalist and not a select. A closed list here is a form
     * a new customer cannot submit on their first day.
     */
    expect(await mod.loadDepartments('brand-new', ['s1'])).toEqual([])
  })

  it('asks nothing at all without a workspace', async () => {
    expect(await mod.loadDepartments('', [])).toEqual([])
    expect(listDepartments).not.toHaveBeenCalled()
    expect(employeeDepartments).not.toHaveBeenCalled()
  })
})
