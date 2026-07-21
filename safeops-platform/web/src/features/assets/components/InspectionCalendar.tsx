import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { InspectionView } from '@/api/assets'
import type { Actor } from '@/api/incidents'
import { Button, Card, Skeleton } from '@/components/ui'
import { cn } from '@/lib/cn'

const chipColor = (i: InspectionView) =>
  i.status === 'Completed' ? (i.outcome === 'failed' ? 'var(--serious)' : 'var(--good)')
  : i.overdue ? 'var(--critical)'
  : 'var(--accent)'

export function InspectionCalendar({
  inspections, actor, manage, onRun,
}: {
  inspections: InspectionView[] | null
  actor: Actor
  manage: boolean
  onRun: (i: InspectionView) => void
}) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  const byDay = useMemo(() => {
    const map = new Map<string, InspectionView[]>()
    ;(inspections ?? []).forEach((i) => {
      const key = i.status === 'Completed' ? (i.completedAt ?? i.scheduledFor).slice(0, 10) : i.scheduledFor
      map.set(key, [...(map.get(key) ?? []), i])
    })
    return map
  }, [inspections])

  const { cells, monthLabel } = useMemo(() => {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    const startOffset = (new Date(year, month, 1).getDay() + 6) % 7
    const start = new Date(year, month, 1 - startOffset)
    return {
      cells: Array.from({ length: 42 }, (_, i) => {
        const d = new Date(start)
        d.setDate(start.getDate() + i)
        return d
      }),
      monthLabel: cursor.toLocaleDateString('en-MY', { month: 'long', year: 'numeric' }),
    }
  }, [cursor])

  const todayKey = new Date().toISOString().slice(0, 10)
  const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  if (inspections === null) return <Card className="p-5"><Skeleton className="h-96 w-full" /></Card>

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold tracking-tight text-ink">{monthLabel}</h3>
        <div className="flex items-center gap-1.5">
          <span className="mr-2 hidden items-center gap-3 text-2xs text-muted md:flex">
            {[['Scheduled', 'var(--accent)'], ['Overdue', 'var(--critical)'], ['Passed', 'var(--good)'], ['Failed', 'var(--serious)']].map(([l, c]) => (
              <span key={l} className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: c }} />{l}</span>
            ))}
          </span>
          <Button variant="secondary" size="sm" icon={<ChevronLeft size={13} />} aria-label="Previous month"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} />
          <Button variant="secondary" size="sm" onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)) }}>Today</Button>
          <Button variant="secondary" size="sm" icon={<ChevronRight size={13} />} aria-label="Next month"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} />
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-grid">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="bg-sunken px-2 py-1.5 text-center text-2xs font-bold uppercase tracking-wider text-muted">{d}</div>
        ))}
        {cells.map((d) => {
          const key = keyOf(d)
          const inMonth = d.getMonth() === cursor.getMonth()
          const dayItems = byDay.get(key) ?? []
          return (
            <div key={key} className={cn('min-h-[92px] bg-surface p-1.5', !inMonth && 'opacity-45')}>
              <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded-full text-2xs font-semibold', key === todayKey ? 'bg-accent text-white' : 'text-ink-2')}>
                {d.getDate()}
              </span>
              <div className="mt-1 space-y-1">
                {dayItems.slice(0, 3).map((i) => {
                  const runnable = i.status === 'Scheduled' && (manage || i.assignedTo === actor.name)
                  return (
                    <button
                      key={i.id}
                      onClick={() => runnable && onRun(i)}
                      title={`${i.code} · ${i.assetName} — ${i.assignedTo}${runnable ? ' (click to run)' : ''}`}
                      className={cn(
                        'flex w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-left text-2xs font-medium text-ink',
                        runnable ? 'transition-colors hover:bg-accent-soft' : 'cursor-default',
                      )}
                      style={{ borderColor: chipColor(i) }}
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: chipColor(i) }} />
                      <span className="truncate">{i.assetCode}</span>
                    </button>
                  )
                })}
                {dayItems.length > 3 && <p className="px-1 text-2xs text-muted">+{dayItems.length - 3} more</p>}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
