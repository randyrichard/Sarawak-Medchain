import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, LogIn, LogOut } from 'lucide-react'
import {
  ATTENDEE_ROLE_LABEL, permitPeopleApi,
  type AttendeeRole, type EligiblePerson, type PermitAttendee,
} from '@/api/permitPeopleApi'
import { ApiError } from '@/api/types'
import { Alert, Badge, Button, Dialog, Select, Skeleton } from '@/components/ui'
import { cn } from '@/lib/cn'

/**
 * Who is on this permit, and who is currently inside the work area.
 *
 * The people are named from the workforce and contractor registers rather than typed,
 * which is what lets the server refuse an unfit person. Before this existed a permit
 * carried a worker *count*, so nothing could tell the difference between five qualified
 * entrants and five names on a page.
 */
export function PermitPeoplePanel({
  permitId, permitStatus, canEdit, onChanged,
}: {
  permitId: string
  permitStatus: string
  canEdit: boolean
  onChanged?: () => void
}) {
  const [rows, setRows] = useState<PermitAttendee[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const settled = ['closed', 'archived', 'rejected'].includes(permitStatus)
  const live = permitStatus === 'active'

  const load = useCallback(() => {
    permitPeopleApi.list(permitId)
      .then(setRows)
      .catch((e) => {
        setRows([])
        setError(e instanceof ApiError ? e.message : 'Could not load the people on this permit.')
      })
  }, [permitId])

  useEffect(() => { load() }, [load])

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key)
    setError(null)
    try {
      await fn()
      load()
      onChanged?.()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not work.')
    } finally {
      setBusy(null)
    }
  }

  const inside = rows?.filter((r) => r.inside) ?? []

  return (
    <section>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
        People
        {inside.length > 0 && (
          <span className="text-accent">({inside.length} in the work area)</span>
        )}
      </p>

      {error && <Alert tone="critical" className="mb-2" onDismiss={() => setError(null)}>{error}</Alert>}

      {rows === null ? (
        <div className="space-y-1.5">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-11 rounded-lg" />)}
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-2xs text-muted">
          Nobody named yet. A permit without named people cannot be checked against
          medicals or competencies.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.id} className={cn('flex items-start gap-2 rounded-lg border px-3 py-2', r.inside && 'border-accent/60 bg-accent-soft/30')}>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm text-ink">
                  {r.name}
                  {r.inside && <Badge tone="accent">Inside</Badge>}
                </p>
                <p className="text-2xs text-muted">
                  <span className="font-mono">{r.reference}</span>
                  {' · '}{ATTENDEE_ROLE_LABEL[r.role]}
                  {' · '}{r.kind === 'contractor' ? 'contractor' : 'employee'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {live && (
                  r.inside ? (
                    <Button size="sm" variant="secondary" icon={<LogOut size={11} />}
                      loading={busy === r.id}
                      onClick={() => void run(r.id, () => permitPeopleApi.setInside(r.id, false))}>
                      Sign out
                    </Button>
                  ) : r.role !== 'standby' ? (
                    <Button size="sm" variant="ghost" icon={<LogIn size={11} />}
                      loading={busy === r.id}
                      onClick={() => void run(r.id, () => permitPeopleApi.setInside(r.id, true))}>
                      Sign in
                    </Button>
                  ) : null
                )}
                {canEdit && !settled && !r.inside && (
                  <button
                    disabled={busy === r.id}
                    aria-label={`Remove ${r.name}`}
                    onClick={() => void run(r.id, () => permitPeopleApi.remove(r.id))}
                    className="rounded-lg p-1.5 text-muted hover:bg-accent-soft hover:text-critical"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canEdit && !settled && (
        <Button size="sm" variant="secondary" icon={<Plus size={11} />} className="mt-2"
          onClick={() => setAddOpen(true)}>
          Name someone
        </Button>
      )}

      <AddPersonDialog
        open={addOpen} permitId={permitId}
        onClose={() => setAddOpen(false)}
        onAdded={() => { setAddOpen(false); load(); onChanged?.() }}
      />
    </section>
  )
}

function AddPersonDialog({
  open, permitId, onClose, onAdded,
}: { open: boolean; permitId: string; onClose: () => void; onAdded: () => void }) {
  const [people, setPeople] = useState<EligiblePerson[] | null>(null)
  const [chosen, setChosen] = useState<EligiblePerson | null>(null)
  const [role, setRole] = useState<AttendeeRole>('worker')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setChosen(null); setRole('worker'); setError(null); setPeople(null)
    permitPeopleApi.eligible(permitId)
      .then(setPeople)
      .catch(() => setPeople([]))
  }, [open, permitId])

  const submit = async () => {
    if (!chosen) return
    setBusy(true)
    setError(null)
    try {
      await permitPeopleApi.add(permitId, {
        ...(chosen.kind === 'employee' ? { employeeId: chosen.id } : { contractorWorkerId: chosen.id }),
        role,
      })
      onAdded()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not name that person.')
    } finally {
      setBusy(false)
    }
  }

  const assignable = (people ?? []).filter((p) => !p.blockedReason && !p.alreadyNamed)
  const blocked = (people ?? []).filter((p) => p.blockedReason)

  return (
    <Dialog
      error={error}
      open={open} onClose={onClose} title="Name someone on this permit"
      description="Only people the register says are fit for this work can be named."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => void submit()} loading={busy} disabled={!chosen}>Add to permit</Button>
        </>
      }
    >

      {people === null ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
        </div>
      ) : (
        <div className="space-y-5">
          <Select label="Role on the permit" value={role} onChange={(e) => setRole(e.target.value as AttendeeRole)}>
            {(Object.keys(ATTENDEE_ROLE_LABEL) as AttendeeRole[]).map((r) => (
              <option key={r} value={r}>{ATTENDEE_ROLE_LABEL[r]}</option>
            ))}
          </Select>

          <div>
            <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted">
              Available ({assignable.length})
            </p>
            {assignable.length === 0 ? (
              <p className="text-2xs text-muted">Nobody on this site is currently eligible for this permit type.</p>
            ) : (
              <ul className="max-h-52 space-y-1 overflow-y-auto">
                {assignable.map((p) => (
                  <li key={`${p.kind}-${p.id}`}>
                    <button
                      onClick={() => setChosen(p)}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left',
                        chosen?.id === p.id ? 'border-accent bg-accent-soft' : 'hover:bg-accent-soft/40',
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-ink">{p.name}</span>
                        <span className="block truncate text-2xs text-muted">
                          <span className="font-mono">{p.reference}</span> · {p.detail}
                        </span>
                      </span>
                      {p.kind === 'contractor' && <Badge tone="neutral">Contractor</Badge>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/*
            Blocked people are shown, not hidden. An issuer who cannot find someone
            assumes the system is broken and writes the name on the paper copy; one who
            sees "medical expired 3 days ago" goes and fixes it.
          */}
          {blocked.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted">
                Cannot be named ({blocked.length})
              </p>
              <ul className="max-h-40 space-y-1 overflow-y-auto">
                {blocked.map((p) => (
                  <li key={`${p.kind}-${p.id}`} className="rounded-lg border border-dashed px-3 py-1.5 opacity-80">
                    <p className="truncate text-sm text-ink-2">{p.name}</p>
                    <p className="truncate text-2xs text-critical">{p.blockedReason}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Dialog>
  )
}
