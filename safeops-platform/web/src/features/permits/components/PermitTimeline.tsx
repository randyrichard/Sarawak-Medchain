import { useState } from 'react'
import {
  History, FileText, Send, Check, XCircle, Play, PauseCircle, Lock, Unlock, Wind,
  Users, Paperclip, ClipboardList, ShieldCheck, Clock, ChevronDown, PenLine,
} from 'lucide-react'
import type { PermitView } from '@/api/permits'
import { cn } from '@/lib/cn'

/**
 * The permit's history, newest first.
 *
 * Every entry is a real row written by the service at the moment it happened — the
 * timeline is not assembled from the permit's current state, so it still reads correctly
 * for a permit that was returned, resubmitted and signed by different people.
 *
 * Entries expand because the useful detail (what a reviewer actually checked, which
 * document was attached) is long, and a wall of it makes the sequence unreadable.
 */

/** Matched on the action text the services write. Order matters: first match wins. */
const ICONS: [RegExp, typeof FileText, string][] = [
  [/created|requested/i, FileText, 'text-muted'],
  [/submitted|entered review/i, Send, 'text-accent'],
  [/signed|approved/i, Check, 'text-good'],
  [/returned|rejected/i, XCircle, 'text-critical'],
  [/work started|resumed/i, Play, 'text-good'],
  [/suspend/i, PauseCircle, 'text-warning'],
  [/isolation applied/i, Lock, 'text-warning'],
  [/isolation released/i, Unlock, 'text-good'],
  [/gas test/i, Wind, 'text-accent'],
  [/person added|person removed|signed in|signed out/i, Users, 'text-accent'],
  [/document/i, Paperclip, 'text-muted'],
  [/jsa/i, ClipboardList, 'text-accent'],
  [/ppe|toolbox/i, ShieldCheck, 'text-accent'],
  [/extension/i, Clock, 'text-warning'],
  [/closed/i, Check, 'text-ink-2'],
]

function iconFor(action: string): [typeof FileText, string] {
  const hit = ICONS.find(([re]) => re.test(action))
  return hit ? [hit[1], hit[2]] : [History, 'text-muted']
}

export function PermitTimeline({ permit }: { permit: PermitView }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggle = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // Signatures are shown alongside the events they belong to rather than in a separate
  // list — a signature detached from what was signed is not evidence of anything.
  const signatures = permit.signatures

  const entries = [...permit.timeline].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  )

  return (
    <section>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
        <History size={12} /> Audit trail
        <span className="text-muted">({entries.length})</span>
      </p>

      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-2xs text-muted">
          Nothing has happened to this permit yet.
        </p>
      ) : (
        <ol className="relative space-y-0">
          {entries.map((e, i) => {
            const [Icon, tone] = iconFor(e.action)
            const isOpen = expanded.has(e.id)
            const hasDetail = !!e.detail && e.detail.length > 0
            const last = i === entries.length - 1
            // A signature recorded within a few seconds of the event is that event's.
            const sig = signatures.find(
              (s) => Math.abs(new Date(s.signedAt).getTime() - new Date(e.at).getTime()) < 5000,
            )

            return (
              <li key={e.id} className="relative flex gap-2.5 pb-2.5 last:pb-0">
                {!last && (
                  <span aria-hidden className="absolute left-[11px] top-6 h-full w-px bg-grid" />
                )}
                <span className="z-10 flex h-[23px] w-[23px] shrink-0 items-center justify-center rounded-full border bg-surface">
                  <Icon size={12} className={tone} />
                </span>

                <div className="min-w-0 flex-1">
                  <button
                    disabled={!hasDetail && !sig}
                    onClick={() => toggle(e.id)}
                    className={cn(
                      'w-full rounded-lg px-2 py-1 text-left -ml-2',
                      (hasDetail || sig) && 'hover:bg-accent-soft/40',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm leading-snug text-ink">{e.action}</p>
                      {(hasDetail || sig) && (
                        <ChevronDown
                          size={13}
                          className={cn('mt-0.5 shrink-0 text-muted transition-transform', isOpen && 'rotate-180')}
                        />
                      )}
                    </div>
                    <p className="text-2xs text-muted">
                      {e.actor}
                      {e.actorRole && <span> · {e.actorRole.replace(/_/g, ' ')}</span>}
                      {' · '}{new Date(e.at).toLocaleString()}
                    </p>
                  </button>

                  {isOpen && (
                    <div className="mt-1 space-y-1.5 pl-0">
                      {hasDetail && (
                        <p className="rounded-lg bg-sunken px-2.5 py-1.5 text-2xs leading-relaxed text-ink-2">
                          {e.detail}
                        </p>
                      )}
                      {sig && (
                        <div className="rounded-lg border border-accent/30 bg-accent-soft/40 px-2.5 py-1.5">
                          <p className="flex items-center gap-1.5 text-2xs font-semibold text-ink">
                            <PenLine size={10} /> Signed by {sig.name}
                          </p>
                          <p className="mt-0.5 text-2xs leading-relaxed text-ink-2">{sig.statement}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
