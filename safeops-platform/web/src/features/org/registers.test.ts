import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Job titles and contractor companies, offered the way departments already are.
 *
 * The case that shapes the position half is the 403. The curated register lives in
 * OrgConfigItem and only an administrator may read it, so the HSE manager filling in an
 * employee record is refused - and if that emptied the list, the picker would be missing
 * for exactly the people who fill this field most. The workforce they can already read is
 * the other half, and on a workspace that has never opened the register it is the only
 * half there is.
 *
 * On the deployment this was written against, the register held nothing at all and three
 * employees carried "Process Operator", "Op" and "Op" - which is both the argument for the
 * feature and the reason it cannot depend on the curated list alone.
 */
const listConfig = vi.fn()
const employeePositions = vi.fn()
const listCompanies = vi.fn()
const backendConfigured = vi.fn(() => true)

vi.mock('@/api/adminApi', () => ({ adminApi: { listConfig: (...a: unknown[]) => listConfig(...a) } }))
vi.mock('@/api/employeesApi', () => ({
  employeesApi: { positions: (...a: unknown[]) => employeePositions(...a) },
}))
vi.mock('@/api/contractorsApi', () => ({
  contractorsApi: { listCompanies: (...a: unknown[]) => listCompanies(...a) },
}))
vi.mock('@/api/authApi', () => ({ isBackendConfigured: () => backendConfigured() }))
vi.mock('@/features/org/OrgContext', () => ({ useOrg: () => ({ company: null }) }))

let mod: typeof import('./registers')

beforeEach(async () => {
  vi.resetModules()
  listConfig.mockReset()
  employeePositions.mockReset()
  listCompanies.mockReset()
  backendConfigured.mockReset()
  backendConfigured.mockReturnValue(true)
  listConfig.mockResolvedValue([])
  employeePositions.mockResolvedValue([])
  listCompanies.mockResolvedValue([])
  mod = await import('./registers')
})

describe('loadPositions', () => {
  it('combines the curated register with the titles already in use', async () => {
    listConfig.mockResolvedValue([{ id: 'p1', title: 'Process Operator', department: '', headcount: 0 }])
    employeePositions.mockResolvedValue(['Op', 'Technician'])

    expect(await mod.loadPositions('acme')).toEqual(['Op', 'Process Operator', 'Technician'])
  })

  it('still offers the titles in use when the register is refused', async () => {
    /*
     * The 403 an HSE manager gets. Emptying the list here would take the picker away from
     * the people who fill this field most, over a permission on a list they never needed.
     */
    listConfig.mockRejectedValue(Object.assign(new Error('forbidden'), { code: 'forbidden' }))
    employeePositions.mockResolvedValue(['Process Operator', 'Op'])

    expect(await mod.loadPositions('acme')).toEqual(['Op', 'Process Operator'])
  })

  it('still offers the register when the workforce read fails', async () => {
    listConfig.mockResolvedValue([{ id: 'p1', title: 'Process Operator', department: '', headcount: 0 }])
    employeePositions.mockRejectedValue(new Error('nope'))

    expect(await mod.loadPositions('acme')).toEqual(['Process Operator'])
  })

  it('returns nothing rather than throwing when both fail', async () => {
    // A suggestion list that throws takes the dialog with it, and the field still works
    // as free text with no suggestions at all.
    listConfig.mockRejectedValue(new Error('nope'))
    employeePositions.mockRejectedValue(new Error('nope'))

    expect(await mod.loadPositions('acme')).toEqual([])
  })

  it('does not list the same title twice, or a blank one', async () => {
    listConfig.mockResolvedValue([{ id: 'p1', title: 'Technician', department: '', headcount: 0 }])
    employeePositions.mockResolvedValue(['  Technician  ', '', '   '])

    expect(await mod.loadPositions('acme')).toEqual(['Technician'])
  })

  it('fetches once per workspace and keeps workspaces apart', async () => {
    employeePositions.mockImplementation((companyId: string) =>
      Promise.resolve([companyId === 'acme' ? 'Acme Title' : 'Other Title']))

    await Promise.all([mod.loadPositions('acme'), mod.loadPositions('acme')])
    expect(employeePositions).toHaveBeenCalledTimes(1)
    expect(await mod.loadPositions('other')).toEqual(['Other Title'])
  })

  it('offers a newly added position without a reload', async () => {
    employeePositions.mockResolvedValue(['Technician'])
    await mod.loadPositions('acme')

    mod.forgetPositions('acme')
    listConfig.mockResolvedValue([{ id: 'p1', title: 'Rigger', department: '', headcount: 0 }])
    expect(await mod.loadPositions('acme')).toEqual(['Rigger', 'Technician'])
  })

  it('does not remember a failure', async () => {
    listConfig.mockRejectedValue(new Error('x'))
    employeePositions.mockRejectedValue(new Error('x'))
    expect(await mod.loadPositions('acme')).toEqual([])

    mod.forgetPositions('acme')
    employeePositions.mockResolvedValue(['Technician'])
    expect(await mod.loadPositions('acme')).toEqual(['Technician'])
  })
})

describe('loadContractorCompanies', () => {
  it('offers the contractors on the register', async () => {
    listCompanies.mockResolvedValue([
      { id: 'c1', name: 'Kenyalang Fabrication' },
      { id: 'c2', name: 'Borneo Scaffold' },
    ])

    expect(await mod.loadContractorCompanies('acme')).toEqual(['Borneo Scaffold', 'Kenyalang Fabrication'])
  })

  it('asks only for the ones still working there', async () => {
    // Suggesting a suspended contractor on a permit is suggesting a compliance breach.
    listCompanies.mockResolvedValue([])
    await mod.loadContractorCompanies('acme')
    expect(listCompanies.mock.calls[0][1]).toMatchObject({ status: 'active' })
  })

  it('is empty rather than broken when the register cannot be read', async () => {
    listCompanies.mockRejectedValue(new Error('nope'))
    expect(await mod.loadContractorCompanies('acme')).toEqual([])
  })

  it('offers a newly added contractor without a reload', async () => {
    listCompanies.mockResolvedValue([{ id: 'c1', name: 'Borneo Scaffold' }])
    await mod.loadContractorCompanies('acme')

    mod.forgetContractorCompanies('acme')
    listCompanies.mockResolvedValue([
      { id: 'c1', name: 'Borneo Scaffold' },
      { id: 'c2', name: 'Miri Welding' },
    ])
    expect(await mod.loadContractorCompanies('acme')).toEqual(['Borneo Scaffold', 'Miri Welding'])
  })
})

describe('both registers', () => {
  it('ask nothing without a workspace', async () => {
    expect(await mod.loadPositions('')).toEqual([])
    expect(await mod.loadContractorCompanies('')).toEqual([])
    expect(listConfig).not.toHaveBeenCalled()
    expect(listCompanies).not.toHaveBeenCalled()
  })

  it('ask nothing when there is no API', async () => {
    // The credential-free demo, which has no server to answer either of these.
    backendConfigured.mockReturnValue(false)
    expect(await mod.loadPositions('acme')).toEqual([])
    expect(await mod.loadContractorCompanies('acme')).toEqual([])
    expect(listConfig).not.toHaveBeenCalled()
  })
})
