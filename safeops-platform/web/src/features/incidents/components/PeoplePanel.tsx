import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, HardHat, UserRound, BadgeCheck } from 'lucide-react'
import {
  PERSON_ROLE_LABEL, investigationApi,
  type IncidentPerson, type IncidentPersonRole,
} from '@/api/investigationApi'
import { listEquipmentHolders, type EquipmentHolderOption } from '@/api/equipmentHolders'
import { ApiError } from '@/api/types'
import { Alert, Badge, Button, Card, CardBody, Dialog, Input, PersonRegisterOptions, Select, Skeleton, Textarea, hasRegisteredPeople } from '@/components/ui'
import { useSiteScope } from '@/features/org/OrgContext'
import { fmtDate } from '../lib'
import { cn } from '@/lib/cn'

/**
 * Who was involved: witnesses, the injured, first aiders.
 *
 * Named from the workforce or contractor register where possible and always stored as
 * text as well, because a statement has to survive the witness leaving the company — and
 * an injured contractor or a member of the public may be in no register at all, which is
 * exactly when getting the name right matters most.
 *
 * Injury detail is only offered against somebody named as injured. The server refuses it
 * elsewhere; recording a body part against a witness would put somebody who was not hurt
 * into the injury figures.
 */
export function PeoplePanel({
  incidentId, companyId, canEdit,
}: {
  incidentId: string
  companyId: string
  canEdit: boolean
}) {

  const [rows, setRows] = useState<IncidentPerson[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const load = useCallback(() => {
    investigationApi.listPeople(incidentId)
      .then(setRows)
      .catch((e) => {
        setRows([])
        setError(e instanceof ApiError ? e.message : 'Could not load the people on this incident.')
      })
  }, [incidentId])

  useEffect(() => { load() }, [load])

  const remove = async (row: IncidentPerson) => {
    setBusy(row.id)
    setError(null)
    try {
      await investigationApi.removePerson(row.id)
      load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not remove that person.')
    } finally {
      setBusy(null)
    }
  }

  const injured = rows?.filter((r) => r.role === 'injured') ?? []
  const daysLost = injured.reduce((s, r) => s + (r.daysLost ?? 0), 0)

  return (
    <Card>
      <CardBody>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
          People involved
          {injured.length > 0 && (
            <span className="text-critical">
              ({injured.length} injured{daysLost > 0 ? `, ${daysLost} days lost` : ''})
            </span>
          )}
        </p>

        {error && <Alert tone="critical" className="mb-2" onDismiss={() => setError(null)}>{error}</Alert>}

        {rows === null ? (
          <div className="space-y-1.5">
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
          </div>
        ) : rows.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-4 text-center text-2xs text-muted">
            Nobody named yet. Naming witnesses from the register is what lets a statement be
            traced back years later.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {rows.map((r) => (
              <li key={r.id} className={cn(
                'rounded-lg border px-3 py-2',
                r.role === 'injured' && 'border-critical/50 bg-critical-soft/20',
              )}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm text-ink">
                      {r.source === 'contractor' && <HardHat size={11} className="text-muted" />}
                      {r.source === 'employee' && <UserRound size={11} className="text-muted" />}
                      {r.source === 'visitor' && <BadgeCheck size={11} className="text-muted" />}
                      {r.name}
                      <Badge tone={r.role === 'injured' ? 'critical' : 'neutral'}>{r.roleLabel}</Badge>
                      {r.source === 'external' && <Badge tone="neutral">Not in a register</Badge>}
                    </p>
                    {r.company && <p className="text-2xs text-muted">{r.company}</p>}

                    {r.role === 'injured' && (r.injuryType || r.bodyPart || r.daysLost !== null) && (
                      <p className="mt-0.5 text-2xs text-ink">
                        {[r.injuryType, r.bodyPart, r.treatment].filter(Boolean).join(' · ')}
                        {r.daysLost !== null && (
                          <span className="font-medium text-critical"> · {r.daysLost} days lost</span>
                        )}
                      </p>
                    )}

                    {r.statement && (
                      <blockquote className="mt-1 border-l-2 border-border pl-2 text-2xs italic text-ink">
                        {r.statement}
                      </blockquote>
                    )}
                    <p className="mt-0.5 text-2xs text-muted">
                      Named {fmtDate(r.addedAt)} by {r.addedBy}
                    </p>
                  </div>
                  {canEdit && (
                    <button
                      disabled={busy === r.id}
                      aria-label={`Remove ${r.name}`}
                      onClick={() => void remove(r)}
                      className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-accent-soft hover:text-critical"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {canEdit && (
          <Button size="sm" variant="secondary" icon={<Plus size={11} />} className="mt-2"
            onClick={() => setAddOpen(true)}>
            Name someone
          </Button>
        )}

        <AddPersonDialog
          open={addOpen} incidentId={incidentId} companyId={companyId}
          onClose={() => setAddOpen(false)}
          onAdded={() => { setAddOpen(false); load() }}
        />
      </CardBody>
    </Card>
  )
}

function AddPersonDialog({
  open, incidentId, companyId, onClose, onAdded,
}: {
  open: boolean
  incidentId: string
  companyId: string
  onClose: () => void
  onAdded: () => void
}) {
  const siteScope = useSiteScope()
  const [role, setRole] = useState<IncidentPersonRole>('witness')
  /** "employee:<id>", "contractor:<id>", or "" for somebody outside every register. */
  const [who, setWho] = useState('')
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [injuryType, setInjuryType] = useState('')
  const [bodyPart, setBodyPart] = useState('')
  const [treatment, setTreatment] = useState('')
  const [daysLost, setDaysLost] = useState('')
  const [statement, setStatement] = useState('')

  const [people, setPeople] = useState<EquipmentHolderOption[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasRegisterEntries = hasRegisteredPeople(people)

  useEffect(() => {
    if (!open) return
    setRole('witness'); setWho(''); setName(''); setCompany('')
    setInjuryType(''); setBodyPart(''); setTreatment(''); setDaysLost('')
    setStatement(''); setError(null); setPeople(null)

    // The same helper the equipment and visitor pickers use — one implementation of
    // "everybody you could name", paged properly rather than asking for one large page.
    listEquipmentHolders(companyId)
      .then(({ people, unavailable }) => {
        // Partial is better than nothing: offer what loaded and name what did not.
        setPeople(people)
        if (unavailable.length) setError(unavailable.join(' '))
      })
      .catch((e) => {
        setPeople([])
        setError(e instanceof ApiError ? e.message : 'Could not load the list of people.')
      })
  }, [open, companyId])

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const [kind, id] = who ? who.split(':') : []
      await investigationApi.addPerson(incidentId, {
        role,
        employeeId: kind === 'employee' ? id : undefined,
        contractorWorkerId: kind === 'contractor' ? id : undefined,
        name: who ? undefined : name.trim(),
        company: company.trim() || undefined,
        // Only sent for the injured. The server refuses it elsewhere; not sending it keeps
        // the two in agreement rather than relying on the refusal.
        injuryType: role === 'injured' ? (injuryType.trim() || undefined) : undefined,
        bodyPart: role === 'injured' ? (bodyPart.trim() || undefined) : undefined,
        treatment: role === 'injured' ? (treatment.trim() || undefined) : undefined,
        daysLost: role === 'injured' && daysLost ? Number(daysLost) : undefined,
        statement: statement.trim() || undefined,
      })
      onAdded()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not name that person.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Name somebody on this incident">
      <div className="space-y-3">
        {error && <Alert tone="critical" onDismiss={() => setError(null)}>{error}</Alert>}

        <Select label="Their part in it" value={role}
          onChange={(e) => setRole(e.target.value as IncidentPersonRole)}>
          {(Object.keys(PERSON_ROLE_LABEL) as IncidentPersonRole[]).map((r) => (
            <option key={r} value={r}>{PERSON_ROLE_LABEL[r]}</option>
          ))}
        </Select>

        {people === null ? (
          <Skeleton className="h-10 rounded-lg" />
        ) : (
          /*
           * Each group is rendered only when somebody is actually in it.
           *
           * Both were rendered unconditionally before, which on a workspace whose registers
           * are still empty - every new customer, on day one - produced two bold headings,
           * "Employees" and "Contractor workers", with nothing underneath them. An optgroup
           * label is not selectable by design, so people clicked them, nothing happened, and
           * the whole dropdown read as broken. Reported exactly that way, and confirmed in
           * the browser: one selectable option and two groups with zero children.
           *
           * When both are empty the field says so rather than presenting headings that
           * cannot be chosen - which also answers the question that follows, why is nobody
           * here, instead of leaving somebody to wonder whether the page failed to load.
           */
          <Select label="From the registers" value={who} onChange={(e) => setWho(e.target.value)}
            hint={hasRegisterEntries
              ? 'Leave blank for somebody who is not on the books.'
              : 'Nobody is in your registers yet, so type their name below.'}>
            <option value="">Not in a register — type their name below</option>
            <PersonRegisterOptions people={people} siteScope={siteScope} />
          </Select>
        )}

        {!who && (
          <div className="grid gap-x-3 gap-y-5 sm:grid-cols-2">
            <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="Company or department" value={company}
              onChange={(e) => setCompany(e.target.value)} />
          </div>
        )}

        {/* Offered only for the injured, matching what the server will accept. */}
        {role === 'injured' && (
          <>
            <div className="grid gap-x-3 gap-y-5 sm:grid-cols-2">
              <Input label="Injury" value={injuryType} onChange={(e) => setInjuryType(e.target.value)}
                placeholder="e.g. Laceration" />
              <Input label="Body part" value={bodyPart} onChange={(e) => setBodyPart(e.target.value)}
                placeholder="e.g. Left forearm" />
            </div>
            <div className="grid gap-x-3 gap-y-5 sm:grid-cols-2">
              <Input label="Treatment" value={treatment} onChange={(e) => setTreatment(e.target.value)}
                placeholder="e.g. On-site first aid" />
              <Input label="Days lost" type="number" min={0} value={daysLost}
                onChange={(e) => setDaysLost(e.target.value)} />
            </div>
          </>
        )}

        <Textarea label="Statement" value={statement} onChange={(e) => setStatement(e.target.value)}
          placeholder="In their own words." />

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void submit()} loading={busy} disabled={!who && !name.trim()}>
            Name them
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
