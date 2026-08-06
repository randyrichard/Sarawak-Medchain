import { drainRows } from './paging'
import { employeesApi } from './employeesApi'
import { contractorsApi } from './contractorsApi'

/** Somebody equipment can be issued to. Equipment is held by exactly one person. */
export interface EquipmentHolderOption {
  kind: 'employee' | 'contractor'
  id: string
  name: string
  reference: string
  detail: string
}

/**
 * Everyone equipment can be handed to, from both registers.
 *
 * Paged through with drainRows rather than asking for one large page: the list endpoints
 * cap pageSize at 100 and reject anything larger, which is a 400 that a picker component
 * has no sensible way to explain.
 *
 * Errors are not swallowed here. A silently empty picker reads as "nobody works here",
 * and the caller has to be able to say what actually went wrong.
 */
export async function listEquipmentHolders(companyId: string): Promise<EquipmentHolderOption[]> {
  const [employees, workers] = await Promise.all([
    drainRows((page, pageSize) => employeesApi.list(companyId, { page, pageSize })),
    drainRows((page, pageSize) => contractorsApi.listWorkers(companyId, { page, pageSize })),
  ])

  return [
    ...employees
      .filter((e) => e.active)
      .map((e): EquipmentHolderOption => ({
        kind: 'employee', id: e.id, name: e.name, reference: e.employeeNo,
        detail: [e.position, e.department].filter(Boolean).join(' · '),
      })),
    ...workers.map((w): EquipmentHolderOption => ({
      kind: 'contractor', id: w.id, name: w.name, reference: w.workerNo,
      detail: [w.contractorName, w.position].filter(Boolean).join(' · '),
    })),
  ].sort((a, b) => a.name.localeCompare(b.name))
}
