import { request, qs } from './http'
import type {
  ContractorCertificate, ContractorCompanyRow, ContractorPatch, ContractorSort,
  ContractorStats, ContractorWorkerDetail, ContractorWorkerRow, ComplianceFilter,
  NewCompetencyInput, NewContractorInput, NewWorkerInput, WorkerFilters, WorkerPatch,
} from './contractors'

/**
 * Contractors and their workers.
 *
 * The worker list is filtered, sorted and paged server-side: a shutdown can put several
 * hundred contractor workers on one site, and none of that belongs in the browser.
 */
export const contractorsApi = {
  listCompanies(companyId: string, opts: {
    q?: string
    status?: 'active' | 'suspended' | 'all'
    insurance?: ComplianceFilter
    sort?: ContractorSort
    dir?: 'asc' | 'desc'
  } = {}): Promise<ContractorCompanyRow[]> {
    return request<{ rows: ContractorCompanyRow[] }>(`/contractors?${qs({
      companyId,
      q: opts.q,
      status: opts.status,
      insurance: opts.insurance && opts.insurance !== 'all' ? opts.insurance : undefined,
      sort: opts.sort,
      dir: opts.dir,
    })}`).then((r) => r.rows)
  },

  getCompany(id: string): Promise<ContractorCompanyRow> {
    return request(`/contractors/${id}`)
  },

  createCompany(companyId: string, input: NewContractorInput): Promise<ContractorCompanyRow> {
    return request('/contractors', { method: 'POST', body: JSON.stringify({ companyId, ...input }) })
  },

  updateCompany(id: string, patch: ContractorPatch): Promise<ContractorCompanyRow> {
    return request(`/contractors/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
  },

  /** Only permitted for a firm with no workers — the server refuses the rest. */
  removeCompany(id: string): Promise<void> {
    return request(`/contractors/${id}`, { method: 'DELETE' })
  },

  stats(companyId: string): Promise<ContractorStats> {
    return request(`/contractors/stats?${qs({ companyId })}`)
  },

  listWorkers(companyId: string, f: WorkerFilters = {}): Promise<{
    rows: ContractorWorkerRow[]; total: number; page: number; pageSize: number
  }> {
    return request(`/contractors/workers?${qs({
      companyId,
      page: f.page ?? 1,
      pageSize: f.pageSize ?? 25,
      q: f.q,
      siteId: f.siteId,
      contractorCompanyId: f.contractorCompanyId,
      status: f.status,
      medical: f.medical && f.medical !== 'all' ? f.medical : undefined,
      induction: f.induction && f.induction !== 'all' ? f.induction : undefined,
      onSite: f.onSite === undefined ? undefined : String(f.onSite),
      sort: f.sort,
      dir: f.dir,
    })}`)
  },

  getWorker(id: string): Promise<ContractorWorkerDetail> {
    return request(`/contractors/workers/${id}`)
  },

  createWorker(companyId: string, input: NewWorkerInput): Promise<ContractorWorkerRow> {
    return request('/contractors/workers', { method: 'POST', body: JSON.stringify({ companyId, ...input }) })
  },

  updateWorker(id: string, patch: WorkerPatch): Promise<ContractorWorkerRow> {
    return request(`/contractors/workers/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
  },

  setWorkerActive(id: string, active: boolean): Promise<ContractorWorkerRow> {
    return request(`/contractors/workers/${id}/status`, { method: 'POST', body: JSON.stringify({ active }) })
  },

  removeWorker(id: string): Promise<void> {
    return request(`/contractors/workers/${id}`, { method: 'DELETE' })
  },

  /** Refused by the server when the worker is not cleared — that is the point of it. */
  checkIn(id: string): Promise<ContractorWorkerRow> {
    return request(`/contractors/workers/${id}/check-in`, { method: 'POST', body: JSON.stringify({}) })
  },

  checkOut(id: string): Promise<ContractorWorkerRow> {
    return request(`/contractors/workers/${id}/check-out`, { method: 'POST', body: JSON.stringify({}) })
  },

  addCompetency(workerId: string, input: NewCompetencyInput): Promise<ContractorCertificate> {
    return request(`/contractors/workers/${workerId}/certificates`, {
      method: 'POST', body: JSON.stringify(input),
    })
  },

  removeCompetency(certificateId: string): Promise<void> {
    return request(`/contractors/certificates/${certificateId}`, { method: 'DELETE' })
  },
}
