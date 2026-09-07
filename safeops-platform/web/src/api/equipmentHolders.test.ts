import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Who equipment can be issued to.
 *
 * Written while chasing a live report of "Assign to" offering nothing on a workspace that
 * demonstrably has three active employees. The point of these is to pin down whether the
 * empty list is this function's doing or something outside it, so the cases mirror the
 * real data rather than convenient fixtures.
 */
const employeesList = vi.fn()
const listWorkers = vi.fn()

vi.mock('./employeesApi', () => ({ employeesApi: { list: (...a: unknown[]) => employeesList(...a) } }))
vi.mock('./contractorsApi', () => ({ contractorsApi: { listWorkers: (...a: unknown[]) => listWorkers(...a) } }))

let holders: typeof import('./equipmentHolders')

/** Exactly what the API returns for Sarawak Pilot Energy today. */
const REAL_EMPLOYEES = [
  { id: 'cmt78f6dw003f4vb1t66lrqfk', name: 'Rosli bin Ahmad', employeeNo: 'EMP-1001', position: 'Technician', department: 'Maintenance', active: true },
  { id: 'cmt78fy23004k4vb1ci3jvieu', name: 'Probe admin', employeeNo: 'EMP-1002', position: '', department: '', active: true },
  { id: 'cmt78g1dx005b4vb1r0k1oh0e', name: 'Probe hse_manager', employeeNo: 'EMP-1003', position: '', department: '', active: true },
]

beforeEach(async () => {
  vi.resetModules()
  employeesList.mockReset()
  listWorkers.mockReset()
  holders = await import('./equipmentHolders')
})

describe('listEquipmentHolders', () => {
  it('offers the three active employees, with no contractor workers on file', async () => {
    // The reported case, reproduced exactly: three employees, zero workers.
    employeesList.mockResolvedValue({ rows: REAL_EMPLOYEES, total: 3, page: 1, pageSize: 100 })
    listWorkers.mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 100 })

    const { people, unavailable } = await holders.listEquipmentHolders('sarawak-pilot-energy-sdn-bhd')
    expect(people.map((p) => p.name)).toEqual(['Probe admin', 'Probe hse_manager', 'Rosli bin Ahmad'])
    expect(people.every((p) => p.kind === 'employee')).toBe(true)
    expect(unavailable).toEqual([])
  })

  it('leaves out somebody who has left', async () => {
    employeesList.mockResolvedValue({
      rows: [...REAL_EMPLOYEES, { id: 'x', name: 'Left Last Year', employeeNo: 'EMP-9', active: false }],
      total: 4, page: 1, pageSize: 100,
    })
    listWorkers.mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 100 })

    const { people } = await holders.listEquipmentHolders('acme')
    expect(people.map((p) => p.name)).not.toContain('Left Last Year')
  })

  it('still offers the employees when the contractor register cannot be read', async () => {
    /*
     * The two registers used to share a Promise.all, which is all-or-nothing: this exact
     * case discarded three perfectly good employees and left a picker telling the customer
     * to go and add people they already had. Nothing about the contractor register should
     * be able to hide the workforce.
     */
    employeesList.mockResolvedValue({ rows: REAL_EMPLOYEES, total: 3, page: 1, pageSize: 100 })
    listWorkers.mockRejectedValue(new Error('contractors unavailable'))

    const { people, unavailable } = await holders.listEquipmentHolders('acme')
    expect(people).toHaveLength(3)
    // Reported, not swallowed. Losing half the list quietly is the other failure mode.
    expect(unavailable).toHaveLength(1)
    expect(unavailable[0]).toMatch(/contractor/i)
  })

  it('still offers the contractors when the workforce register cannot be read', async () => {
    employeesList.mockRejectedValue(new Error('employees unavailable'))
    listWorkers.mockResolvedValue({
      rows: [{ id: 'w1', name: 'Contract Welder', workerNo: 'CW-1', contractorName: 'Acme', position: 'Welder' }],
      total: 1, page: 1, pageSize: 100,
    })

    const { people, unavailable } = await holders.listEquipmentHolders('acme')
    expect(people.map((p) => p.name)).toEqual(['Contract Welder'])
    expect(unavailable[0]).toMatch(/workforce/i)
  })

  it('reports both when neither register can be read', async () => {
    // Empty, and says why twice - rather than an empty list that reads as "nobody works
    // here", which is a claim about the customer's data and not about the request.
    employeesList.mockRejectedValue(new Error('down'))
    listWorkers.mockRejectedValue(new Error('down'))

    const { people, unavailable } = await holders.listEquipmentHolders('acme')
    expect(people).toEqual([])
    expect(unavailable).toHaveLength(2)
  })

  it('walks past the first page of a large workforce', async () => {
    // The endpoints cap pageSize at 100, so a fourth site's worth of people needs paging.
    employeesList
      .mockResolvedValueOnce({ rows: [{ id: '1', name: 'A', employeeNo: 'E1', active: true }], total: 2, page: 1, pageSize: 1 })
      .mockResolvedValueOnce({ rows: [{ id: '2', name: 'B', employeeNo: 'E2', active: true }], total: 2, page: 2, pageSize: 1 })
    listWorkers.mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 100 })

    expect((await holders.listEquipmentHolders('acme')).people.map((p) => p.name)).toEqual(['A', 'B'])
  })

  it('lists contractor workers alongside employees', async () => {
    employeesList.mockResolvedValue({ rows: [{ id: 'e1', name: 'Employee', employeeNo: 'E1', active: true }], total: 1, page: 1, pageSize: 100 })
    listWorkers.mockResolvedValue({
      rows: [{ id: 'w1', name: 'Contract Welder', workerNo: 'CW-1', contractorName: 'Acme Fabrication', position: 'Welder' }],
      total: 1, page: 1, pageSize: 100,
    })

    const { people } = await holders.listEquipmentHolders('acme')
    expect(people.map((p) => `${p.kind}:${p.name}`))
      .toEqual(['contractor:Contract Welder', 'employee:Employee'])
  })
})
