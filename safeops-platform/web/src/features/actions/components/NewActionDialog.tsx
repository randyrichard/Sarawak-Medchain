import { useState } from 'react'
import { api } from '@/api/client'
import { ApiError } from '@/api/types'
import type { ActionPriority } from '@/api/incidents'
import type { CapaItem } from '@/api/capa'
import { useOrg } from '@/features/org/OrgContext'
import { useDepartments } from '@/features/org/departments'
import { usePeople, useActor } from '@/features/incidents/lib'
import { Button, Checkbox, Dialog, Input, SuggestSelect, Select, Textarea } from '@/components/ui'
import { PeopleOptions } from '@/features/org/PeopleOptions'
import { useFormCheck } from '@/lib/useFormCheck'
import { KEEPS_ACTION_EXTRAS } from '../lib'

/** Standalone corrective action (audit finding, inspection, MOC…). */
export function NewActionDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (action: CapaItem) => void }) {
  const { company, sites } = useOrg()
  const actor = useActor()
  const people = usePeople()

  const departments = useDepartments()


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

  /*
   * Said under each field, before sending. On a server the site went unchecked until the
   * reply, which read "String must contain at least 1 character(s)" and named no field.
   */
  const form = useFormCheck({
    title: !title.trim() && 'Say what must be done.',
    siteId: !siteId && 'Choose the site.',
    department: KEEPS_ACTION_EXTRAS && !department.trim() && 'Choose the department.',
    owner: !owner && 'Choose who will do it.',
    dueDate: !dueDate && 'Set the date it is due.',
  }, open)

  const submit = async () => {
    if (!company || !form.check()) return
    setBusy(true)
    setError(null)
    try {
      const created = await api.addStandaloneAction(
        { title, description, companyId: company.id, siteId, department, rootCause, owner, reviewer: reviewer || undefined, priority, dueDate, evidenceRequired },
        actor,
      )
      setTitle(''); setDescription(''); setOwner(''); setDueDate(''); setDepartment('')
      onCreated(created)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create the action.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      error={error}
      open={open}
      onClose={onClose}
      title="New Corrective Action"
      description="For findings outside an incident — audits, inspections, management of change."
      width="max-w-lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={() => void submit()}>Create & Assign</Button>
        </>
      }
    >
      <div className="space-y-5">
        <Input label="What must be done" required value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Replace expired fire extinguishers — Block C" error={form.errorFor('title')} />
        <Textarea label="Details (optional)" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className={KEEPS_ACTION_EXTRAS ? 'grid grid-cols-2 gap-x-3 gap-y-5' : undefined}>
          <Select label="Site" required value={siteId} onChange={(e) => setSiteId(e.target.value)} error={form.errorFor('siteId')}>
            <option value="" disabled>Select…</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          {KEEPS_ACTION_EXTRAS && (
            <SuggestSelect
              options={departments}
              label="Department"
              required
              value={department}
              onChange={setDepartment}
              placeholder="Select a department…"
              addLabel="Add a new department…"
              error={form.errorFor('department')}
            />
          )}
        </div>
        {KEEPS_ACTION_EXTRAS && (
          <Select label="Source / root cause" value={rootCause} onChange={(e) => setRootCause(e.target.value)}>
            {['Inspection finding', 'Audit finding (ISO 45001)', 'Audit finding (CIMAH)', 'Compliance schedule', 'Management of change', 'Observation'].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        )}
        <div className={KEEPS_ACTION_EXTRAS ? 'grid grid-cols-2 gap-x-3 gap-y-5' : undefined}>
          <Select label="Owner" required value={owner} onChange={(e) => setOwner(e.target.value)} error={form.errorFor('owner')}>
            <option value="" disabled>Select…</option>
            <PeopleOptions people={people} />
          </Select>
          {KEEPS_ACTION_EXTRAS && (
            <Select label="Reviewer" value={reviewer} onChange={(e) => setReviewer(e.target.value)} hint="Verifies completion evidence.">
              <option value="">HSE Manager (default)</option>
              <PeopleOptions people={people} />
            </Select>
          )}
        </div>
        <div className="grid grid-cols-2 items-start gap-x-3 gap-y-5">
          <Input label="Due date" required type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} error={form.errorFor('dueDate')} />
          <Select label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as ActionPriority)}>
            <option>High</option><option>Medium</option><option>Low</option>
          </Select>
        </div>
        <Checkbox label="Completion evidence required" checked={evidenceRequired} onChange={(e) => setEvidenceRequired(e.target.checked)} />
      </div>
    </Dialog>
  )
}
