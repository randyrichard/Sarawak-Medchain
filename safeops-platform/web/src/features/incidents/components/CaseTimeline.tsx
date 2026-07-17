import type { Incident } from '@/api/incidents'
import { Card, CardHeader } from '@/components/ui'
import { fmtDateTime } from '../lib'

/** Chronological case timeline: timestamp · user · action, always visible. */
export function CaseTimeline({ incident }: { incident: Incident }) {
  return (
    <Card>
      <CardHeader title="Timeline" subtitle={`${incident.timeline.length} events · every step recorded`} />
      <div className="px-5 pb-5 pt-1">
        <ol className="relative space-y-3.5 before:absolute before:bottom-1.5 before:left-[5px] before:top-1.5 before:w-px before:bg-grid">
          {incident.timeline.map((t, i) => {
            const latest = i === incident.timeline.length - 1
            return (
              <li key={t.id} className="relative flex gap-3">
                <span
                  className="z-10 mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2 bg-surface"
                  style={{ borderColor: latest && incident.stage !== 'closed' ? 'var(--accent)' : 'var(--baseline)' }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug text-ink">{t.action}</p>
                  {t.detail && <p className="text-2xs leading-relaxed text-ink-2">{t.detail}</p>}
                  <p className="mt-0.5 text-2xs text-muted">
                    {fmtDateTime(t.at)} · {t.actor}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </Card>
  )
}
