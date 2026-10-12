import { useEffect, useState } from 'react'
import { contractorsApi } from '@/api/contractorsApi'
import type { ContractorCompanyRow } from '@/api/contractors'
import { ApiError } from '@/api/types'
import { useOrg } from '@/features/org/OrgContext'
import { Alert, Button, Dialog, Input, SuggestSelect, Select } from '@/components/ui'
import { usePositions } from '@/features/org/registers'

interface FormState {
  contractorCompanyId: string
  siteId: string
  name: string
  icPassport: string
  position: string
  medicalExpiry: string
  inductionExpiry: string
  emergencyName: string
  emergencyPhone: string
  emergencyRelation: string
}

const empty = (siteId: string): FormState => ({
  contractorCompanyId: '', siteId, name: '', icPassport: '', position: '',
  medicalExpiry: '', inductionExpiry: '', emergencyName: '', emergencyPhone: '', emergencyRelation: '',
})

function problemWith(f: FormState): string | null {
  if (!f.name.trim()) return 'A worker name is required.'
  if (!f.contractorCompanyId) return 'Choose which contractor they work for.'
  if (!f.siteId) return 'Choose the site they will be working at.'
  return null
}

export function NewWorkerDialog({
  open, contractors, onClose, onCreated,
}: {
  open: boolean
  contractors: ContractorCompanyRow[]
  onClose: () => void
  onCreated: (name: string) => void
}) {
  const { company, site, sites } = useOrg()
  const positions = usePositions()

  const [form, setForm] = useState<FormState>(empty(site?.id ?? ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) { setForm(empty(site?.id ?? '')); setError(null) }
  }, [open, site?.id])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((s) => ({ ...s, [k]: v }))
  const problem = problemWith(form)
  const active = contractors.filter((c) => c.status === 'active')

  const submit = async () => {
    if (!company) return
    setBusy(true)
    setError(null)
    try {
      const clean = (v: string) => (v.trim() ? v.trim() : undefined)
      const created = await contractorsApi.createWorker(company.id, {
        contractorCompanyId: form.contractorCompanyId,
        siteId: form.siteId,
        name: form.name.trim(),
        icPassport: clean(form.icPassport),
        position: clean(form.position),
        medicalExpiry: clean(form.medicalExpiry),
        inductionExpiry: clean(form.inductionExpiry),
        emergencyName: clean(form.emergencyName),
        emergencyPhone: clean(form.emergencyPhone),
        emergencyRelation: clean(form.emergencyRelation),
      })
      onCreated(created.name)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not register that worker.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      error={error}
      open={open}
      onClose={onClose}
      title="Register a Contractor Worker"
      description="They get a worker number automatically. Without a medical and induction date they cannot be checked in."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => void submit()} loading={busy} disabled={!!problem}>Register</Button>
        </>
      }
    >

      {active.length === 0 && (
        <Alert tone="warning" className="mb-3">
          There are no active contractors yet. Add the firm first — a worker has to belong to one.
        </Alert>
      )}

      <div className="space-y-5">
        <Input label="Full name" value={form.name} required autoFocus onChange={(e) => set('name', e.target.value)} />

        <div className="grid gap-3 sm:grid-cols-2">
          {/* Suspended firms are omitted: registering someone to a suspended contractor
              produces a worker who can never be admitted. */}
          <Select label="Contractor" value={form.contractorCompanyId}
            onChange={(e) => set('contractorCompanyId', e.target.value)}>
            <option value="">Choose a contractor…</option>
            {active.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select label="Site" value={form.siteId} onChange={(e) => set('siteId', e.target.value)}>
            <option value="">Choose a site…</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>

        <div className="grid gap-x-3 gap-y-5 sm:grid-cols-2">
          <Input label="IC / passport" value={form.icPassport} onChange={(e) => set('icPassport', e.target.value)}
            hint="What a gate check is done against." />
          <SuggestSelect
            options={positions}
            label="Position"
            value={form.position}
            onChange={(v) => set('position', v)}
            placeholder="Select a position…"
            addLabel="Add a new position…"
          />
        </div>

        <div className="grid gap-x-3 gap-y-5 sm:grid-cols-2">
          <Input label="Medical expires" type="date" value={form.medicalExpiry}
            onChange={(e) => set('medicalExpiry', e.target.value)} />
          <Input label="Induction expires" type="date" value={form.inductionExpiry}
            onChange={(e) => set('inductionExpiry', e.target.value)} />
        </div>

        <div className="grid gap-x-3 gap-y-5 sm:grid-cols-3">
          <Input label="Emergency contact" value={form.emergencyName}
            onChange={(e) => set('emergencyName', e.target.value)} />
          <Input label="Relationship" value={form.emergencyRelation}
            onChange={(e) => set('emergencyRelation', e.target.value)} />
          <Input label="Phone" type="tel" value={form.emergencyPhone}
            onChange={(e) => set('emergencyPhone', e.target.value)} />
        </div>
      </div>

      {problem && <p className="mt-2 text-2xs text-muted">{problem}</p>}
    </Dialog>
  )
}
