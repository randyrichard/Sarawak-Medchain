import { useState } from 'react'
import { api } from '@/api/client'
import { ApiError } from '@/api/types'
import { ASSET_CATEGORIES, CATEGORY_LABEL, type AssetCategory, type InspectionFrequency, FREQUENCY_LABEL } from '@/api/assets'
import { useOrg } from '@/features/org/OrgContext'
import { PEOPLE, useActor } from '@/features/incidents/lib'
import { Alert, Button, Dialog, Input, Select } from '@/components/ui'

export function NewAssetDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { company, sites } = useOrg()
  const actor = useActor()

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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!company) return
    setBusy(true)
    setError(null)
    try {
      await api.createAsset(
        {
          name, category, customCategory: category === 'custom' ? customCategory : undefined,
          serialNumber, manufacturer, model, companyId: company.id, siteId, department, owner, location, frequency,
        },
        actor,
      )
      setName(''); setSerialNumber(''); setManufacturer(''); setModel(''); setLocation(''); setDepartment('')
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
          <Input label="Department" required value={department} onChange={(e) => setDepartment(e.target.value)} />
          <Select label="Owner" required value={owner} onChange={(e) => setOwner(e.target.value)} hint="Becomes the default inspector.">
            <option value="" disabled>Select…</option>
            {PEOPLE.map((p) => <option key={p}>{p}</option>)}
          </Select>
        </div>
        <Input label="Exact location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Compressor room, bay 2" />
      </div>
    </Dialog>
  )
}
