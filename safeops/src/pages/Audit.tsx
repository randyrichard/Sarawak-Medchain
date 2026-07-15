import { CalendarClock, FileWarning } from 'lucide-react'
import { Card, CardHeader, PageHeader, StatusPill, ProgressBar } from '../components/ui'
import { AUDIT_STANDARDS, siteById } from '../data/mock'

function daysUntil(date: string) {
  return Math.round((new Date(date).getTime() - new Date('2026-07-15').getTime()) / 86400000)
}

export default function Audit() {
  const nextUp = [...AUDIT_STANDARDS].sort((a, b) => a.nextAudit.localeCompare(b.nextAudit))[0]
  const majors = AUDIT_STANDARDS.flatMap((s) => s.outstanding.filter((o) => o.severity === 'Major').map((o) => ({ ...o, std: s.name })))

  return (
    <>
      <PageHeader
        title="Audit Readiness"
        subtitle={`Next external audit: ${nextUp.name} in ${daysUntil(nextUp.nextAudit)} days — close majors first, minors second`}
        right={<StatusPill kind={majors.length > 0 ? 'critical' : 'good'} label={`${majors.length} major findings open`} />}
      />

      {/* Standards grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {AUDIT_STANDARDS.map((std) => {
          const days = daysUntil(std.nextAudit)
          const tone = std.readiness >= 90 ? 'var(--good)' : std.readiness >= 80 ? 'var(--warning)' : 'var(--critical)'
          return (
            <Card key={std.id}>
              <CardHeader
                title={std.name}
                subtitle={`${std.compliant}/${std.totalClauses} clauses compliant · ${std.minor} minor · ${std.major} major`}
                right={
                  <span className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold text-ink-2">
                    <CalendarClock size={13} className="text-muted" />
                    {days} days
                  </span>
                }
              />
              <div className="px-5 pb-2">
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-2xl font-semibold tracking-tight text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {std.readiness}%
                  </span>
                  <span className="text-[11px] text-muted">readiness</span>
                </div>
                <ProgressBar value={std.readiness} tone={tone} />
              </div>
              <div className="mt-2 border-t px-5 py-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Outstanding items</p>
                <ul className="space-y-2">
                  {std.outstanding.map((o) => (
                    <li key={o.item} className="flex items-start gap-2.5">
                      <FileWarning
                        size={14}
                        className="mt-0.5 shrink-0"
                        style={{ color: o.severity === 'Major' ? 'var(--critical)' : 'var(--warning)' }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs leading-snug text-ink">{o.item}</p>
                        <p className="mt-0.5 text-[11px] text-muted">
                          {siteById(o.site).short} · {o.severity} · due {o.due}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Priority queue */}
      <Card className="mt-4">
        <CardHeader
          title="Pre-audit priority queue"
          subtitle="Every major finding, ordered by audit date — this is the work list for the next 6 weeks"
        />
        <div className="space-y-2 px-5 pb-5 pt-1">
          {majors
            .sort((a, b) => a.due.localeCompare(b.due))
            .map((m, i) => (
              <div key={m.item} className="flex items-center gap-3 rounded-lg border px-4 py-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: 'var(--critical)' }}>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-ink">{m.item}</p>
                  <p className="text-[11px] text-muted">{m.std} · {siteById(m.site).name}</p>
                </div>
                <span className="shrink-0 text-xs font-semibold" style={{ color: 'var(--critical)', fontVariantNumeric: 'tabular-nums' }}>
                  due {m.due}
                </span>
              </div>
            ))}
        </div>
      </Card>
    </>
  )
}
