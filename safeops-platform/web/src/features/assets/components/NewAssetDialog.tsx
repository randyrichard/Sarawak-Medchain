import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import { ApiError } from '@/api/types'
import { ASSET_CATEGORIES, CATEGORY_LABEL, type AssetCategory, type InspectionFrequency, FREQUENCY_LABEL } from '@/api/assets'
import { useOrg, useSiteScope } from '@/features/org/OrgContext'
import { useDepartments } from '@/features/org/departments'
import { usePeople, useActor } from '@/features/incidents/lib'
import { Alert, Button, Dialog, Input, SuggestSelect, PersonRegisterOptions, Select, Textarea } from '@/components/ui'
import { listEquipmentHolders, type EquipmentHolderOption } from '@/api/equipmentHolders'

export function NewAssetDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { company, sites } = useOrg()
  const actor = useActor()
  const people = usePeople()

  const departments = useDepartments()


  const siteScope = useSiteScope()



  const [name, setName] = useState('')
  const [category, setCategory] = useState<AssetCategory>('machinery')
  const [customCategory, setCustomCategory] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [model, setModel] = useState('')
  const [siteId, setSiteId] = useState('')
  const [department, setDepartment] = useState('')
  const [owner, setOwner] = useState('')
  const [location, setLocation] = useState('')
  const [frequency, setFrequency] = useState<InspectionFrequency>('monthly')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [commissionDate, setCommissionDate] = useState('')
  const [critical, setCritical] = useState(false)
  const [requiresCalibration, setRequiresCalibration] = useState(false)
  const [notes, setNotes] = useState('')
  /** "employee:<id>" or "contractor:<id>". One holder, so one control. */
  const [holder, setHolder] = useState('')
  const [holders, setHolders] = useState<EquipmentHolderOption[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !company) return
    listEquipmentHolders(company.id)
      .then(({ people, unavailable }) => {
        // Whatever arrived is offered; whatever did not is named. The two registers are
        // read independently, so one being unreachable no longer hides the other.
        setHolders(people)
        setError(unavailable.length ? unavailable.join(' ') : null)
      })
      .catch((e) => {
        setHolders([])
        setError(e instanceof ApiError ? e.message : 'Could not load the list of people.')
      })
  }, [open, company])

  const submit = async () => {
    if (!company) return
    setBusy(true)
    setError(null)
    try {
      const [holderKind, holderId] = holder ? holder.split(':') : []
      await api.createAsset(
        {
          name, category, customCategory: category === 'custom' ? customCategory : undefined,
          serialNumber, manufacturer, model, companyId: company.id, siteId, department, owner, location, frequency,
          purchaseDate: purchaseDate || undefined,
          commissionDate: commissionDate || undefined,
          critical,
          requiresCalibration,
          notes: notes || undefined,
          // At most one of these. The server refuses both, and this control can only set one.
          assignedEmployeeId: holderKind === 'employee' ? holderId : undefined,
          assignedContractorWorkerId: holderKind === 'contractor' ? holderId : undefined,
        },
        actor,
      )
      setName(''); setSerialNumber(''); setManufacturer(''); setModel(''); setLocation(''); setDepartment('')
      setPurchaseDate(''); setCommissionDate(''); setCritical(false)
      setRequiresCalibration(false); setNotes(''); setHolder('')
      onCreated()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not register the asset.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Register asset"
      description="A QR label and first inspection are created automatically."
      width="max-w-lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={() => void submit()}>Register & schedule</Button>
        </>
      }
    >
      <div className="max-h-[62vh] space-y-3.5 overflow-y-auto pr-1">
        {error && <Alert tone="critical">{error}</Alert>}
        <Input label="Asset name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CO₂ Extinguisher — Dock 2 pillar" />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value as AssetCategory)}>
            {ASSET_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </Select>
          {category === 'custom' ? (
            <Input label="Custom type" value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} placeholder="e.g. Hoist" />
          ) : (
            <Select label="Inspection frequency" value={frequency} onChange={(e) => setFrequency(e.target.value as InspectionFrequency)}>
              {(Object.keys(FREQUENCY_LABEL) as InspectionFrequency[]).map((f) => <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>)}
            </Select>
          )}
        </div>
        {category === 'custom' && (
          <Select label="Inspection frequency" value={frequency} onChange={(e) => setFrequency(e.target.value as InspectionFrequency)}>
            {(Object.keys(FREQUENCY_LABEL) as InspectionFrequency[]).map((f) => <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>)}
          </Select>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Serial number" required value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
          <Input label="Manufacturer" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Model" value={model} onChange={(e) => setModel(e.target.value)} />
          <Select label="Site" required value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value="" disabled>Select…</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SuggestSelect
            options={departments}
            label="Department"
            required
            value={department}
            onChange={setDepartment}
            placeholder="Select a department…"
            addLabel="Add a new department…"
          />
          <Select label="Owner" required value={owner} onChange={(e) => setOwner(e.target.value)} hint="Becomes the default inspector.">
            <option value="" disabled>Select…</option>
            {people.map((p) => <option key={p}>{p}</option>)}
          </Select>
        </div>
        <Input label="Exact location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Compressor room, bay 2" />

        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Purchase date" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
          <Input label="Commission date" type="date" value={commissionDate} onChange={(e) => setCommissionDate(e.target.value)} />
        </div>

        {/*
          Optional at registration and changeable later. Equipment often arrives before it
          is issued to anybody, and forcing a holder here would just get a placeholder name.
        */}
        <Select
          label="Assign to"
          value={holder}
          onChange={(e) => setHolder(e.target.value)}
          hint="Leave blank for pool equipment."
        >
          <option value="">Nobody yet (pool)</option>
          <PersonRegisterOptions people={holders} siteScope={siteScope} />
        </Select>

        <label className="flex items-start gap-2 text-2xs text-ink">
          <input type="checkbox" checked={critical} className="mt-0.5"
            onChange={(e) => setCritical(e.target.checked)} />
          <span>
            Safety-critical equipment
            <span className="block text-muted">
              Failure of this item hurts someone directly. Reminders name it as critical.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2 text-2xs text-ink">
          <input type="checkbox" checked={requiresCalibration} className="mt-0.5"
            onChange={(e) => setRequiresCalibration(e.target.checked)} />
          <span>
            Requires calibration
            <span className="block text-muted">
              Measuring instruments are treated this way automatically. Tick it for anything
              else that needs a certificate before it can go on a permit.
            </span>
          </span>
        </label>

        <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Statutory item, six-monthly thorough examination." />

        <p className="text-2xs text-muted">
          Photos and manuals are attached from the equipment profile once it is registered.
        </p>
      </div>
    </Dialog>
  )
}
