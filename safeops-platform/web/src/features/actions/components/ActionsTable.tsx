import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Download, Link2, ListChecks, Play, UserRound } from 'lucide-react'
import { api } from '@/api/client'
import { ApiError } from '@/api/types'
import type { CapaItem } from '@/api/capa'
import type { Actor } from '@/api/incidents'
import type { Site } from '@/api/types'
import {
  Alert, Avatar, Badge, Button, Card, Dialog, EmptyState, Select, Skeleton, StatusPill,
} from '@/components/ui'
import { ProgressLine } from './ProgressLine'
import { canEditItem, DERIVED_META, dueLabel, exportCsv, isManager } from '../lib'
import { PEOPLE } from '@/features/incidents/lib'
import { cn } from '@/lib/cn'

type SortKey = 'due' | 'priority' | 'status' | 'owner' | 'site'
type GroupKey = 'none' | 'site' | 'owner' | 'status' | 'priority'

const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 }

export function ActionsTable({
  items, actor, readOnly, sites, onOpen, onChanged,
}: {
  items: CapaItem[] | null
  actor: Actor
  readOnly: boolean
  sites: Site[]
  onOpen: (id: string) => void
  onChanged: () => void
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'due', dir: 1 })
  const [group, setGroup] = useState<GroupKey>('none')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [reassignOpen, setReassignOpen] = useState(false)
  const [newOwner, setNewOwner] = useState('')

  const siteShort = (id: string) => sites.find((s) => s.id === id)?.short ?? id.toUpperCase()

  const sorted = useMemo(() => {
    if (!items) return []
    const cmp = (a: CapaItem, b: CapaItem): number => {
      switch (sort.key) {
        case 'due': return a.dueDate.localeCompare(b.dueDate)
        case 'priority': return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
        case 'status': return a.derived.localeCompare(b.derived)
        case 'owner': return a.owner.localeCompare(b.owner)
        case 'site': return a.siteId.localeCompare(b.siteId)
      }
    }
    return [...items].sort((a, b) => sort.dir * cmp(a, b))
  }, [items, sort])

  const groups = useMemo(() => {
    if (group === 'none') return [{ label: null as string | null, rows: sorted }]
    const keyOf = (i: CapaItem) =>
      group === 'site' ? siteShort(i.siteId) : group === 'owner' ? (i.owner || 'Unassigned') : group === 'status' ? i.derived : i.priority
    const map = new Map<string, CapaItem[]>()
    sorted.forEach((i) => {
      const k = keyOf(i)
      map.set(k, [...(map.get(k) ?? []), i])
    })
    return [...map.entries()].map(([label, rows]) => ({ label, rows }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, group, sites])

  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const selectable = sorted.filter((i) => canEditItem(actor, i))
  const allSelected = selectable.length > 0 && selectable.every((i) => selected.has(i.id))

  const bulk = async (fn: (id: string) => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      for (const id of selected) await fn(id)
      setSelected(new Set())
      onChanged()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Bulk update stopped on an error.')
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const SortHeader = ({ label, k, className }: { label: string; k: SortKey; className?: string }) => (
    <th className={cn('px-3 py-2.5 font-semibold', className)}>
      <button
        className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-ink"
        onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? ((s.dir * -1) as 1 | -1) : 1 }))}
      >
        {label}
        {sort.key === k && (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
      </button>
    </th>
  )

  if (items === null) {
    return (
      <Card className="space-y-3 p-5">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </Card>
    )
  }

  return (
    <>
      {error && <Alert tone="critical" className="mb-3" onDismiss={() => setError(null)}>{error}</Alert>}

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xs font-semibold uppercase tracking-wider text-muted">Group by</span>
          <select value={group} onChange={(e) => setGroup(e.target.value as GroupKey)} className="h-8 rounded-lg border bg-surface px-2 text-xs text-ink-2 outline-none">
            <option value="none">None</option>
            <option value="site">Site</option>
            <option value="owner">Owner</option>
            <option value="status">Status</option>
            <option value="priority">Priority</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && !readOnly && (
            <>
              <Badge tone="accent">{selected.size} selected</Badge>
              <Button size="sm" variant="secondary" icon={<Play size={12} />} loading={busy}
                onClick={() => void bulk((id) => api.updateCapa(id, { status: 'In Progress' }, actor))}>
                Mark in progress
              </Button>
              {isManager(actor.role) && (
                <Button size="sm" variant="secondary" icon={<UserRound size={12} />} onClick={() => setReassignOpen(true)}>
                  Reassign…
                </Button>
              )}
            </>
          )}
          <Button size="sm" variant="ghost" icon={<Download size={12} />}
            onClick={() => exportCsv(selected.size > 0 ? sorted.filter((i) => selected.has(i.id)) : sorted, 'safeops-corrective-actions.csv')}>
            Export CSV
          </Button>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left">
            <thead>
              <tr className="border-b text-2xs uppercase tracking-wide text-muted">
                <th className="w-10 px-4 py-2.5">
                  {!readOnly && (
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map((i) => i.id)))}
                      className="h-3.5 w-3.5 accent-[var(--accent)]"
                    />
                  )}
                </th>
                <th className="px-3 py-2.5 font-semibold uppercase tracking-wide">Action</th>
                <SortHeader label="Status" k="status" />
                <SortHeader label="Priority" k="priority" />
                <SortHeader label="Owner" k="owner" />
                <SortHeader label="Site" k="site" className="hidden lg:table-cell" />
                <SortHeader label="Due" k="due" />
                <th className="w-36 px-4 py-2.5 font-semibold uppercase tracking-wide">Progress</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <GroupRows
                  key={g.label ?? '_all'}
                  label={g.label}
                  rows={g.rows}
                  readOnly={readOnly}
                  actor={actor}
                  selected={selected}
                  toggle={toggle}
                  onOpen={onOpen}
                  siteShort={siteShort}
                />
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <EmptyState icon={ListChecks} title="No actions match these filters">
                      Clear the filter chips above, or raise a new corrective action.
                    </EmptyState>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog
        open={reassignOpen}
        onClose={() => setReassignOpen(false)}
        title={`Reassign ${selected.size} action(s)`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReassignOpen(false)}>Cancel</Button>
            <Button
              loading={busy}
              disabled={!newOwner}
              onClick={() =>
                void bulk((id) => api.updateCapa(id, { owner: newOwner }, actor)).then(() => setReassignOpen(false))
              }
            >
              Reassign
            </Button>
          </>
        }
      >
        <Select label="New owner" value={newOwner} onChange={(e) => setNewOwner(e.target.value)} hint="Each owner is notified.">
          <option value="" disabled>Select…</option>
          {PEOPLE.map((p) => <option key={p}>{p}</option>)}
        </Select>
      </Dialog>
    </>
  )
}

function GroupRows({
  label, rows, readOnly, actor, selected, toggle, onOpen, siteShort,
}: {
  label: string | null
  rows: CapaItem[]
  readOnly: boolean
  actor: Actor
  selected: Set<string>
  toggle: (id: string) => void
  onOpen: (id: string) => void
  siteShort: (id: string) => string
}) {
  return (
    <>
      {label && (
        <tr className="border-b bg-sunken/70">
          <td colSpan={8} className="px-4 py-1.5 text-2xs font-bold uppercase tracking-wider text-ink-2">
            {label} <span className="font-normal text-muted">· {rows.length}</span>
          </td>
        </tr>
      )}
      {rows.map((i) => (
        <tr key={i.id} className={cn('border-b last:border-0 hover:bg-accent-soft/40', i.overdue && 'bg-critical-soft/40')}>
          <td className="px-4 py-3">
            {!readOnly && canEditItem(actor, i) && (
              <input
                type="checkbox"
                aria-label={`Select ${i.code}`}
                checked={selected.has(i.id)}
                onChange={() => toggle(i.id)}
                onClick={(e) => e.stopPropagation()}
                className="h-3.5 w-3.5 accent-[var(--accent)]"
              />
            )}
          </td>
          <td className="cursor-pointer px-3 py-3" onClick={() => onOpen(i.id)}>
            <p className="text-sm font-semibold leading-snug text-ink">{i.title}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-2xs text-muted">
              <span className="font-mono">{i.code}</span>
              {i.incidentNumber && <span className="inline-flex items-center gap-0.5"><Link2 size={9} /> {i.incidentNumber}</span>}
              {i.rootCause && <span>· {i.rootCause}</span>}
            </p>
          </td>
          <td className="px-3 py-3"><StatusPill kind={DERIVED_META[i.derived].kind} label={i.derived} /></td>
          <td className="px-3 py-3">
            <Badge tone={i.priority === 'High' ? 'critical' : i.priority === 'Medium' ? 'warning' : 'neutral'}>{i.priority}</Badge>
          </td>
          <td className="px-3 py-3">
            <span className="flex items-center gap-1.5 text-xs text-ink-2">
              <Avatar name={i.owner || '?'} size={18} /> {i.owner || 'Unassigned'}
            </span>
          </td>
          <td className="hidden px-3 py-3 text-xs text-ink-2 lg:table-cell">{siteShort(i.siteId)} · {i.department}</td>
          <td className={cn('px-3 py-3 text-xs font-semibold', i.overdue ? 'text-critical' : 'text-ink-2')} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {i.dueDate}
            <span className="block text-2xs font-normal">{dueLabel(i)}</span>
          </td>
          <td className="px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex-1"><ProgressLine value={i.progress} overdue={i.overdue} /></div>
              <span className="w-8 text-right text-2xs text-muted" style={{ fontVariantNumeric: 'tabular-nums' }}>{i.progress}%</span>
            </div>
          </td>
        </tr>
      ))}
    </>
  )
}
