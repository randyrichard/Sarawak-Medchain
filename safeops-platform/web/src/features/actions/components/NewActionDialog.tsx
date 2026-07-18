import { useState } from 'react'
import { api } from '@/api/client'
import { ApiError } from '@/api/types'
import type { ActionPriority } from '@/api/incidents'
import { useOrg } from '@/features/org/OrgContext'
import { PEOPLE, useActor } from '@/features/incidents/lib'
import { Alert, Button, Checkbox, Dialog, Input, Select, Textarea } from '@/components/ui'

/** Standalone corrective action (audit finding, inspection, MOC…). */
export function NewActionDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { company, sites } = useOrg()
  const actor = useActor()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [siteId, setSiteId] = useState('')
  const [department, setDepartment] = useState('')
  const [rootCause, setRootCause] = useState('Inspection finding')
  const [owner, setOwner] = useState('')
  const [reviewer, setReviewer] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState<ActionPriority>('Medium')
  const [evidenceRequired, setEvidenceRequired] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!company) return
    setBusy(true)
    setError(null)
    try {
      await api.addStandaloneAction(
        { title, description, companyId: company.id, siteId, department, rootCause, owner, reviewer: reviewer || undefined, priority, dueDate, evidenceRequired },
        actor,
      )
      setTitle(''); setDescription(''); setOwner(''); setDueDate(''); setDepartment('')
      onCreated()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create the action.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New corrective action"
      description="For findings outside an incident — audits, inspections, management of change."
      width="max-w-lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={() => void submit()}>Create & assign</Button>
        </>
      }
    >
      <div className="space-y-3.5">
        {error && <Alert tone="critical">{error}</Alert>}
        <Input label="What must be done" required value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Replace expired fire extinguishers — Block C" />
        <Textarea label="Details (optional)" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Site" required value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value="" disabled>Select…</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Input label="Department" required value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Warehouse" />
        </div>
        <Select label="Source / root cause" value={rootCause} onChange={(e) => setRootCause(e.target.value)}>
          {['Inspection finding', 'Audit finding (ISO 45001)', 'Audit finding (CIMAH)', 'Compliance schedule', 'Management of change', 'Observation'].map((r) => (
            <option key={r}>{r}</option>
          ))}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Owner" required value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="" disabled>Select…</option>
            {PEOPLE.map((p) => <option key={p}>{p}</option>)}
          </Select>
          <Select label="Reviewer" value={reviewer} onChange={(e) => setReviewer(e.target.value)} hint="Verifies completion evidence.">
            <option value="">HSE Manager (default)</option>
            {PEOPLE.map((p) => <option key={p}>{p}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-2 items-end gap-3">
          <Input label="Due date" required type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <Select label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as ActionPriority)}>
            <option>High</option><option>Medium</option><option>Low</option>
          </Select>
        </div>
        <Checkbox label="Completion evidence required" checked={evidenceRequired} onChange={(e) => setEvidenceRequired(e.target.checked)} />
      </div>
    </Dialog>
  )
}
