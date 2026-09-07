import { useEffect, useState } from 'react'
import { adminApi } from '@/api/adminApi'
import { employeesApi } from '@/api/employeesApi'
import { contractorsApi } from '@/api/contractorsApi'
import { isBackendConfigured } from '@/api/authApi'
import type { JobPosition } from '@/api/admin'
import { useOrg } from '@/features/org/OrgContext'

/**
 * The other lists a workspace keeps, offered the same way departments are.
 *
 * Job titles and contractor companies, both of which the product already stores and
 * neither of which any form suggested - so "Process Operator", "Op" and "op" accumulate
 * side by side on a register whose whole purpose is to be counted.
 *
 * The shape is deliberately identical to departments.ts: a module-level cache keyed by
 * workspace, in-flight de-duplication so several fields on one screen make one request,
 * failures not cached, and an explicit forget for when the register changes. Two copies of
 * this pattern is the point at which a third would be written by copying whichever was
 * nearest, so this is where they live together.
 */

interface Register {
  cache: Map<string, string[]>
  inFlight: Map<string, Promise<string[]>>
}

const positions: Register = { cache: new Map(), inFlight: new Map() }
const contractors: Register = { cache: new Map(), inFlight: new Map() }

function through(reg: Register, key: string, fetch: () => Promise<string[]>): Promise<string[]> {
  if (!key) return Promise.resolve([])
  if (!isBackendConfigured()) return Promise.resolve([])

  const known = reg.cache.get(key)
  if (known) return Promise.resolve(known)

  const pending = reg.inFlight.get(key)
  if (pending) return pending

  const request = fetch()
    .then((names) => {
      const clean = [...new Set(names.map((n) => n.trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b))
      reg.cache.set(key, clean)
      return clean
    })
    .finally(() => reg.inFlight.delete(key))

  reg.inFlight.set(key, request)
  return request
}

/**
 * Job titles: the curated register, plus the ones already in use.
 *
 * The curated half lives in OrgConfigItem and is readable by administrators only, so the
 * HSE manager filling in an employee record is refused it - a 403 that must not empty the
 * list, because the second half is theirs to see and is drawn from the workforce they can
 * already read. On a workspace that has never opened the register, which is most of them,
 * the second half is the only source there is.
 */
export function loadPositions(companyId: string): Promise<string[]> {
  return through(positions, companyId, async () => {
    const [curated, inUse] = await Promise.all([
      adminApi.listConfig<JobPosition>(companyId, 'position').catch(() => []),
      employeesApi.positions(companyId).catch(() => []),
    ])
    return [...curated.map((p) => p.title), ...inUse]
  })
}

/** Contractor companies, from the register the Contractors screen maintains. */
export function loadContractorCompanies(companyId: string): Promise<string[]> {
  return through(contractors, companyId, async () => {
    const rows = await contractorsApi.listCompanies(companyId, { status: 'active' }).catch(() => [])
    return rows.map((c) => c.name)
  })
}

export function forgetPositions(companyId?: string) {
  if (companyId) positions.cache.delete(companyId)
  else positions.cache.clear()
}

export function forgetContractorCompanies(companyId?: string) {
  if (companyId) contractors.cache.delete(companyId)
  else contractors.cache.clear()
}

function useRegister(load: (companyId: string) => Promise<string[]>): string[] {
  const companyId = useOrg().company?.id ?? ''
  const [values, setValues] = useState<string[]>([])

  useEffect(() => {
    let live = true
    void load(companyId)
      .then((names) => { if (live) setValues(names) })
      .catch(() => { if (live) setValues([]) })
    return () => { live = false }
  }, [companyId, load])

  return values
}

export const usePositions = () => useRegister(loadPositions)
export const useContractorCompanies = () => useRegister(loadContractorCompanies)
