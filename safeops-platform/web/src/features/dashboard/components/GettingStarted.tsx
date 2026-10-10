import { Link } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { Card, CardBody } from '@/components/ui'
import { cn } from '@/lib/cn'

/**
 * What to do on day one.
 *
 * A brand-new workspace shows twenty-four tiles reading zero across eight sections, with
 * sixteen places to go and nothing saying where to start. Everything that makes this
 * product good - the ranked attention feed, the next-step card, the sign-off gates - needs
 * data before it can say anything, so the screen that is supposed to answer "what should
 * you do next?" answers nothing at exactly the moment a customer forms their first
 * impression.
 *
 * This is the smallest thing that fixes that: four steps, each a real link, each ticked by
 * looking at the workspace rather than by remembering what somebody clicked.
 *
 * Two deliberate constraints:
 *
 *   - No seeded data. Filling a new workspace with invented incidents to make the dashboard
 *     look busy would be lying to a customer about their own safety record, which is the
 *     one thing a safety product must never do.
 *
 *   - Derived state, not stored state. Progress is computed from counts the dashboard has
 *     already loaded, so it is correct after a restore, correct on a second device, and
 *     cannot drift from reality. There is no "I completed this" flag to get out of step.
 */

export interface GettingStartedProgress {
  /** More than the one site created at provisioning. */
  hasSites: boolean
  /** Anybody beyond the founding administrator. */
  hasPeople: boolean
  hasIncidents: boolean
  hasPermits: boolean
}

interface Step {
  key: keyof GettingStartedProgress
  title: string
  detail: string
  to: string
  cta: string
}

const STEPS: Step[] = [
  {
    key: 'hasSites',
    title: 'Add your sites',
    detail: 'Plants, yards, offices — anywhere work happens. Everything else is filed against a site.',
    to: '/admin?s=sites',
    cta: 'Add a site',
  },
  {
    key: 'hasPeople',
    title: 'Invite your team',
    detail: 'Your HSE officers and supervisors. They can report and investigate as soon as they accept.',
    to: '/admin?s=invitations',
    cta: 'Invite someone',
  },
  {
    key: 'hasIncidents',
    title: 'Report something that happened',
    detail: 'A near miss from last week is a good first one. It takes about three minutes.',
    to: '/incidents/new',
    cta: 'Report an incident',
  },
  {
    key: 'hasPermits',
    title: 'Raise a permit to work',
    detail: 'Hot work, confined space, working at height — whatever your next high-risk job is.',
    to: '/permits',
    cta: 'Open permits',
  },
]

export function GettingStarted({
  progress, onDismiss,
}: {
  progress: GettingStartedProgress
  onDismiss?: () => void
}) {
  const done = STEPS.filter((s) => progress[s.key]).length
  // Nothing to say once they are running. It disappears rather than sitting there ticked.
  if (done === STEPS.length) return null

  const next = STEPS.find((s) => !progress[s.key])

  return (
    <Card className="mb-4 border-accent/40">
      <CardBody>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="text-sm font-semibold text-ink">Getting started</h2>
              <span className="text-2xs font-medium text-muted" aria-live="polite">
                {done} of {STEPS.length} done
              </span>
            </div>
            <p className="mt-0.5 text-xs text-ink-2">
              Four steps and your team can start using SafeOps properly. Nothing here is
              filled in for you — this is your workspace, not a demo.
            </p>

            {/* Progress, as a bar and as text, because colour alone is not a status. */}
            <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-sunken" role="presentation">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-500"
                style={{ width: `${(done / STEPS.length) * 100}%` }}
              />
            </div>

            <ol className="mt-3 space-y-1.5">
              {STEPS.map((step) => {
                const complete = progress[step.key]
                const isNext = !complete && step.key === next?.key
                return (
                  <li
                    key={step.key}
                    className={cn(
                      'flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors',
                      isNext && 'bg-accent-soft/40',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                        complete ? 'border-good bg-good text-white' : 'border-line',
                      )}
                      aria-hidden="true"
                    >
                      {complete && <Check size={10} strokeWidth={3} />}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className={cn(
                        'block text-xs font-medium',
                        complete ? 'text-muted line-through' : 'text-ink',
                      )}>
                        {step.title}
                      </span>
                      {!complete && (
                        <span className="mt-0.5 block text-2xs leading-relaxed text-muted">
                          {step.detail}
                        </span>
                      )}
                    </span>

                    {!complete && (
                      <Link
                        to={step.to}
                        className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded text-2xs font-semibold
                                   text-accent transition-colors hover:text-ink focus:outline-none
                                   focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        {step.cta}
                      </Link>
                    )}
                    {/* Screen readers get the state in words, not only as a tick. */}
                    <span className="sr-only">{complete ? 'Completed' : 'Not done yet'}</span>
                  </li>
                )
              })}
            </ol>
          </div>

          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Hide getting started"
              title="Hide getting started"
              className="shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:bg-accent-soft
                         hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent
                         coarse:flex coarse:min-h-11 coarse:min-w-11 coarse:items-center coarse:justify-center"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </CardBody>
    </Card>
  )
}
