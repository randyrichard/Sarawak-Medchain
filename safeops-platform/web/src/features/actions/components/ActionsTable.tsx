import { Fragment, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Download, ListChecks, Play, UserRound } from 'lucide-react'
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
import { usePeople } from '@/features/incidents/lib'
import { cn } from '@/lib/cn'
import { PeopleOptions } from '@/features/org/PeopleOptions'
import { useFormCheck } from '@/lib/useFormCheck'

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
  const people = usePeople()
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'due', dir: 1 })
  const [group, setGroup] = useState<GroupKey>('none')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [reassignOpen, setReassignOpen] = useState(false)
  const [newOwner, setNewOwner] = useState('')
  const reassign = useFormCheck({ newOwner: !newOwner && 'Choose who takes them over.' }, reassignOpen)

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
        className="inline-flex items-center gap-1 text-left uppercase tracking-wide hover:text-ink coarse:min-h-touch-sm"
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
          <select value={group} onChange={(e) => setGroup(e.target.value as GroupKey)} aria-label="Group by" className="h-8 coarse:h-touch rounded-lg border bg-surface px-2 text-xs text-ink-2 outline-none">
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
                Mark in Progress
              </Button>
              {isManager(actor.role) && (
                <Button size="sm" variant="secondary" icon={<UserRound size={12} />} onClick={() => setReassignOpen(true)}>
                  Reassign…
                </Button>
              )}
            </>
          )}
          <Button size="sm" variant="ghost" icon={<Download size={12} />}
            onClick={() => exportCsv(selected.size > 0 ? sorted.filter((i) => selected.has(i.id)) : sorted, 'safechain-corrective-actions.csv', (id) => sites.find((s) => s.id === id)?.name ?? id)}>
            Export CSV
          </Button>
        </div>
      </div>

      <Card>
        {/*
          A list of cards on a phone, the table from a tablet up.

          The table needed 980px for its eight columns, so on a 390px phone it scrolled
          sideways: titles were cut off at the card's edge, and status, owner, due date and
          progress sat out of sight behind a scroll nobody could see was there. On a phone
          each action is one card with all of it in view. From a tablet up the table no
          longer insists on 980px either: Priority folds into the title's line until there
          is room for its column, and Site and Progress join at the widest screens.
        */}
        <ActionCards
          groups={groups}
          readOnly={readOnly}
          actor={actor}
          selected={selected}
          toggle={toggle}
          onOpen={onOpen}
          canSelectAll={!readOnly && selectable.length > 0}
          allSelected={allSelected}
          onSelectAll={() => setSelected(allSelected ? new Set() : new Set(selectable.map((i) => i.id)))}
        />
        <div className="relative hidden overflow-x-auto md:block">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b text-2xs uppercase tracking-wide text-muted">
                <th className="w-10 px-4 py-2.5">
                  {!readOnly && (
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map((i) => i.id)))}
                      className="h-3.5 w-3.5 accent-[var(--accent)] coarse:h-6 coarse:w-6"
                    />
                  )}
                </th>
                <th className="px-3 py-2.5 font-semibold uppercase tracking-wide">Action</th>
                <SortHeader label="Status" k="status" />
                <SortHeader label="Priority" k="priority" className="hidden lg:table-cell" />
                <SortHeader label="Owner" k="owner" />
                <SortHeader label="Site" k="site" className="hidden xl:table-cell" />
                <SortHeader label="Due" k="due" />
                <th className="hidden w-36 px-4 py-2.5 font-semibold uppercase tracking-wide xl:table-cell">Progress</th>
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
        title={`Reassign ${selected.size} ${selected.size === 1 ? 'Action' : 'Actions'}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReassignOpen(false)}>Cancel</Button>
            <Button
              loading={busy}
              onClick={() => {
                if (!reassign.check()) return
                void bulk((id) => api.updateCapa(id, { owner: newOwner }, actor)).then(() => setReassignOpen(false))
              }}
            >
              Reassign
            </Button>
          </>
        }
      >
        <Select label="New owner" value={newOwner} onChange={(e) => setNewOwner(e.target.value)} hint="They are notified." error={reassign.errorFor('newOwner')}>
          <option value="" disabled>Select…</option>
          <PeopleOptions people={people} />
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
                className="h-3.5 w-3.5 accent-[var(--accent)] coarse:h-6 coarse:w-6"
              />
            )}
          </td>
          <td className="cursor-pointer px-3 py-3" onClick={() => onOpen(i.id)}>
            <p className="text-sm font-semibold leading-snug text-ink">{i.title}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-2xs text-muted">
              <span className="font-mono">{i.code}</span>
              {i.incidentNumber && <span>{i.incidentNumber}</span>}
              {i.rootCause && <span>· {i.rootCause}</span>}
              {/* Until there is room for the Priority column. */}
              <span className="lg:hidden"><PriorityBadge priority={i.priority} /></span>
            </p>
          </td>
          <td className="px-3 py-3"><StatusPill kind={DERIVED_META[i.derived].kind} label={i.derived} /></td>
          <td className="hidden px-3 py-3 lg:table-cell">
            <PriorityBadge priority={i.priority} />
          </td>
          <td className="px-3 py-3">
            <span className="flex items-center gap-1.5 text-xs text-ink-2">
              <Avatar name={i.owner || '?'} size={18} /> {i.owner || 'Unassigned'}
            </span>
          </td>
          <td className="hidden px-3 py-3 text-xs text-ink-2 xl:table-cell">{siteShort(i.siteId)} · {i.department}</td>
          <td className={cn('px-3 py-3 text-xs font-semibold', i.overdue ? 'text-critical' : 'text-ink-2')} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {i.dueDate}
            <span className="block text-2xs font-normal">{dueLabel(i)}</span>
          </td>
          <td className="hidden px-4 py-3 xl:table-cell">
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

function PriorityBadge({ priority }: { priority: CapaItem['priority'] }) {
  return <Badge tone={priority === 'High' ? 'critical' : priority === 'Medium' ? 'warning' : 'neutral'}>{priority}</Badge>
}

/** The list on a phone: one card per action, everything the table's columns held in view. */
function ActionCards({
  groups, readOnly, actor, selected, toggle, onOpen, canSelectAll, allSelected, onSelectAll,
}: {
  groups: { label: string | null; rows: CapaItem[] }[]
  readOnly: boolean
  actor: Actor
  selected: Set<string>
  toggle: (id: string) => void
  onOpen: (id: string) => void
  canSelectAll: boolean
  allSelected: boolean
  onSelectAll: () => void
}) {
  const checkCls = 'h-3.5 w-3.5 accent-[var(--accent)] coarse:h-6 coarse:w-6'
  const empty = groups.every((g) => g.rows.length === 0)
  return (
    <ul aria-label="Corrective actions" className="divide-y md:hidden">
      {canSelectAll && !empty && (
        <li className="px-4 py-2">
          <label className="flex items-center gap-3 text-xs font-semibold text-ink-2">
            <input type="checkbox" checked={allSelected} onChange={onSelectAll} className={checkCls} />
            Select All
          </label>
        </li>
      )}
      {groups.map((g) => (
        <Fragment key={g.label ?? '_all'}>
          {g.label && (
            <li className="bg-sunken/70 px-4 py-1.5 text-2xs font-bold uppercase tracking-wider text-ink-2">
              {g.label} <span className="font-normal text-muted">· {g.rows.length}</span>
            </li>
          )}
          {g.rows.map((i) => (
            <li
              key={i.id}
              // The whole card opens the action, as the table's row does; the title is the
              // button a keyboard reaches.
              onClick={() => onOpen(i.id)}
              className={cn('flex cursor-pointer items-start gap-3 px-4 py-3', i.overdue && 'bg-critical-soft/40')}
            >
              {/*
                The same gutter on every row when there is anything to select, ticked or not,
                so every title starts on one edge.
              */}
              {!readOnly && (
                <span className="flex w-6 shrink-0 pt-0.5">
                  {canEditItem(actor, i) && (
                    <input
                      type="checkbox"
                      aria-label={`Select ${i.code}`}
                      checked={selected.has(i.id)}
                      onChange={() => toggle(i.id)}
                      onClick={(e) => e.stopPropagation()}
                      className={checkCls}
                    />
                  )}
                </span>
              )}
              <div className="min-w-0 flex-1">
                {/*
                  A one-line title is 19px tall, under the 24px a target needs (WCAG 2.5.8).
                  The padding makes it 27px and the negative margin takes it back out, so the
                  target grows and nothing on the card moves.
                */}
                <button type="button" className="-my-1 block w-full py-1 text-left text-sm font-semibold leading-snug text-ink" onClick={(e) => { e.stopPropagation(); onOpen(i.id) }}>
                  {i.title}
                </button>
                <p className="mt-0.5 text-2xs text-muted">
                  <span className="font-mono">{i.code}</span>
                  {i.incidentNumber && <> {i.incidentNumber}</>}
                  {i.rootCause && <> · {i.rootCause}</>}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <StatusPill kind={DERIVED_META[i.derived].kind} label={i.derived} />
                  <PriorityBadge priority={i.priority} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
                  <span className="flex items-center gap-1.5">
                    <Avatar name={i.owner || '?'} size={18} /> {i.owner || 'Unassigned'}
                  </span>
                  <span className={cn('font-semibold', i.overdue && 'text-critical')} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    Due {i.dueDate} <span className="font-normal">· {dueLabel(i)}</span>
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <ProgressLine value={i.progress} overdue={i.overdue} className="flex-1" />
                  <span className="text-2xs text-muted" style={{ fontVariantNumeric: 'tabular-nums' }}>{i.progress}%</span>
                </div>
              </div>
            </li>
          ))}
        </Fragment>
      ))}
      {empty && (
        <li>
          <EmptyState icon={ListChecks} title="No actions match these filters">
            Clear the filter chips above, or raise a new corrective action.
          </EmptyState>
        </li>
      )}
    </ul>
  )
}
