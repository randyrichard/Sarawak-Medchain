import { useEffect, useState } from 'react'
import { employeesApi } from '@/api/employeesApi'
import type { EmployeeDetail } from '@/api/employees'
import { ApiError } from '@/api/types'
import { Button, Dialog } from '@/components/ui'
import {
  EmployeeForm, employeeFormProblem, toEmployeePayload, type EmployeeFormState,
} from './EmployeeForm'

const dateOnly = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : '')

export function EditEmployeeDialog({
  open, employee, onClose, onSaved,
}: { open: boolean; employee: EmployeeDetail; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<EmployeeFormState>(() => fromEmployee(employee))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-seed whenever the dialog opens, so a cancelled edit does not leave stale values
  // sitting in the form the next time it is opened.
  useEffect(() => {
    if (open) { setForm(fromEmployee(employee)); setError(null) }
  }, [open, employee])

  const problem = employeeFormProblem(form)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      // Sent whole rather than diffed: the server treats undefined as "leave alone", and
      // every field here is one the user could have just cleared on purpose.
      const payload = toEmployeePayload(form)
      await employeesApi.update(employee.id, {
        ...payload,
        email: payload.email ?? null,
        phone: payload.phone ?? null,
        hireDate: payload.hireDate ?? null,
        bloodGroup: payload.bloodGroup ?? null,
        medicalExpiry: payload.medicalExpiry ?? null,
        medicalNotes: payload.medicalNotes ?? null,
        position: payload.position ?? '',
        department: payload.department ?? '',
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
      title={`Edit ${employee.name}`}
      description={employee.employeeNo}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => void submit()} loading={busy} disabled={!!problem}>Save changes</Button>
        </>
      }
    >
      <EmployeeForm value={form} onChange={setForm} />
      {problem && <p className="mt-2 text-2xs text-muted">{problem}</p>}
    </Dialog>
  )
}

function fromEmployee(e: EmployeeDetail): EmployeeFormState {
  return {
    name: e.name,
    siteId: e.siteId,
    position: e.position ?? '',
    department: e.department ?? '',
    email: e.email ?? '',
    phone: e.phone ?? '',
    hireDate: dateOnly(e.hireDate),
    bloodGroup: e.bloodGroup ?? '',
    medicalExpiry: dateOnly(e.medicalExpiry),
    medicalNotes: e.medicalNotes ?? '',
  }
}
