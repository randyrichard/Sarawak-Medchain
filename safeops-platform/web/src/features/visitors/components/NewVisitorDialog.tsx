import { useEffect, useState } from 'react'
import { visitorsApi } from '@/api/visitorsApi'
import { listEquipmentHolders, type EquipmentHolderOption } from '@/api/equipmentHolders'
import { ApiError } from '@/api/types'
import { useOrg } from '@/features/org/OrgContext'
import { Alert, Button, Dialog, Input, Select, Textarea } from '@/components/ui'

/**
 * Pre-registering a visit.
 *
 * The host is picked from the workforce register rather than typed, so the approval can
 * actually reach somebody and the record survives them leaving. The picker is the same
 * helper the equipment module uses - one implementation of "everybody you could name",
 * paged properly rather than asking for one oversized page.
 */
export function NewVisitorDialog({
  open, onClose, onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const { company, sites } = useOrg()

  const [name, setName] = useState('')
  const [idNumber, setIdNumber] = useState('')
  const [nationality, setNationality] = useState('')
  const [visitorCompany, setVisitorCompany] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [vehicleNumber, setVehicleNumber] = useState('')
  const [siteId, setSiteId] = useState('')
  const [hostEmployeeId, setHostEmployeeId] = useState('')
  const [purpose, setPurpose] = useState('')
  const [expectedArrival, setExpectedArrival] = useState('')
  const [expectedDeparture, setExpectedDeparture] = useState('')
  const [emergencyContactName, setEmergencyContactName] = useState('')
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('')
  const [notes, setNotes] = useState('')

  const [hosts, setHosts] = useState<EquipmentHolderOption[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !company) return
    setError(null)

    // Defaults that match what reception actually does: somebody standing at the desk now,
    // leaving at the end of the working day.
    const now = new Date()
    const end = new Date(now)
    end.setHours(17, 0, 0, 0)
    if (end <= now) end.setDate(end.getDate() + 1)
    setExpectedArrival(toLocalInput(now))
    setExpectedDeparture(toLocalInput(end))
    setSiteId(sites[0]?.id ?? '')

    listEquipmentHolders(company.id)
      .then((rows) => setHosts(rows.filter((r) => r.kind === 'employee')))
      .catch((e) => {
        /*
         * Said out loud, matching AssetHolderPanel and PeoplePanel.
         *
         * Swallowing this rendered the "add people under Employees or Contractors" hint,
         * which is a statement about the customer's data - and it was wrong whenever the
         * real cause was a failed request. That sends somebody to the workforce register
         * to add people who are already there. equipmentHolders.ts deliberately does not
         * swallow the error; two of its four callers did.
         */
        setHosts([])
        setError(e instanceof ApiError ? e.message : 'Could not load the list of people.')
      })
  }, [open, company, sites])

  const submit = async () => {
    if (!company) return
    setBusy(true)
    setError(null)
    try {
      const created = await visitorsApi.create({
        companyId: company.id,
        siteId,
        name,
        idNumber,
        nationality: nationality || undefined,
        visitorCompany: visitorCompany || undefined,
        phone: phone || undefined,
        email: email || undefined,
        vehicleNumber: vehicleNumber || undefined,
        hostEmployeeId: hostEmployeeId || undefined,
        purpose: purpose || undefined,
        expectedArrival: new Date(expectedArrival).toISOString(),
        expectedDeparture: new Date(expectedDeparture).toISOString(),
        notes: notes || undefined,
        emergencyContactName: emergencyContactName || undefined,
        emergencyContactPhone: emergencyContactPhone || undefined,
      })
      setName(''); setIdNumber(''); setNationality(''); setVisitorCompany('')
      setPhone(''); setEmail(''); setVehicleNumber(''); setHostEmployeeId('')
      setPurpose(''); setNotes(''); setEmergencyContactName(''); setEmergencyContactPhone('')
      onCreated(created.id)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not register that visit.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Register a visit"
      description="A pass and QR are generated automatically. The blacklist is checked on save."
      width="max-w-lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={() => void submit()}
            disabled={!name.trim() || !idNumber.trim() || !siteId || !expectedArrival || !expectedDeparture}>
            Pre-register
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="critical" onDismiss={() => setError(null)}>{error}</Alert>}

        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Full name" required value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="IC or passport" required value={idNumber}
            onChange={(e) => setIdNumber(e.target.value)} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Nationality" value={nationality} onChange={(e) => setNationality(e.target.value)} />
          <Input label="Company" value={visitorCompany} onChange={(e) => setVisitorCompany(e.target.value)} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Site" required value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value="">Select…</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select label="Host" value={hostEmployeeId}
            onChange={(e) => setHostEmployeeId(e.target.value)}
            hint="Named hosts must approve before the visitor can enter.">
            <option value="">No host</option>
            {hosts.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}{h.reference ? ` — ${h.reference}` : ''}
              </option>
            ))}
          </Select>
        </div>

        <Input label="Purpose of visit" value={purpose} onChange={(e) => setPurpose(e.target.value)}
          placeholder="e.g. Vendor meeting, pump commissioning" />

        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Expected arrival" type="datetime-local" required value={expectedArrival}
            onChange={(e) => setExpectedArrival(e.target.value)} />
          <Input label="Expected departure" type="datetime-local" required value={expectedDeparture}
            onChange={(e) => setExpectedDeparture(e.target.value)} />
        </div>

        <Input label="Vehicle number" value={vehicleNumber}
          onChange={(e) => setVehicleNumber(e.target.value)} placeholder="e.g. QAB 1234" />

        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Emergency contact" value={emergencyContactName}
            onChange={(e) => setEmergencyContactName(e.target.value)} />
          <Input label="Emergency phone" value={emergencyContactPhone}
            onChange={(e) => setEmergencyContactPhone(e.target.value)} />
        </div>

        <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Dialog>
  )
}

/** datetime-local wants local wall-clock time with no zone, not an ISO string. */
function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
