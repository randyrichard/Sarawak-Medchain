import { cn } from '@/lib/cn'

export interface AgendaEntry {
  id: string
  code: string
  title: string
  /** Said in words, so the colour is never the only sign of it. */
  status: string
  color: string
  /** Absent when the entry cannot be acted on from here. */
  onSelect?: () => void
  hint?: string
}

/**
 * A month's calendar entries as a list, for phones.
 *
 * Seven day columns on a 360px screen leave each about 45px, so the month grid showed each
 * entry as a coloured dot and the first character of its code, and the colour key is
 * hidden at that width. The grid stays from `sm` up; below it, the same entries are listed
 * by day with their code, title and status in words, each a full-width target.
 */
export function MonthAgenda({
  days, todayKey, empty,
}: {
  days: { key: string; date: Date; entries: AgendaEntry[] }[]
  todayKey: string
  empty: string
}) {
  const shown = days.filter((d) => d.entries.length > 0)
  if (shown.length === 0) return <p className="py-6 text-center text-sm text-muted sm:hidden">{empty}</p>
  return (
    <ol className="space-y-3 sm:hidden">
      {shown.map((d) => (
        <li key={d.key}>
          <p className={cn('text-xs font-semibold', d.key === todayKey ? 'text-accent' : 'text-ink-2')}>
            {d.date.toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' })}
            {d.key === todayKey && ' · Today'}
          </p>
          <ul className="mt-1 space-y-1.5">
            {d.entries.map((e) => {
              const body = (
                <>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: e.color }} aria-hidden />
                  <span className="shrink-0 font-mono text-xs text-ink-2">{e.code}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{e.title}</span>
                  <span className="shrink-0 text-2xs font-semibold text-ink-2">{e.status}</span>
                </>
              )
              const cls = 'flex min-h-11 w-full items-center gap-2 rounded-lg border px-3 py-2 text-left'
              return (
                <li key={e.id}>
                  {e.onSelect ? (
                    <button type="button" onClick={e.onSelect} title={e.hint} className={cn(cls, 'transition-colors hover:bg-accent-soft')} style={{ borderColor: e.color }}>
                      {body}
                    </button>
                  ) : (
                    <div className={cls} title={e.hint} style={{ borderColor: e.color }}>{body}</div>
                  )}
                </li>
              )
            })}
          </ul>
        </li>
      ))}
    </ol>
  )
}
