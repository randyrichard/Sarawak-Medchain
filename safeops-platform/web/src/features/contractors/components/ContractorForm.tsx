import type { Dispatch, SetStateAction } from 'react'
import { Input, Textarea } from '@/components/ui'

/**
 * The fields of a contracting firm, shared by the create and edit dialogs.
 *
 * One component rather than two nearly-identical forms: the validation rules are the
 * part most likely to change, and duplicating them is how a create form ends up
 * accepting something the edit form rejects.
 */
export interface ContractorFormState {
  name: string
  registrationNumber: string
  contactPerson: string
  phone: string
  email: string
  address: string
  insuranceExpiry: string
}

export const emptyContractorForm = (): ContractorFormState => ({
  name: '', registrationNumber: '', contactPerson: '', phone: '', email: '', address: '',
  insuranceExpiry: '',
})

export function contractorFormProblem(f: ContractorFormState): string | null {
  if (!f.name.trim()) return 'A contractor name is required.'
  if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) {
    return 'That email address does not look right.'
  }
  return null
}

/** Strips blanks so the API receives absent rather than empty-string fields. */
export function toContractorPayload(f: ContractorFormState) {
  const clean = (v: string) => (v.trim() ? v.trim() : undefined)
  return {
    name: f.name.trim(),
    registrationNumber: clean(f.registrationNumber),
    contactPerson: clean(f.contactPerson),
    phone: clean(f.phone),
    email: clean(f.email),
    address: clean(f.address),
    insuranceExpiry: clean(f.insuranceExpiry),
  }
}

export function ContractorForm({
  value, onChange,
}: {
  value: ContractorFormState
  onChange: Dispatch<SetStateAction<ContractorFormState>>
}) {
  const set = <K extends keyof ContractorFormState>(k: K, v: ContractorFormState[K]) =>
    onChange((s) => ({ ...s, [k]: v }))

  return (
    <div className="space-y-3">
      <Input label="Company name" value={value.name} required autoFocus
        onChange={(e) => set('name', e.target.value)} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Registration number" placeholder="199801012345"
          hint="Companies Commission (SSM) number."
          value={value.registrationNumber} onChange={(e) => set('registrationNumber', e.target.value)}
        />
        <Input
          label="Insurance expires" type="date"
          hint="Public liability / workmen's compensation."
          value={value.insuranceExpiry} onChange={(e) => set('insuranceExpiry', e.target.value)}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Contact person" value={value.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} />
        <Input label="Phone" type="tel" value={value.phone} onChange={(e) => set('phone', e.target.value)} />
      </div>

      <Input label="Email" type="email" value={value.email} onChange={(e) => set('email', e.target.value)} />
      <Textarea label="Address" rows={2} value={value.address} onChange={(e) => set('address', e.target.value)} />
    </div>
  )
}
