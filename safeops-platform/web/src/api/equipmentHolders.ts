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
 * What came back, and what did not.
 *
 * Returned as a pair so a caller can offer what it has while saying what is missing. The
 * shape exists because the previous one could not express "three employees, and the
 * contractor register is unreachable" - it was a bare array, so that state had to be
 * either a rejection or a lie.
 */
export interface HolderList {
  people: EquipmentHolderOption[]
  /**
   * Registers that could not be read, already phrased for a person to read.
   *
   * Never empty *and* ignored: a caller that drops this is back to a silently empty picker,
   * which is the failure this module has now produced twice.
   */
  unavailable: string[]
}

/**
 * Everyone equipment can be handed to, from both registers.
 *
 * Paged through with drainRows rather than asking for one large page: the list endpoints
 * cap pageSize at 100 and reject anything larger, which is a 400 that a picker component
 * has no sensible way to explain.
 *
 * The two registers are read independently. They used to share a Promise.all, which is
 * all-or-nothing: one unreadable register discarded the other's rows even though they had
 * arrived intact, so a workspace with three employees and an unreachable contractor list
 * saw an empty picker telling it to go and add people. Nothing about a contractor register
 * should be able to hide the workforce.
 *
 * Errors are still not swallowed. What changed is that a failure now costs only its own
 * half, and is reported rather than rendered as emptiness - those are different things,
 * and collapsing them is what produced "Add people under Employees or Contractors to pick
 * them here" on a workspace that had both.
 */
export async function listEquipmentHolders(companyId: string): Promise<HolderList> {
  const [employees, workers] = await Promise.allSettled([
    drainRows((page, pageSize) => employeesApi.list(companyId, { page, pageSize })),
    drainRows((page, pageSize) => contractorsApi.listWorkers(companyId, { page, pageSize })),
  ])

  const people: EquipmentHolderOption[] = []
  const unavailable: string[] = []

  if (employees.status === 'fulfilled') {
    people.push(...employees.value
      .filter((e) => e.active)
      .map((e): EquipmentHolderOption => ({
        kind: 'employee', id: e.id, name: e.name, reference: e.employeeNo,
        detail: [e.position, e.department].filter(Boolean).join(' · '),
      })))
  } else {
    unavailable.push('The workforce register could not be loaded, so employees are not listed.')
  }

  if (workers.status === 'fulfilled') {
    people.push(...workers.value.map((w): EquipmentHolderOption => ({
      kind: 'contractor', id: w.id, name: w.name, reference: w.workerNo,
      detail: [w.contractorName, w.position].filter(Boolean).join(' · '),
    })))
  } else {
    unavailable.push('The contractor register could not be loaded, so contractor workers are not listed.')
  }

  return { people: people.sort((a, b) => a.name.localeCompare(b.name)), unavailable }
}
