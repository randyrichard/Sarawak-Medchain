import type { CapaDerivedStatus, CapaItem } from '@/api/capa'
import type { Actor } from '@/api/incidents'
import type { StatusKind } from '@/components/ui'

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
      return item.owner === actor.name || orgWide || actor.siteIds!.includes(item.siteId)
    case 'employee':
      return item.owner === actor.name
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

export function exportCsv(items: CapaItem[], filename: string) {
  const esc = (v: string | number | undefined | null) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const header = ['Code', 'Title', 'Status', 'Priority', 'Owner', 'Reviewer', 'Site', 'Department', 'Due date', 'Progress %', 'Incident', 'Root cause', 'Overdue']
  const rows = items.map((i) =>
    [i.code, i.title, i.derived, i.priority, i.owner, i.reviewer, i.siteId.toUpperCase(), i.department, i.dueDate, i.progress, i.incidentNumber ?? '', i.rootCause ?? '', i.overdue ? 'YES' : ''].map(esc).join(','),
  )
  const blob = new Blob([[header.map(esc).join(','), ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
