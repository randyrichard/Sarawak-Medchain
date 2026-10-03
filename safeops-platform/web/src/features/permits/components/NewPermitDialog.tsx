import { useMemo, useState } from 'react'
import { api } from '@/api/client'
import { ApiError } from '@/api/types'
import type { Actor } from '@/api/incidents'
import {
  PERMIT_CONTROLS, PERMIT_MAX_HOURS, PERMIT_TYPES, PERMIT_TYPE_LABEL, type PermitType,
} from '@/api/permits'
import { useOrg } from '@/features/org/OrgContext'
import { useDepartments } from '@/features/org/departments'
import { useContractorCompanies } from '@/features/org/registers'
import { usePeople } from '@/features/incidents/lib'
import { Alert, Button, Dialog, Input, SuggestSelect, Select, Textarea } from '@/components/ui'
import { cn } from '@/lib/cn'
import { PERMIT_TYPE_COLOR } from '../lib'
import { PeopleOptions } from '@/features/org/PeopleOptions'

/** Local datetime string for <input type="datetime-local">. */
function localInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * Permit request.
 *
 * Type is picked first and as a tile, because it determines the precautions, the maximum
 * duration and whether gas testing applies — showing that consequence up front prevents a
 * request being written against the wrong control set.
 */
export function NewPermitDialog({
  open, actor, onClose, onCreated,
}: {
  open: boolean
  actor: Actor
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const { company, site, sites } = useOrg()
  const people = usePeople()
  const departments = useDepartments()
  const contractorCompanies = useContractorCompanies()

  const [type, setType] = useState<PermitType>('hot_work')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [siteId, setSiteId] = useState(site?.id ?? '')
  const [department, setDepartment] = useState('Maintenance')
  const [location, setLocation] = useState('')
  const [applicant, setApplicant] = useState(actor.name)
  const [contractor, setContractor] = useState('')
  const [workerCount, setWorkerCount] = useState('2')
  const [validFrom, setValidFrom] = useState(() => localInput(new Date()))
  const [validTo, setValidTo] = useState(() => localInput(new Date(Date.now() + 4 * 3600_000)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const maxHours = PERMIT_MAX_HOURS[type]
  const requestedHours = useMemo(
    () => (new Date(validTo).getTime() - new Date(validFrom).getTime()) / 3600_000,
    [validFrom, validTo],
  )
  const tooLong = requestedHours > maxHours
  const requiredCount = PERMIT_CONTROLS[type].filter((c) => c.required).length
  const effectiveSite = siteId || site?.id || sites[0]?.id || ''
  const valid = title.trim() && location.trim() && effectiveSite && requestedHours > 0 && !tooLong

  const submit = async () => {
    if (!company) return
    setBusy(true); setError(null)
    try {
      const p = await api.createPermit({
        type, title: title.trim(), description: description.trim(),
        companyId: company.id, siteId: effectiveSite, department, location: location.trim(),
        applicant, contractor: contractor.trim() || undefined, workerCount: Number(workerCount) || 1,
        validFrom: new Date(validFrom).toISOString(), validTo: new Date(validTo).toISOString(),
      }, actor)
      onCreated(p.id)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create the permit.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      error={error}
      open={open}
      onClose={onClose}
      title="Request a permit to work"
      width="max-w-2xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={busy} disabled={!valid} onClick={() => void submit()}>Create draft</Button>
        </>
      }
    >
      <div className="space-y-4">

        <div>
          <p className="mb-1.5 text-xs font-semibold text-ink-2">Permit type</p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {PERMIT_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                aria-pressed={type === t}
                className={cn(
                  'rounded-lg border px-2.5 py-2 text-left text-2xs font-semibold transition-colors',
                  type === t ? 'text-ink' : 'text-ink-2 hover:bg-accent-soft/60',
                )}
                style={type === t ? { borderColor: PERMIT_TYPE_COLOR[t], background: 'var(--accent-soft)' } : undefined}
              >
                <span className="mb-1 block h-1.5 w-6 rounded-full" style={{ background: PERMIT_TYPE_COLOR[t] }} />
                {PERMIT_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-2xs text-muted">
            {requiredCount} required precaution(s) · maximum validity {maxHours}h
          </p>
        </div>

        <Input label="Work description" required value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Weld repair on jetty pipe support" />

        <Textarea label="Scope and method" rows={2} value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="What will be done, with what equipment…" />

        <div className="grid gap-x-3 gap-y-5 sm:grid-cols-2">
          <Select label="Site" required value={effectiveSite} onChange={(e) => setSiteId(e.target.value)}>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <SuggestSelect
            options={departments}
            label="Department"
            value={department}
            onChange={setDepartment}
            placeholder="Select a department…"
            addLabel="Add a new department…"
          />
          <Input label="Exact location" required value={location} onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Jetty 2, loading arm 3" />
          <Select label="Applicant" value={applicant} onChange={(e) => setApplicant(e.target.value)}>
            <PeopleOptions people={people} />
          </Select>
          <SuggestSelect
            options={contractorCompanies}
            label="Contractor (if any)"
            value={contractor}
            onChange={setContractor}
            placeholder="Select a contractor…"
            addLabel="Enter another contractor…"
          />
          <Input label="Number of workers" inputMode="numeric" value={workerCount}
            onChange={(e) => setWorkerCount(e.target.value.replace(/\D/g, '').slice(0, 3))} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-ink-2">
            Valid from
            <input type="datetime-local" value={validFrom} onChange={(e) => setValidFrom(e.target.value)}
              className="mt-1 h-9 coarse:h-11 w-full rounded-lg border bg-surface px-3 text-sm text-ink outline-none focus:border-accent" />
          </label>
          <label className="text-xs font-semibold text-ink-2">
            Valid to
            <input type="datetime-local" value={validTo} onChange={(e) => setValidTo(e.target.value)}
              className="mt-1 h-9 coarse:h-11 w-full rounded-lg border bg-surface px-3 text-sm text-ink outline-none focus:border-accent" />
          </label>
        </div>

        {tooLong && (
          <Alert tone="warning">
            A {PERMIT_TYPE_LABEL[type]} permit cannot exceed {maxHours} hours — the risk assessment
            behind it does not extend further. Requested: {requestedHours.toFixed(1)}h.
          </Alert>
        )}

        <p className="text-2xs text-muted">
          Creating a draft does not authorise work. You sign and submit it, then an issuing
          authority verifies the precautions on site before work can start.
        </p>
      </div>
    </Dialog>
  )
}
