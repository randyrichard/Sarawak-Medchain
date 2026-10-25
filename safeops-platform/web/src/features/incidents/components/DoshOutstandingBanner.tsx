import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { doshApi, type DoshOutstanding } from '@/api/doshApi'
import { isBackendConfigured } from '@/api/authApi'
import { cn } from '@/lib/cn'

/**
 * What is owed to DOSH across the workspace, above the incident register.
 *
 * A seven-day deadline found only by opening each incident is a deadline found late. Says
 * nothing when nothing is owed, in the offline demo, or if the list cannot be fetched: the
 * register is the page, and a banner that fails loudly would stand in front of it.
 */
const SHOWN = 5

const fmtDay = (ymd: string) =>
  new Date(`${ymd}T12:00:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })

function owed(r: DoshOutstanding): string {
  const when = r.dueDate
    ? r.daysLeft !== null && r.daysLeft < 0
      ? `was due ${fmtDay(r.dueDate)}`
      : `due by ${fmtDay(r.dueDate)}`
    : ''
  if (r.state === 'decide') return `decide whether DOSH must be told${when ? ` - JKKP 6 ${when}` : ''}`
  if (r.state === 'submitted' && r.immediateOutstanding) return 'immediate notice not recorded'
  return `${r.form ?? 'report'} ${when}${r.immediateOutstanding ? ' - tell DOSH at once' : ''}`
}

export function DoshOutstandingBanner({ companyId }: { companyId: string }) {
  const [rows, setRows] = useState<DoshOutstanding[]>([])

  useEffect(() => {
    if (!isBackendConfigured()) return
    let cancelled = false
    doshApi.outstanding(companyId).then((r) => !cancelled && setRows(r)).catch(() => !cancelled && setRows([]))
    return () => { cancelled = true }
  }, [companyId])

  if (rows.length === 0) return null
  const urgent = rows.some((r) => r.state === 'overdue' || r.immediateOutstanding)

  return (
    <div
      role="status"
      className={cn(
        'mb-3 rounded-lg border px-3.5 py-2.5',
        urgent ? 'border-critical/50 bg-critical-soft/30' : 'border-warning/60 bg-warning-soft/30',
      )}
    >
      <p className={cn('flex items-center gap-1.5 text-xs font-semibold', urgent ? 'text-critical' : 'text-warning')}>
        <AlertTriangle size={12} aria-hidden />
        DOSH: {rows.length} {rows.length === 1 ? 'incident needs' : 'incidents need'} attention
      </p>
      <ul className="mt-1.5 space-y-0.5">
        {rows.slice(0, SHOWN).map((r) => (
          <li key={r.incidentId} className="text-2xs text-ink">
            <Link to={`/incidents/${r.incidentId}`} className="font-medium text-accent hover:underline">{r.number}</Link>
            {' '}{r.title} <span className="text-ink-2">- {owed(r)}</span>
          </li>
        ))}
      </ul>
      {rows.length > SHOWN && <p className="mt-1 text-2xs text-muted">and {rows.length - SHOWN} more</p>}
    </div>
  )
}
