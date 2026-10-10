import { useEffect, useState } from 'react'
import { contractorsApi } from '@/api/contractorsApi'
import type { ContractorCompanyRow } from '@/api/contractors'
import { ApiError } from '@/api/types'
import { Button, Dialog } from '@/components/ui'
import {
  ContractorForm, contractorFormProblem, toContractorPayload, type ContractorFormState,
} from './ContractorForm'

const dateOnly = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : '')

export function EditContractorDialog({
  open, contractor, onClose, onSaved,
}: { open: boolean; contractor: ContractorCompanyRow; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<ContractorFormState>(() => fromContractor(contractor))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-seed on open so a cancelled edit does not leave stale values in the form.
  useEffect(() => {
    if (open) { setForm(fromContractor(contractor)); setError(null) }
  }, [open, contractor])

  const problem = contractorFormProblem(form)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const payload = toContractorPayload(form)
      // Sent whole with explicit nulls: the server treats undefined as "leave alone", and
      // every field here is one the user could have just cleared on purpose.
      await contractorsApi.updateCompany(contractor.id, {
        ...payload,
        registrationNumber: payload.registrationNumber ?? '',
        contactPerson: payload.contactPerson ?? '',
        phone: payload.phone ?? '',
        address: payload.address ?? '',
        email: payload.email ?? null,
        insuranceExpiry: payload.insuranceExpiry ?? null,
      })
      onSaved()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save those changes.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      error={error}
      open={open}
      onClose={onClose}
      title={`Edit ${contractor.name}`}
      description={contractor.code}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => void submit()} loading={busy} disabled={!!problem}>Save Changes</Button>
        </>
      }
    >
      <ContractorForm value={form} onChange={setForm} />
      {problem && <p className="mt-2 text-2xs text-muted">{problem}</p>}
    </Dialog>
  )
}

function fromContractor(c: ContractorCompanyRow): ContractorFormState {
  return {
    name: c.name,
    registrationNumber: c.registrationNumber ?? '',
    contactPerson: c.contactPerson ?? '',
    phone: c.phone ?? '',
    email: c.email ?? '',
    address: c.address ?? '',
    insuranceExpiry: dateOnly(c.insuranceExpiry),
  }
}
