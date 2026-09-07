import type { Dispatch, SetStateAction } from 'react'
import { Input, SuggestSelect, Select, Textarea } from '@/components/ui'
import { useDepartments } from '@/features/org/departments'
import { useOrg } from '@/features/org/OrgContext'

/**
 * The fields of an employee record, shared by the create and edit dialogs.
 *
 * One component rather than two nearly-identical forms: the validation rules and the
 * medical wording are the part most likely to be updated, and having them in two places
 * is how the create form ends up quietly accepting something the edit form rejects.
 */
export interface EmployeeFormState {
  name: string
  siteId: string
  position: string
  department: string
  email: string
  phone: string
  hireDate: string
  bloodGroup: string
  medicalExpiry: string
  medicalNotes: string
}

export const emptyEmployeeForm = (siteId = ''): EmployeeFormState => ({
  name: '', siteId, position: '', department: '', email: '', phone: '',
  hireDate: '', bloodGroup: '', medicalExpiry: '', medicalNotes: '',
})

/** Blood groups, so the field is countable and cannot hold "O positive-ish". */
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

/** Returns a message when the form cannot be submitted, or null when it can. */
export function employeeFormProblem(f: EmployeeFormState): string | null {
  if (!f.name.trim()) return 'A name is required.'
  if (!f.siteId) return 'Choose the site this person works at.'
  if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) {
    return 'That email address does not look right.'
  }
  return null
}

/** Strips blanks so the API receives absent rather than empty-string fields. */
export function toEmployeePayload(f: EmployeeFormState) {
  const clean = (v: string) => (v.trim() ? v.trim() : undefined)
  return {
    name: f.name.trim(),
    siteId: f.siteId,
    position: clean(f.position),
    department: clean(f.department),
    email: clean(f.email),
    phone: clean(f.phone),
    hireDate: clean(f.hireDate),
    bloodGroup: clean(f.bloodGroup),
    medicalExpiry: clean(f.medicalExpiry),
    medicalNotes: clean(f.medicalNotes),
  }
}

export function EmployeeForm({
  value, onChange, disableSite,
}: {
  value: EmployeeFormState
  onChange: Dispatch<SetStateAction<EmployeeFormState>>
  disableSite?: boolean
}) {
  const departments = useDepartments()

  const { sites } = useOrg()
  const set = <K extends keyof EmployeeFormState>(k: K, v: EmployeeFormState[K]) =>
    onChange((s) => ({ ...s, [k]: v }))

  return (
    <div className="space-y-3">
      <Input
        label="Full name" value={value.name} required autoFocus
        onChange={(e) => set('name', e.target.value)}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Site" value={value.siteId} disabled={disableSite}
          onChange={(e) => set('siteId', e.target.value)}
        >
          <option value="">Choose a site…</option>
          {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <SuggestSelect
          options={departments}
          label="Department"
          value={value.department}
          onChange={(v) => set('department', v)}
          placeholder="Select a department…"
          addLabel="Add a new department…"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Position" value={value.position} onChange={(e) => set('position', e.target.value)} />
        <Input label="Joined" type="date" value={value.hireDate} onChange={(e) => set('hireDate', e.target.value)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Email" type="email" value={value.email} onChange={(e) => set('email', e.target.value)} />
        <Input label="Phone" type="tel" value={value.phone} onChange={(e) => set('phone', e.target.value)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Medical expires" type="date" value={value.medicalExpiry}
          hint="Fitness-to-work certificate."
          onChange={(e) => set('medicalExpiry', e.target.value)}
        />
        <Select label="Blood group" value={value.bloodGroup} onChange={(e) => set('bloodGroup', e.target.value)}>
          <option value="">Not recorded</option>
          {BLOOD_GROUPS.map((b) => <option key={b} value={b}>{b}</option>)}
        </Select>
      </div>

      <Textarea
        label="Medical restrictions" rows={2}
        placeholder="No working at height, wears prescription glasses…"
        hint="Visible to HSE roles only. What a supervisor needs to know before assigning work."
        value={value.medicalNotes}
        onChange={(e) => set('medicalNotes', e.target.value)}
      />
    </div>
  )
}
