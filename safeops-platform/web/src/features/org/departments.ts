import { useEffect, useState } from 'react'
import { orgApi } from '@/api/orgApi'
import { employeesApi } from '@/api/employeesApi'
import { isBackendConfigured } from '@/api/authApi'
import { DEPARTMENTS, SITES } from '@/api/mock/fixtures'
import { useOrg } from '@/features/org/OrgContext'

/**
 * The departments this workspace actually has.
 *
 * Six dialogs asked for a department as free text with a placeholder of "e.g. Warehouse" -
 * incidents, assets, actions, permits, audits and the employee form. A workspace that has
 * created Maintenance and Safety under its site got no help from any of them, so the same
 * department arrives spelled three ways and every filter and grouping quietly splits.
 *
 * Two sources, because they answer different questions:
 *
 *   - The organisation tree, which is what an administrator created under Organization.
 *     This is the structure the product means by a department.
 *   - The distinct values already on employee records, because a workspace that has been
 *     typing them in has real departments that were never added to the tree, and hiding
 *     them would make the suggestions disagree with the register beside them.
 *
 * Offered across the whole workspace rather than filtered to the chosen site. Departments
 * do belong to sites, but these are suggestions in a field that still accepts anything,
 * and a list that is occasionally too generous is much cheaper than one that is empty
 * because the site was picked after the department.
 */

const cache = new Map<string, string[]>()
const inFlight = new Map<string, Promise<string[]>>()

/** The demo's answer, which is the whole answer when there is no API to ask. */
function fixtureDepartments(companyId: string): string[] {
  const siteIds = new Set(SITES.filter((s) => s.companyId === companyId).map((s) => s.id))
  return [...new Set(DEPARTMENTS.filter((d) => siteIds.has(d.siteId)).map((d) => d.name))].sort()
}

async function fetchDepartments(companyId: string, siteIds: string[]): Promise<string[]> {
  const [structural, inUse] = await Promise.all([
    /*
     * Both are best-effort, and for the same reason the picker exists: this only ever
     * suggests. A field that still accepts free text must not fail to render because one
     * of two optional lookups was refused or unreachable.
     */
    orgApi.listDepartments(siteIds).catch(() => []),
    employeesApi.departments(companyId).catch(() => []),
  ])

  return [...new Set([...structural.map((d) => d.name), ...inUse])]
    .map((n) => n.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
}

export function loadDepartments(companyId: string, siteIds: string[]): Promise<string[]> {
  if (!companyId) return Promise.resolve([])
  if (!isBackendConfigured()) return Promise.resolve(fixtureDepartments(companyId))

  const known = cache.get(companyId)
  if (known) return Promise.resolve(known)

  const pending = inFlight.get(companyId)
  if (pending) return pending

  const request = fetchDepartments(companyId, siteIds)
    .then((names) => {
      cache.set(companyId, names)
      return names
    })
    .finally(() => inFlight.delete(companyId))

  inFlight.set(companyId, request)
  return request
}

/**
 * Drops what is remembered, so a department created under Organization is offered
 * immediately rather than after a reload.
 */
export function forgetDepartments(companyId?: string) {
  if (companyId) cache.delete(companyId)
  else cache.clear()
}

/**
 * The departments for the workspace in view.
 *
 * Empty on the first render and filled when the request lands, which is all a suggestion
 * list needs - the field is usable throughout either way.
 */
export function useDepartments(): string[] {
  const { company, sites } = useOrg()
  const companyId = company?.id ?? ''
  const siteKey = sites.map((s) => s.id).join(',')
  const [departments, setDepartments] = useState<string[]>([])

  useEffect(() => {
    let live = true
    void loadDepartments(companyId, siteKey ? siteKey.split(',') : [])
      .then((names) => { if (live) setDepartments(names) })
      .catch(() => { if (live) setDepartments([]) })
    return () => { live = false }
    // siteKey rather than the array, which is a new identity on every render.
  }, [companyId, siteKey])

  return departments
}
