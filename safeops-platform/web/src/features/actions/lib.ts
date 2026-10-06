import type { CapaDerivedStatus, CapaItem } from '@/api/capa'
import type { Actor } from '@/api/incidents'
import type { StatusKind } from '@/components/ui'
import { csvDocument } from '@/lib/csv'

export const DERIVED_META: Record<CapaDerivedStatus, { kind: StatusKind; label: string }> = {
  Open: { kind: 'serious', label: 'Open' },
  Assigned: { kind: 'info', label: 'Assigned' },
  'In Progress': { kind: 'warning', label: 'In Progress' },
  'Waiting Verification': { kind: 'warning', label: 'Waiting Verification' },
  Verified: { kind: 'good', label: 'Verified' },
  Closed: { kind: 'good', label: 'Closed' },
  Cancelled: { kind: 'info', label: 'Cancelled' },
}

export const ACTIVE_STATES: CapaDerivedStatus[] = ['Open', 'Assigned', 'In Progress', 'Waiting Verification']

/**
 * Whether the actor owns this action - the server's rule (api/src/lib/actionOwner.ts).
 *
 * The owner's account decides when the action is linked to one; the name is the fallback
 * only for an unlinked action. Comparing names alone showed an action as read-only to its
 * own owner after a rename, and as editable to anybody sharing the owner's name.
 */
export function ownsItem(actor: Actor, item: Pick<CapaItem, 'owner' | 'ownerId'>): boolean {
  return item.ownerId ? item.ownerId === actor.userId : item.owner === actor.name
}

/** Mirrors the store's permission rules for UI affordances (server re-checks). */
export function canEditItem(actor: Actor, item: CapaItem): boolean {
  if (item.derived === 'Cancelled' || item.derived === 'Verified' || item.derived === 'Closed') return false
  const orgWide = !actor.siteIds || actor.siteIds.length === 0
  switch (actor.role) {
    case 'admin':
    case 'hse_manager':
      return true
    case 'safety_officer':
    case 'supervisor':
      return ownsItem(actor, item) || orgWide || actor.siteIds!.includes(item.siteId)
    case 'employee':
      return ownsItem(actor, item)
    default:
      return false
  }
}

export function canVerifyItem(actor: Actor, item: CapaItem): boolean {
  return ['admin', 'hse_manager'].includes(actor.role) || (!!item.reviewer && item.reviewer === actor.name)
}

export const isManager = (role: string) => role === 'admin' || role === 'hse_manager'

export function dueLabel(item: CapaItem): string {
  if (item.derived === 'Verified' || item.derived === 'Closed') return 'done'
  if (item.derived === 'Cancelled') return 'cancelled'
  if (item.daysToDue < 0) return `${Math.abs(item.daysToDue)}d overdue`
  if (item.daysToDue === 0) return 'due today'
  if (item.daysToDue === 1) return 'due tomorrow'
  return `due in ${item.daysToDue}d`
}

/** `siteName` turns a site id into its name; a server's ids are database keys, not codes. */
export function exportCsv(items: CapaItem[], filename: string, siteName: (id: string) => string = (id) => id.toUpperCase()) {
  const header = ['Code', 'Title', 'Status', 'Priority', 'Owner', 'Reviewer', 'Site', 'Department', 'Due date', 'Progress %', 'Incident', 'Root cause', 'Overdue']
  // Title and root cause are free text written by whoever raised the action, which includes
  // every employee — so this file needs the same formula guard as the rest.
  const rows = items.map((i) =>
    [i.code, i.title, i.derived, i.priority, i.owner, i.reviewer, siteName(i.siteId), i.department, i.dueDate, i.progress, i.incidentNumber ?? '', i.rootCause ?? '', i.overdue ? 'YES' : ''],
  )
  const blob = new Blob([csvDocument(header, rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
