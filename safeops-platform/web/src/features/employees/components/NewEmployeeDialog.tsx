import { useEffect, useState } from 'react'
import { employeesApi } from '@/api/employeesApi'
import { forgetPeople } from '@/features/org/people'
import { ApiError } from '@/api/types'
import { useOrg } from '@/features/org/OrgContext'
import { Alert, Button, Dialog } from '@/components/ui'
import {
  EmployeeForm, employeeFormProblem, emptyEmployeeForm, toEmployeePayload,
  type EmployeeFormState,
} from './EmployeeForm'

export function NewEmployeeDialog({
  open, onClose, onCreated,
}: { open: boolean; onClose: () => void; onCreated: (name: string) => void }) {
  const { company, site } = useOrg()
  const [form, setForm] = useState<EmployeeFormState>(emptyEmployeeForm(site?.id ?? ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Default to the site already in the switcher — that is almost always the right answer,
  // and it saves a click on the common path.
  useEffect(() => {
    if (open) { setForm(emptyEmployeeForm(site?.id ?? '')); setError(null) }
  }, [open, site?.id])

  const problem = employeeFormProblem(form)

  const submit = async () => {
    if (!company) return
    setBusy(true)
    setError(null)
    try {
      const created = await employeesApi.create(company.id, toEmployeePayload(form))
      /*
       * The people-pickers cache this workspace's names, so without this a person hired
       * here does not appear in "assign owner" until the page is reloaded - which reads as
       * the new employee not having saved.
       */
      forgetPeople(company.id)
      onCreated(created.name)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not add that person.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add a person"
      description="They get an employee number automatically. Everything else can be filled in later."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => void submit()} loading={busy} disabled={!!problem}>Add to register</Button>
        </>
      }
    >
      {error && <Alert tone="critical" className="mb-3">{error}</Alert>}
      <EmployeeForm value={form} onChange={setForm} />
      {problem && <p className="mt-2 text-2xs text-muted">{problem}</p>}
    </Dialog>
  )
}
