import { useEffect, useState } from 'react'
import { Building2, CalendarDays, Clock, Layers, Plus, Save, Trash2 } from 'lucide-react'
import { api } from '@/api/client'
import { ApiError } from '@/api/types'
import type { BusinessUnit, Holiday, JobPosition, OrgSettings, ShiftPattern } from '@/api/admin'
import { useOrg } from '@/features/org/OrgContext'
import {
  Alert, Avatar, Badge, Button, Card, CardBody, CardHeader, Dialog, Input, Select, Skeleton, Tabs,
  type TabItem,
} from '@/components/ui'
import { useAdminActor } from '../lib'

type Tab = 'profile' | 'structure' | 'positions' | 'shifts' | 'holidays'

export function OrganizationSection() {
  const { company, sites } = useOrg()
  const [tab, setTab] = useState<Tab>('profile')

  const tabs: TabItem<Tab>[] = [
    { value: 'profile', label: 'Profile & Branding' },
    { value: 'structure', label: 'Structure' },
    { value: 'positions', label: 'Job Positions' },
    { value: 'shifts', label: 'Shift Patterns' },
    { value: 'holidays', label: 'Holidays' },
  ]

  return (
    <div className="space-y-4">
      <Tabs items={tabs} value={tab} onChange={setTab} />
      {tab === 'profile' && company && <ProfilePanel companyId={company.id} />}
      {tab === 'structure' && <StructurePanel sites={sites} />}
      {tab === 'positions' && <PositionsPanel />}
      {tab === 'shifts' && <ShiftsPanel />}
      {tab === 'holidays' && <HolidaysPanel />}
    </div>
  )
}

function ProfilePanel({ companyId }: { companyId: string }) {
  const actor = useAdminActor()
  const [s, setS] = useState<OrgSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { api.adminGetOrgSettings(companyId).then(setS) }, [companyId])

  const save = async () => {
    if (!s) return
    setBusy(true); setError(null)
    try {
      await api.adminUpdateOrgSettings(companyId, s, actor)
      setFlash(true); setTimeout(() => setFlash(false), 2500)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save settings.')
    } finally { setBusy(false) }
  }

  if (!s) return <Card className="p-5"><Skeleton className="h-64 w-full" /></Card>
  const set = (p: Partial<OrgSettings>) => setS({ ...s, ...p })
  const ACCENTS = ['#2a78d6', '#1baf7a', '#4a3aa7', '#eb6834', '#e34948', '#0d366b']

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader title="Company profile" subtitle="Legal identity, locale and default timezone" />
        <CardBody className="space-y-3.5">
          {error && <Alert tone="critical">{error}</Alert>}
          {flash && <Alert tone="success">Organisation settings saved.</Alert>}
          <div className="grid grid-cols-2 gap-3">
            <Input label="Display name" value={s.displayName} onChange={(e) => set({ displayName: e.target.value })} />
            <Input label="Legal entity name" value={s.legalName} onChange={(e) => set({ legalName: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input label="Industry" value={s.industry} onChange={(e) => set({ industry: e.target.value })} />
            <Select label="Timezone" value={s.timezone} onChange={(e) => set({ timezone: e.target.value })}>
              {['Asia/Kuching', 'Asia/Kuala_Lumpur', 'Asia/Singapore', 'Asia/Jakarta', 'UTC'].map((t) => <option key={t}>{t}</option>)}
            </Select>
            <Select label="Language" value={s.language} onChange={(e) => set({ language: e.target.value })}>
              {['English', 'Bahasa Malaysia', 'Chinese (Simplified)'].map((l) => <option key={l}>{l}</option>)}
            </Select>
          </div>
          <Button icon={<Save size={14} />} loading={busy} onClick={() => void save()}>Save changes</Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Branding" subtitle="Logo initials and accent colour" />
        <CardBody className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold text-white" style={{ background: s.brandAccent }}>{s.logoInitials}</span>
            <Input label="Logo initials" value={s.logoInitials} maxLength={3} onChange={(e) => set({ logoInitials: e.target.value.toUpperCase().slice(0, 3) })} className="w-24" />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-ink-2">Accent colour</p>
            <div className="flex flex-wrap gap-2">
              {ACCENTS.map((c) => (
                <button key={c} onClick={() => set({ brandAccent: c })}
                  className="h-8 w-8 rounded-lg border-2 transition-transform hover:scale-110"
                  style={{ background: c, borderColor: s.brandAccent === c ? 'var(--ink)' : 'transparent' }} aria-label={`Accent ${c}`} />
              ))}
            </div>
          </div>
          <p className="text-2xs text-muted">Branding applies to reports, certificates and the sign-in screen.</p>
        </CardBody>
      </Card>
    </div>
  )
}

function StructurePanel({ sites }: { sites: { id: string; short: string; name: string; city: string; headcount: number }[] }) {
  const [units, setUnits] = useState<BusinessUnit[] | null>(null)
  const actor = useAdminActor()
  const [addOpen, setAddOpen] = useState(false)

  const load = () => api.adminListUnits().then(setUnits)
  useEffect(() => { load() }, [])

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader title="Sites" subtitle={`${sites.length} operating sites`} />
        <CardBody className="space-y-2">
          {sites.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-lg border px-3.5 py-2.5">
              <Building2 size={15} className="text-accent" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{s.name}</p>
                <p className="text-2xs text-muted">{s.city} · {s.headcount.toLocaleString()} workers</p>
              </div>
            </div>
          ))}
          <p className="text-2xs text-muted">Sites and departments are managed in the Organization module; business units below group them for reporting.</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Business units" subtitle="Reporting groups across sites" right={<Button size="sm" variant="ghost" icon={<Plus size={12} />} onClick={() => setAddOpen(true)}>Add</Button>} />
        <CardBody className="space-y-2">
          {units === null ? <Skeleton className="h-32 w-full" /> : units.map((u) => (
            <div key={u.id} className="flex items-center gap-3 rounded-lg border px-3.5 py-2.5">
              <Layers size={15} className="text-accent" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{u.name}</p>
                <p className="flex items-center gap-1 text-2xs text-muted"><Avatar name={u.lead} size={13} /> {u.lead} · {u.sites} site(s)</p>
              </div>
              <button onClick={() => void api.adminRemoveConfigItem('unit', u.id, actor).then(load)} className="rounded p-1 text-muted hover:text-critical" aria-label="Remove"><Trash2 size={13} /></button>
            </div>
          ))}
        </CardBody>
      </Card>

      <AddItemDialog open={addOpen} kind="unit" title="Add business unit" fields={[{ key: 'name', label: 'Name' }, { key: 'lead', label: 'Lead' }, { key: 'sites', label: 'Site count', type: 'number' }]} onClose={() => setAddOpen(false)} onAdded={() => { setAddOpen(false); load() }} />
    </div>
  )
}

function PositionsPanel() {
  const [items, setItems] = useState<JobPosition[] | null>(null)
  const actor = useAdminActor()
  const [addOpen, setAddOpen] = useState(false)
  const load = () => api.adminListPositions().then(setItems)
  useEffect(() => { load() }, [])
  return (
    <Card>
      <CardHeader title="Job positions" subtitle="Standardised titles and establishment headcount" right={<Button size="sm" icon={<Plus size={13} />} onClick={() => setAddOpen(true)}>Add position</Button>} />
      <CardBody className="space-y-2">
        {items === null ? <Skeleton className="h-40 w-full" /> : items.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-lg border px-3.5 py-2.5">
            <div className="min-w-0 flex-1"><p className="text-sm font-medium text-ink">{p.title}</p><p className="text-2xs text-muted">{p.department}</p></div>
            <Badge tone="neutral">{p.headcount} est.</Badge>
            <button onClick={() => void api.adminRemoveConfigItem('position', p.id, actor).then(load)} className="rounded p-1 text-muted hover:text-critical" aria-label="Remove"><Trash2 size={13} /></button>
          </div>
        ))}
      </CardBody>
      <AddItemDialog open={addOpen} kind="position" title="Add job position" fields={[{ key: 'title', label: 'Title' }, { key: 'department', label: 'Department' }, { key: 'headcount', label: 'Establishment headcount', type: 'number' }]} onClose={() => setAddOpen(false)} onAdded={() => { setAddOpen(false); load() }} />
    </Card>
  )
}

function ShiftsPanel() {
  const [items, setItems] = useState<ShiftPattern[] | null>(null)
  const actor = useAdminActor()
  const [addOpen, setAddOpen] = useState(false)
  const load = () => api.adminListShifts().then(setItems)
  useEffect(() => { load() }, [])
  return (
    <Card>
      <CardHeader title="Shift patterns" subtitle="Working-time templates used for fatigue and coverage analysis" right={<Button size="sm" icon={<Plus size={13} />} onClick={() => setAddOpen(true)}>Add shift</Button>} />
      <CardBody className="space-y-2">
        {items === null ? <Skeleton className="h-32 w-full" /> : items.map((sp) => (
          <div key={sp.id} className="flex items-center gap-3 rounded-lg border px-3.5 py-2.5">
            <Clock size={15} className="text-accent" />
            <div className="min-w-0 flex-1"><p className="text-sm font-medium text-ink">{sp.name}</p><p className="text-2xs text-muted">{sp.start}–{sp.end} · {sp.days}</p></div>
            <button onClick={() => void api.adminRemoveConfigItem('shift', sp.id, actor).then(load)} className="rounded p-1 text-muted hover:text-critical" aria-label="Remove"><Trash2 size={13} /></button>
          </div>
        ))}
      </CardBody>
      <AddItemDialog open={addOpen} kind="shift" title="Add shift pattern" fields={[{ key: 'name', label: 'Name' }, { key: 'start', label: 'Start (HH:MM)' }, { key: 'end', label: 'End (HH:MM)' }, { key: 'days', label: 'Days' }]} onClose={() => setAddOpen(false)} onAdded={() => { setAddOpen(false); load() }} />
    </Card>
  )
}

function HolidaysPanel() {
  const [items, setItems] = useState<Holiday[] | null>(null)
  const actor = useAdminActor()
  const [addOpen, setAddOpen] = useState(false)
  const load = () => api.adminListHolidays().then(setItems)
  useEffect(() => { load() }, [])
  return (
    <Card>
      <CardHeader title="Holiday calendar" subtitle="Public and regional holidays affecting scheduling" right={<Button size="sm" icon={<Plus size={13} />} onClick={() => setAddOpen(true)}>Add holiday</Button>} />
      <CardBody className="space-y-2">
        {items === null ? <Skeleton className="h-40 w-full" /> : items.slice().sort((a, b) => a.date.localeCompare(b.date)).map((h) => (
          <div key={h.id} className="flex items-center gap-3 rounded-lg border px-3.5 py-2.5">
            <CalendarDays size={15} className="text-accent" />
            <div className="min-w-0 flex-1"><p className="text-sm font-medium text-ink">{h.name}</p><p className="text-2xs text-muted">{h.date}</p></div>
            <Badge tone="neutral">{h.scope}</Badge>
            <button onClick={() => void api.adminRemoveConfigItem('holiday', h.id, actor).then(load)} className="rounded p-1 text-muted hover:text-critical" aria-label="Remove"><Trash2 size={13} /></button>
          </div>
        ))}
      </CardBody>
      <AddItemDialog open={addOpen} kind="holiday" title="Add holiday" fields={[{ key: 'name', label: 'Name' }, { key: 'date', label: 'Date', type: 'date' }, { key: 'scope', label: 'Scope' }]} onClose={() => setAddOpen(false)} onAdded={() => { setAddOpen(false); load() }} />
    </Card>
  )
}

function AddItemDialog({
  open, kind, title, fields, onClose, onAdded,
}: {
  open: boolean
  kind: 'position' | 'shift' | 'holiday' | 'unit'
  title: string
  fields: { key: string; label: string; type?: string }[]
  onClose: () => void
  onAdded: () => void
}) {
  const actor = useAdminActor()
  const [data, setData] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true); setError(null)
    try {
      await api.adminAddConfigItem(kind, data, actor)
      setData({})
      onAdded()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not add.')
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onClose={onClose} title={title}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={() => void submit()}>Add</Button></>}>
      <div className="space-y-3">
        {error && <Alert tone="critical">{error}</Alert>}
        {fields.map((f) => (
          <Input key={f.key} label={f.label} type={f.type ?? 'text'} value={data[f.key] ?? ''} onChange={(e) => setData((d) => ({ ...d, [f.key]: e.target.value }))} />
        ))}
      </div>
    </Dialog>
  )
}
