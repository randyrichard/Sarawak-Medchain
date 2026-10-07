import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Where the people-pickers get their names.
 *
 * The bug this replaces: every picker in the product read `@/api/mock/fixtures`, and those
 * fixtures are compiled out of a production build. On a real deployment the lists were
 * empty, and because Owner is a required field, a corrective action could not be created
 * at all - fourteen components affected, and all of them fine in development, which is
 * precisely why nobody caught it.
 *
 * So the test that matters most is the first one: with the backend configured, the names
 * come from the API and not from the fixtures. The rest guard the ways this can go quietly
 * wrong again - a picker that stops at page one, a 403 that empties the list, four
 * components issuing four identical requests.
 */
const employeesList = vi.fn()
const recipients = vi.fn()
const backendConfigured = vi.fn(() => true)

vi.mock('@/api/employeesApi', () => ({
  employeesApi: { list: (...a: unknown[]) => employeesList(...a) },
}))
vi.mock('@/api/reportsApi', () => ({
  reportsApi: { recipients: (...a: unknown[]) => recipients(...a) },
}))
vi.mock('@/api/authApi', () => ({
  isBackendConfigured: () => backendConfigured(),
}))
vi.mock('@/api/mock/fixtures', () => ({
  // Stands in for the demo data, and is deliberately nothing like the API's answer so the
  // two can never be confused for one another in an assertion.
  EMPLOYEES: [{ companyId: 'demo', name: 'Fixture Person' }],
  USERS: [{ name: 'Fixture User', memberships: [{ companyId: 'demo' }] }],
}))

const page = (rows: { name: string }[], total = rows.length) => ({
  rows, total, page: 1, pageSize: 100,
})

let people: typeof import('./people')

beforeEach(async () => {
  vi.resetModules()
  employeesList.mockReset()
  recipients.mockReset()
  backendConfigured.mockReset()
  backendConfigured.mockReturnValue(true)
  recipients.mockResolvedValue([])
  // Re-imported per test so the module-level cache starts empty.
  people = await import('./people')
})

afterEach(() => vi.restoreAllMocks())

describe('loadPeople', () => {
  it('reads the workforce register, not the demo fixtures', async () => {
    // The whole bug, in one assertion.
    employeesList.mockResolvedValue(page([{ name: 'Zulkifli Hassan' }, { name: 'Aina Rahman' }]))

    const names = await people.loadPeople('acme')
    expect(names).toEqual(['Aina Rahman', 'Zulkifli Hassan'])
    expect(names).not.toContain('Fixture Person')
    expect(employeesList).toHaveBeenCalled()
  })

  it('asks only for people who still work there', async () => {
    // Assigning a corrective action to somebody who left is a due date nobody meets.
    employeesList.mockResolvedValue(page([{ name: 'A' }]))
    await people.loadPeople('acme')
    expect(employeesList.mock.calls[0][1]).toMatchObject({ status: 'active' })
  })

  it('includes members who hold a login but no register row', async () => {
    // The HSE manager owns actions and is frequently not in the workforce register.
    employeesList.mockResolvedValue(page([{ name: 'Site Engineer' }]))
    recipients.mockResolvedValue([{ userId: 'u1', name: 'HSE Manager', email: 'h@a.test' }])

    expect(await people.loadPeople('acme')).toEqual(['HSE Manager', 'Site Engineer'])
  })

  it('does not list the same person twice when they are both', async () => {
    employeesList.mockResolvedValue(page([{ name: 'Aina Rahman' }]))
    recipients.mockResolvedValue([{ userId: 'u1', name: 'Aina Rahman', email: 'a@a.test' }])

    expect(await people.loadPeople('acme')).toEqual(['Aina Rahman'])
  })

  it('does not ask for the member list for a role the server will refuse', async () => {
    employeesList.mockResolvedValue(page([{ name: 'Site Engineer' }]))
    expect(await people.loadPeople('acme', 'supervisor')).toEqual(['Site Engineer'])
    expect(await people.loadPeople('acme', 'employee')).toEqual(['Site Engineer'])
    expect(recipients).not.toHaveBeenCalled()
    // A manager on the same browser still gets members, not the register-only answer.
    recipients.mockResolvedValue([{ userId: 'u1', name: 'HSE Manager', email: 'h@a.test' }])
    expect(await people.loadPeople('acme', 'hse_manager')).toEqual(['HSE Manager', 'Site Engineer'])
  })

  it('still offers the register when the member list is refused', async () => {
    /*
     * The members endpoint is role-guarded, so a supervisor opening an action drawer gets
     * a 403. That is not a failure of the picker and must not empty it - which would take
     * the feature away from exactly the people most likely to be assigning work.
     */
    employeesList.mockResolvedValue(page([{ name: 'Site Engineer' }]))
    recipients.mockRejectedValue(Object.assign(new Error('forbidden'), { code: 'forbidden' }))

    expect(await people.loadPeople('acme')).toEqual(['Site Engineer'])
  })

  it('walks past the first page rather than stopping at twenty-five names', async () => {
    /*
     * A picker that silently truncates is worse than an empty one: the name somebody is
     * looking for is missing and nothing says so. The register is the one list that grows
     * with headcount rather than with activity.
     */
    employeesList
      .mockResolvedValueOnce({ rows: [{ name: 'A' }], total: 2, page: 1, pageSize: 1 })
      .mockResolvedValueOnce({ rows: [{ name: 'B' }], total: 2, page: 2, pageSize: 1 })

    const names = await people.loadPeople('acme')
    expect(names).toEqual(['A', 'B'])
    expect(employeesList).toHaveBeenCalledTimes(2)
  })

  it('fetches once for a workspace however many pickers ask', async () => {
    // The actions page, its table, a drawer and a dialog can all be mounted at once.
    employeesList.mockResolvedValue(page([{ name: 'A' }]))

    const [a, b, c] = await Promise.all([
      people.loadPeople('acme'), people.loadPeople('acme'), people.loadPeople('acme'),
    ])
    expect(employeesList).toHaveBeenCalledTimes(1)
    expect(a).toEqual(b)
    expect(b).toEqual(c)

    // And a later ask is served from what is already known.
    expect(await people.loadPeople('acme')).toEqual(['A'])
    expect(employeesList).toHaveBeenCalledTimes(1)
  })

  it('keeps workspaces apart', async () => {
    /*
     * The bug before this one: one dropdown offered another tenant's staff. A shared cache
     * is exactly how that comes back, so it is keyed by workspace.
     */
    employeesList.mockImplementation((companyId: string) =>
      Promise.resolve(page([{ name: companyId === 'acme' ? 'Acme Person' : 'Other Person' }])))

    expect(await people.loadPeople('acme')).toEqual(['Acme Person'])
    expect(await people.loadPeople('other')).toEqual(['Other Person'])
  })

  it('does not remember a failure', async () => {
    // A picker that failed once because the network blinked must work on the next visit,
    // not stay empty for the rest of the session.
    employeesList.mockRejectedValueOnce(new Error('network'))
    await expect(people.loadPeople('acme')).rejects.toThrow()

    employeesList.mockResolvedValue(page([{ name: 'A' }]))
    expect(await people.loadPeople('acme')).toEqual(['A'])
  })

  it('forgets a workspace when somebody is hired', async () => {
    employeesList.mockResolvedValue(page([{ name: 'A' }]))
    await people.loadPeople('acme')

    people.forgetPeople('acme')
    employeesList.mockResolvedValue(page([{ name: 'A' }, { name: 'New Hire' }]))

    expect(await people.loadPeople('acme')).toEqual(['A', 'New Hire'])
  })

  it('asks nothing at all without a workspace', async () => {
    // The shell renders these before a company is chosen.
    expect(await people.loadPeople('')).toEqual([])
    expect(employeesList).not.toHaveBeenCalled()
  })

  it('falls back to the fixtures when there is no API to ask', async () => {
    // The credential-free demo. It has no backend, and it worked before this change.
    backendConfigured.mockReturnValue(false)

    expect(await people.loadPeople('demo')).toEqual(['Fixture Person', 'Fixture User'])
    expect(employeesList).not.toHaveBeenCalled()
  })

  it('drops a blank name rather than offering an empty option', async () => {
    employeesList.mockResolvedValue(page([{ name: '  ' }, { name: 'Real Person' }]))
    expect(await people.loadPeople('acme')).toEqual(['Real Person'])
  })
})
