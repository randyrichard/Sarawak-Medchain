import { Check } from 'lucide-react'
import { INCIDENT_STAGES, STAGE_LABEL, type IncidentStage } from '@/api/incidents'
import { cn } from '@/lib/cn'

export function StageStepper({ stage }: { stage: IncidentStage }) {
  const currentIdx = INCIDENT_STAGES.indexOf(stage)
  const closed = stage === 'closed'
  return (
    <div className="overflow-x-auto pb-1">
      <ol className="flex min-w-[720px] items-center">
        {INCIDENT_STAGES.map((s, i) => {
          const done = i < currentIdx || closed
          const current = i === currentIdx && !closed
          return (
            <li key={s} className={cn('flex items-center', i < INCIDENT_STAGES.length - 1 && 'flex-1')}>
              <div className="flex flex-col items-center">
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-full border-2 text-2xs font-bold transition-colors"
                  style={{
                    borderColor: done || current ? 'var(--accent)' : 'var(--grid)',
                    background: done ? 'var(--accent)' : current ? 'var(--accent-soft)' : 'transparent',
                    color: done ? '#fff' : current ? 'var(--accent)' : 'var(--muted)',
                  }}
                  aria-current={current ? 'step' : undefined}
                >
                  {done ? <Check size={13} strokeWidth={3} /> : i + 1}
                </div>
                <span className={cn('mt-1.5 whitespace-nowrap text-2xs font-medium', current ? 'text-ink' : 'text-muted')}>
                  {STAGE_LABEL[s]}
                </span>
              </div>
              {i < INCIDENT_STAGES.length - 1 && (
                <div className="mx-2 mb-5 h-0.5 flex-1 rounded" style={{ background: i < currentIdx || closed ? 'var(--accent)' : 'var(--grid)' }} />
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
