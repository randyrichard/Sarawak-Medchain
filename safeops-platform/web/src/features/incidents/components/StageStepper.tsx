import { Check } from 'lucide-react'
import { INCIDENT_STAGES, STAGE_LABEL, type IncidentStage } from '@/api/incidents'
import { cn } from '@/lib/cn'

/**
 * The workflow, in workflow order.
 *
 * INCIDENT_STAGES is storage order, and 'draft' sits at its end - so drawing it straight
 * put a ninth step, "Draft", after "Closed", as if a closed incident had one more stage to
 * go. A draft is a report not yet submitted, not a step in the investigation; it is said
 * above the steps instead, with none of them started.
 */
const WORKFLOW: readonly IncidentStage[] = INCIDENT_STAGES.filter((s) => s !== 'draft')

export function StageStepper({ stage }: { stage: IncidentStage }) {
  const currentIdx = WORKFLOW.indexOf(stage)
  const closed = stage === 'closed'
  return (
    <div className="overflow-x-auto pb-1">
      {stage === 'draft' && (
        <p className="mb-2 text-xs font-medium text-muted">{STAGE_LABEL.draft} - not yet submitted, so the workflow has not started.</p>
      )}
      <ol className="flex min-w-[720px] items-center">
        {WORKFLOW.map((s, i) => {
          const done = i < currentIdx || closed
          const current = i === currentIdx && !closed
          return (
            <li key={s} className={cn('flex items-center', i < WORKFLOW.length - 1 && 'flex-1')}>
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
              {i < WORKFLOW.length - 1 && (
                <div className="mx-2 mb-5 h-0.5 flex-1 rounded" style={{ background: i < currentIdx || closed ? 'var(--accent)' : 'var(--grid)' }} />
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
