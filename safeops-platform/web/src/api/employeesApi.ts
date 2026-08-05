import { request, qs } from './http'
import type {
  EmergencyContact, EmployeeDetail, EmployeeFilters, EmployeePatch, EmployeeRow,
  EmployeeStats, NewContactInput, NewEmployeeInput, NewPpeInput, PpeIssue,
} from './employees'

/**
 * The workforce register.
 *
 * Filtering, sorting and paging are all server-side: the register is the one list that
 * grows with headcount rather than with activity, so a tenant with four thousand people
 * must never have four thousand rows shipped to the browser to sort them by name.
 */
export const employeesApi = {
  list(companyId: string, f: EmployeeFilters = {}): Promise<{ rows: EmployeeRow[]; total: number; page: number; pageSize: number }> {
    return request(`/employees?${qs({
      companyId,
      page: f.page ?? 1,
      pageSize: f.pageSize ?? 25,
      q: f.q,
      siteId: f.siteId,
      department: f.department,
      status: f.status,
      medical: f.medical && f.medical !== 'all' ? f.medical : undefined,
      sort: f.sort,
      dir: f.dir,
    })}`)
  },

  stats(companyId: string): Promise<EmployeeStats> {
    return request(`/employees/stats?${qs({ companyId })}`)
  },

  departments(companyId: string): Promise<string[]> {
    return request<{ departments: string[] }>(`/employees/departments?${qs({ companyId })}`)
      .then((r) => r.departments)
  },

  get(id: string): Promise<EmployeeDetail> {
    return request(`/employees/${id}`)
  },

  create(companyId: string, input: NewEmployeeInput): Promise<EmployeeRow> {
    return request('/employees', { method: 'POST', body: JSON.stringify({ companyId, ...input }) })
  },

  update(id: string, patch: EmployeePatch): Promise<EmployeeRow> {
    return request(`/employees/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
  },

  setActive(id: string, active: boolean): Promise<EmployeeRow> {
    return request(`/employees/${id}/status`, { method: 'POST', body: JSON.stringify({ active }) })
  },

  /** Only permitted for a record with no history — the server refuses the rest. */
  remove(id: string): Promise<void> {
    return request(`/employees/${id}`, { method: 'DELETE' })
  },

  addContact(employeeId: string, input: NewContactInput): Promise<EmergencyContact> {
    return request(`/employees/${employeeId}/contacts`, { method: 'POST', body: JSON.stringify(input) })
  },

  removeContact(contactId: string): Promise<void> {
    return request(`/employees/contacts/${contactId}`, { method: 'DELETE' })
  },

  issuePpe(employeeId: string, input: NewPpeInput): Promise<PpeIssue> {
    return request(`/employees/${employeeId}/ppe`, { method: 'POST', body: JSON.stringify(input) })
  },

  returnPpe(issueId: string): Promise<PpeIssue> {
    return request(`/employees/ppe/${issueId}/return`, { method: 'POST', body: JSON.stringify({}) })
  },
}
