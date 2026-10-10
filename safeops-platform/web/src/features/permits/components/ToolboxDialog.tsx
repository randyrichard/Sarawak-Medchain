import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { permitWorkflowApi } from '@/api/permitWorkflowApi'
import { permitPeopleApi, ATTENDEE_ROLE_LABEL, type PermitAttendee } from '@/api/permitPeopleApi'
import { ApiError } from '@/api/types'
import { Alert, Badge, Button, Dialog, Input, Skeleton } from '@/components/ui'
import { cn } from '@/lib/cn'

/**
 * The pre-start briefing.
 *
 * A permit issued without one is the most common finding in a post-incident review, so
 * this records a time, a leader and an acknowledgement from every person named — not a
 * tick that says a meeting happened.
 *
 * The dialog stays open until everyone has acknowledged, because the half-finished state
 * is the dangerous one: a permit that looks briefed but has two people who never signed.
 */
export function ToolboxDialog({
  open, permitId, toolboxAt, toolboxBy, canManage, onClose, onChanged,
}: {
  open: boolean
  permitId: string
  toolboxAt: string | null
  toolboxBy: string | null
  canManage: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [attendees, setAttendees] = useState<PermitAttendee[] | null>(null)
  const [heldAt, setHeldAt] = useState('')
  const [leader, setLeader] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    permitPeopleApi.list(permitId)
      .then(setAttendees)
      .catch(() => setAttendees([]))
  }

  useEffect(() => {
    if (!open) return
    setError(null)
    setHeldAt(toolboxAt ? toLocalInput(toolboxAt) : toLocalInput(new Date().toISOString()))
    setLeader(toolboxBy ?? '')
    setAttendees(null)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, permitId, toolboxAt, toolboxBy])

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key)
    setError(null)
    try {
      await fn()
      load()
      onChanged()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not work.')
    } finally {
      setBusy(null)
    }
  }

  const acknowledged = attendees?.filter((a) => a.toolboxAckAt) ?? []
  const outstanding = attendees?.filter((a) => !a.toolboxAckAt) ?? []
  const allDone = !!attendees && attendees.length > 0 && outstanding.length === 0
  const recorded = !!toolboxAt

  return (
    <Dialog
      error={error}
      open={open}
      onClose={onClose}
      title="Toolbox talk"
      description="Everyone named on the permit has to acknowledge the briefing before work can start."
      footer={
        <Button variant={allDone ? 'primary' : 'secondary'} onClick={onClose}>
          {allDone ? 'Done' : 'Close'}
        </Button>
      }
    >

      <div className="space-y-4">
        {/* Meeting record */}
        <div className="rounded-lg border px-3.5 py-3">
          <p className="mb-2 flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-muted">
            The meeting
          </p>
          {recorded ? (
            <p className="text-sm text-ink">
              Held {new Date(toolboxAt).toLocaleString()}
              {toolboxBy && <span className="text-ink-2"> · led by {toolboxBy}</span>}
            </p>
          ) : canManage ? (
            <div className="space-y-2.5">
              <div className="grid gap-2.5 sm:grid-cols-2">
                <Input
                  label="Held at" type="datetime-local" value={heldAt}
                  onChange={(e) => setHeldAt(e.target.value)}
                  hint="Cannot be in the future."
                />
                <Input
                  label="Led by" placeholder="Site supervisor" value={leader}
                  onChange={(e) => setLeader(e.target.value)}
                />
              </div>
              <Button
                size="sm" loading={busy === 'record'}
                onClick={() => void run('record', () => permitWorkflowApi.recordToolbox(permitId, {
                  heldAt: heldAt ? new Date(heldAt).toISOString() : undefined,
                  supervisor: leader || undefined,
                }))}
              >
                Record the meeting
              </Button>
            </div>
          ) : (
            <p className="text-2xs text-muted">Not yet recorded.</p>
          )}
        </div>

        {/* Attendees */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-muted">
              Attendees
            </p>
            {attendees && attendees.length > 0 && (
              <span className={cn('text-2xs font-semibold', allDone ? 'text-good' : 'text-muted')}>
                {acknowledged.length} of {attendees.length} acknowledged
              </span>
            )}
          </div>

          {attendees === null ? (
            <div className="space-y-1.5">
              {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-11 rounded-lg" />)}
            </div>
          ) : attendees.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-4 text-center text-2xs text-muted">
              Nobody is named on this permit yet. Name the crew first — a briefing with no
              attendees is not a briefing.
            </p>
          ) : (
            <>
              {/* Progress. Reads at a glance from across a permit office. */}
              <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-sunken">
                <div
                  className={cn('h-full rounded-full transition-all', allDone ? 'bg-good' : 'bg-accent')}
                  style={{ width: `${Math.round((acknowledged.length / attendees.length) * 100)}%` }}
                />
              </div>

              <ul className="space-y-1.5">
                {attendees.map((a) => {
                  const done = !!a.toolboxAckAt
                  return (
                    <li
                      key={a.id}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg border px-3 py-2',
                        done && 'border-good/40 bg-good/5',
                      )}
                    >
                      <span className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border',
                        done ? 'border-good bg-good text-white' : 'border-grid',
                      )}>
                        {done && <Check size={12} strokeWidth={3} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-ink">{a.name}</p>
                        <p className="truncate text-2xs text-muted">
                          <span className="font-mono">{a.reference}</span>
                          {' · '}{ATTENDEE_ROLE_LABEL[a.role]}
                          {done && a.toolboxAckAt && (
                            <span> · signed {new Date(a.toolboxAckAt).toLocaleTimeString()}</span>
                          )}
                        </p>
                      </div>
                      {done ? (
                        <Badge tone="good">Acknowledged</Badge>
                      ) : recorded ? (
                        <Button
                          size="sm" variant="secondary" loading={busy === a.id}
                          onClick={() => void run(a.id, () => permitWorkflowApi.acknowledgeToolbox(a.id))}
                        >
                          Acknowledge
                        </Button>
                      ) : (
                        <span className="text-2xs text-muted">Record the meeting first</span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>

        {allDone && (
          <Alert tone="success" title="Briefing complete">
            Everyone named has acknowledged the toolbox talk.
          </Alert>
        )}
      </div>
    </Dialog>
  )
}

/** ISO instant → the `datetime-local` shape, in the viewer's own timezone. */
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
