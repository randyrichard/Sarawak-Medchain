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

    const people = await holders.listEquipmentHolders('sarawak-pilot-energy-sdn-bhd')
    expect(people.map((p) => p.name)).toEqual(['Probe admin', 'Probe hse_manager', 'Rosli bin Ahmad'])
    expect(people.every((p) => p.kind === 'employee')).toBe(true)
  })

  it('leaves out somebody who has left', async () => {
    employeesList.mockResolvedValue({
      rows: [...REAL_EMPLOYEES, { id: 'x', name: 'Left Last Year', employeeNo: 'EMP-9', active: false }],
      total: 4, page: 1, pageSize: 100,
    })
    listWorkers.mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 100 })

    const people = await holders.listEquipmentHolders('acme')
    expect(people.map((p) => p.name)).not.toContain('Left Last Year')
  })

  it('rejects rather than returning an empty list when a register cannot be read', async () => {
    /*
     * The behaviour the module's own comment promises: a silently empty picker reads as
     * "nobody works here", so the failure has to reach the caller. This is asserted because
     * NewAssetDialog was swallowing it - `.catch(() => setHolders([]))` - which turned every
     * transport failure into exactly the misleading empty list this was written to avoid.
     */
    employeesList.mockResolvedValue({ rows: REAL_EMPLOYEES, total: 3, page: 1, pageSize: 100 })
    listWorkers.mockRejectedValue(new Error('contractors unavailable'))

    await expect(holders.listEquipmentHolders('acme')).rejects.toThrow(/contractors/)
  })

  it('rejects when the workforce register cannot be read', async () => {
    employeesList.mockRejectedValue(new Error('employees unavailable'))
    listWorkers.mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 100 })

    await expect(holders.listEquipmentHolders('acme')).rejects.toThrow(/employees/)
  })

  it('walks past the first page of a large workforce', async () => {
    // The endpoints cap pageSize at 100, so a fourth site's worth of people needs paging.
    employeesList
      .mockResolvedValueOnce({ rows: [{ id: '1', name: 'A', employeeNo: 'E1', active: true }], total: 2, page: 1, pageSize: 1 })
      .mockResolvedValueOnce({ rows: [{ id: '2', name: 'B', employeeNo: 'E2', active: true }], total: 2, page: 2, pageSize: 1 })
    listWorkers.mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 100 })

    expect((await holders.listEquipmentHolders('acme')).map((p) => p.name)).toEqual(['A', 'B'])
  })

  it('lists contractor workers alongside employees', async () => {
    employeesList.mockResolvedValue({ rows: [{ id: 'e1', name: 'Employee', employeeNo: 'E1', active: true }], total: 1, page: 1, pageSize: 100 })
    listWorkers.mockResolvedValue({
      rows: [{ id: 'w1', name: 'Contract Welder', workerNo: 'CW-1', contractorName: 'Acme Fabrication', position: 'Welder' }],
      total: 1, page: 1, pageSize: 100,
    })

    const people = await holders.listEquipmentHolders('acme')
    expect(people.map((p) => `${p.kind}:${p.name}`))
      .toEqual(['contractor:Contract Welder', 'employee:Employee'])
  })
})
