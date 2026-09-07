import { useEffect, useState } from 'react'
import { contractorsApi } from '@/api/contractorsApi'
import { forgetContractorCompanies } from '@/features/org/registers'
import { ApiError } from '@/api/types'
import { useOrg } from '@/features/org/OrgContext'
import { Alert, Button, Dialog } from '@/components/ui'
import {
  ContractorForm, contractorFormProblem, emptyContractorForm, toContractorPayload,
  type ContractorFormState,
} from './ContractorForm'

export function NewContractorDialog({
  open, onClose, onCreated,
}: { open: boolean; onClose: () => void; onCreated: (name: string) => void }) {
  const { company } = useOrg()
  const [form, setForm] = useState<ContractorFormState>(emptyContractorForm())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) { setForm(emptyContractorForm()); setError(null) }
  }, [open])

  const problem = contractorFormProblem(form)

  const submit = async () => {
    if (!company) return
    setBusy(true)
    setError(null)
    try {
      const created = await contractorsApi.createCompany(company.id, toContractorPayload(form))
      /*
       * The pickers cache this workspace's contractor companies, so without this a newly added
       * one is not offered by the forms that need it until the page is reloaded -
       * which reads as it not having saved.
       */
      forgetContractorCompanies(company.id)
      onCreated(created.name)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not add that contractor.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add a contractor"
      description="They get a contractor code automatically. Record the insurance expiry so it can be chased."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => void submit()} loading={busy} disabled={!!problem}>Add contractor</Button>
        </>
      }
    >
      {error && <Alert tone="critical" className="mb-3">{error}</Alert>}
      <ContractorForm value={form} onChange={setForm} />
      {problem && <p className="mt-2 text-2xs text-muted">{problem}</p>}
    </Dialog>
  )
}
