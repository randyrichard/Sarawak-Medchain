import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardCheck, Link2 } from 'lucide-react'
import type { AuditFindingView, FindingSeverity } from '@/api/audits'
import { Avatar, Card, EmptyState, Skeleton, StatusPill } from '@/components/ui'
import { FINDING_STATUS_META, SEVERITY_META } from '../lib'
import { cn } from '@/lib/cn'

type Filter = 'all' | FindingSeverity | 'open'

export function FindingsList({
  findings, q, onOpenAudit,
}: {
  findings: AuditFindingView[] | null
  q: string
  onOpenAudit: (auditId: string) => void
}) {
  const [filter, setFilter] = useState<Filter>('open')

  const rows = useMemo(() => {
    if (!findings) return []
    const query = q.trim().toLowerCase()
    return findings
      .filter((f) => filter === 'all' || (filter === 'open' ? f.status !== 'Closed' : f.severity === filter))
      .filter((f) => !query || [f.code, f.description, f.category, f.auditCode, f.actionOwner].join(' ').toLowerCase().includes(query))
  }, [findings, filter, q])

  if (findings === null) {
    return <Card className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</Card>
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(['open', 'all', 'Critical', 'Major', 'Minor', 'Observation'] as Filter[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn('rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors', filter === f ? 'bg-accent-soft text-ink' : 'text-ink-2 hover:text-ink')}
            style={filter === f ? { borderColor: 'var(--accent)' } : undefined}>
            {f}
          </button>
        ))}
      </div>
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="No findings match">
            Findings raised during audits appear here with their corrective actions.
          </EmptyState>
        ) : (
          <ul className="divide-y">
            {rows.map((f) => (
              <li key={f.id} className="flex flex-wrap items-start gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-2xs text-muted">{f.code}</span>
                    <StatusPill kind={SEVERITY_META[f.severity].kind} label={f.severity} />
                    <button onClick={() => onOpenAudit(f.auditId)} className="text-2xs font-semibold text-accent hover:underline">
                      {f.auditCode}
                    </button>
                    <span className="text-2xs text-muted">{f.category} · {f.siteId.toUpperCase()}</span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-ink">{f.description}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-2xs text-muted">
                    <Link to={`/actions?open=${f.actionId}`} className="inline-flex items-center gap-1 font-semibold text-accent hover:underline">
                      <Link2 size={10} /> {f.actionCode}
                    </Link>
                    <span className="inline-flex items-center gap-1"><Avatar name={f.actionOwner} size={14} /> {f.actionOwner}</span>
                    <span className={f.actionOverdue ? 'font-semibold text-critical' : ''}>due {f.actionDue}{f.actionOverdue ? ' · overdue' : ''}</span>
                  </p>
                </div>
                <StatusPill kind={FINDING_STATUS_META[f.status].kind} label={f.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
