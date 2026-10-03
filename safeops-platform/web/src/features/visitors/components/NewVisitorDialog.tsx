import { useEffect, useState } from 'react'
import { visitorsApi } from '@/api/visitorsApi'
import { listEquipmentHolders, type EquipmentHolderOption } from '@/api/equipmentHolders'
import { ApiError } from '@/api/types'
import { useOrg, useSiteScope } from '@/features/org/OrgContext'
import { Button, Dialog, FormSection, FormSections, Input, Select, Textarea, personRegisterHint } from '@/components/ui'

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

  const siteScope = useSiteScope()
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
      .then(({ people, unavailable }) => {
        setHosts(people.filter((r) => r.kind === 'employee'))
        /*
         * Only the workforce half matters here - a host is an employee - so an unreadable
         * contractor register is not worth alarming somebody about on this form.
         */
        const workforce = unavailable.find((u) => /workforce/i.test(u))
        setError(workforce ?? null)
      })
      .catch((e) => {
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
      error={error}
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
      {/*
        Fifteen fields in one column, chunked into four named sections of two to five - the
        size working memory keeps track of (Miller's law). The gatehouse officer fills this
        in with a visitor standing at the window; "who, the visit, contacts, vehicle" is a
        sequence they can hold, fifteen loose boxes is not.
      */}
      <FormSections>
        <FormSection title="Who is visiting">
            <div className="grid gap-x-3 gap-y-5 sm:grid-cols-2">
              <Input label="Full name" required value={name} onChange={(e) => setName(e.target.value)} />
              <Input label="IC or passport" required value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)} />
            </div>
            <div className="grid gap-x-3 gap-y-5 sm:grid-cols-2">
              <Input label="Nationality" value={nationality} onChange={(e) => setNationality(e.target.value)} />
              <Input label="Company" value={visitorCompany} onChange={(e) => setVisitorCompany(e.target.value)} />
            </div>
        </FormSection>
        <FormSection title="The visit">
            <div className="grid gap-x-3 gap-y-5 sm:grid-cols-2">
              <Select label="Site" required value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                <option value="">Select…</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
              <Select label="Host" value={hostEmployeeId}
                onChange={(e) => setHostEmployeeId(e.target.value)}
                hint="Named hosts must approve before the visitor can enter.">
                <option value="">No host</option>
                {/*
                  "No host" is a real choice here, not an empty state, so it cannot double as
                  the explanation. Without this the select offered exactly one option and said
                  nothing about why - which on a site-scoped account is the same silence that
                  sent somebody looking for a broken request for most of an afternoon.
                */}
                {hosts.length === 0 && (
                  <option value="" disabled>{personRegisterHint(siteScope, 'Employees')}</option>
                )}
                {hosts.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}{h.reference ? ` — ${h.reference}` : ''}
                  </option>
                ))}
              </Select>
            </div>
          <Input label="Purpose of visit" value={purpose} onChange={(e) => setPurpose(e.target.value)}
            placeholder="e.g. Vendor meeting, pump commissioning" />
            <div className="grid gap-x-3 gap-y-5 sm:grid-cols-2">
              <Input label="Expected arrival" type="datetime-local" required value={expectedArrival}
                onChange={(e) => setExpectedArrival(e.target.value)} />
              <Input label="Expected departure" type="datetime-local" required value={expectedDeparture}
                onChange={(e) => setExpectedDeparture(e.target.value)} />
            </div>
        </FormSection>
        <FormSection title="Contact and emergency">
            <div className="grid gap-x-3 gap-y-5 sm:grid-cols-2">
              <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="grid gap-x-3 gap-y-5 sm:grid-cols-2">
              <Input label="Emergency contact" value={emergencyContactName}
                onChange={(e) => setEmergencyContactName(e.target.value)} />
              <Input label="Emergency phone" value={emergencyContactPhone}
                onChange={(e) => setEmergencyContactPhone(e.target.value)} />
            </div>
        </FormSection>
        <FormSection title="Vehicle and notes">
          <Input label="Vehicle number" value={vehicleNumber}
            onChange={(e) => setVehicleNumber(e.target.value)} placeholder="e.g. QAB 1234" />
          <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </FormSection>
      </FormSections>
    </Dialog>
  )
}

/** datetime-local wants local wall-clock time with no zone, not an ISO string. */
function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
