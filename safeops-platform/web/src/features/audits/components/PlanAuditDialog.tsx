import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import { ApiError } from '@/api/types'
import type { AuditPriority, AuditTemplate, AuditType } from '@/api/audits'
import { AUDIT_TYPES, AUDIT_TYPE_LABEL } from '@/api/audits'
import { useOrg } from '@/features/org/OrgContext'
import { PEOPLE, useActor } from '@/features/incidents/lib'
import { Alert, Badge, Button, Dialog, Input, Select, Textarea } from '@/components/ui'

export function PlanAuditDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { company, sites } = useOrg()
  const actor = useActor()

  const [templates, setTemplates] = useState<AuditTemplate[]>([])
  const [title, setTitle] = useState('')
  const [type, setType] = useState<AuditType>('internal')
  const [siteId, setSiteId] = useState('')
  const [department, setDepartment] = useState('Site-wide')
  const [leadAuditor, setLeadAuditor] = useState('')
  const [team, setTeam] = useState<string[]>([])
  const [templateId, setTemplateId] = useState('')
  const [scheduledFor, setScheduledFor] = useState('')
  const [durationDays, setDurationDays] = useState(1)
  const [priority, setPriority] = useState<AuditPriority>('Medium')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // inline custom template creation
  const [tplMode, setTplMode] = useState(false)
  const [tplName, setTplName] = useState('')
  const [tplItems, setTplItems] = useState('')

  useEffect(() => {
    if (open) void api.listAuditTemplates().then((t) => {
      setTemplates(t)
      if (!templateId && t.length) setTemplateId(t[0].id)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const createTemplate = async () => {
    setBusy(true)
    setError(null)
    try {
      const tpl = await api.createAuditTemplate(tplName, tplItems.split('\n'), actor)
      const list = await api.listAuditTemplates()
      setTemplates(list)
      setTemplateId(tpl.id)
      setTplMode(false)
      setTplName('')
      setTplItems('')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Template creation failed.')
    } finally {
      setBusy(false)
    }
  }

  const submit = async () => {
    if (!company) return
    setBusy(true)
    setError(null)
    try {
      await api.createAudit(
        { title, type, companyId: company.id, siteId, department, leadAuditor, team, templateId, scheduledFor, durationDays, priority },
        actor,
      )
      setTitle(''); setLeadAuditor(''); setTeam([]); setScheduledFor('')
      onCreated()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create the audit.')
    } finally {
      setBusy(false)
    }
  }

  const toggleTeam = (name: string) =>
    setTeam((t) => (t.includes(name) ? t.filter((x) => x !== name) : [...t, name]))

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Plan audit"
      description="Lead auditor is notified; the checklist becomes the digital working document."
      width="max-w-lg"
      footer={
        tplMode ? (
          <>
            <Button variant="secondary" onClick={() => setTplMode(false)}>Back</Button>
            <Button loading={busy} onClick={() => void createTemplate()}>Save template</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button loading={busy} onClick={() => void submit()}>Create audit</Button>
          </>
        )
      }
    >
      <div className="max-h-[62vh] space-y-3.5 overflow-y-auto pr-1">
        {error && <Alert tone="critical">{error}</Alert>}
        {tplMode ? (
          <>
            <Input label="Template name" required value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="e.g. Warehouse racking audit" />
            <Textarea label="Checklist items (one per line, min 3)" rows={7} value={tplItems} onChange={(e) => setTplItems(e.target.value)}
              placeholder={'Racking free of visible damage\nLoad signage displayed and legible\nAisle widths meet standard'} />
          </>
        ) : (
          <>
            <Input label="Audit title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Q3 contractor HSE audit — Miri" />
            <div className="grid grid-cols-2 gap-3">
              <Select label="Audit type" value={type} onChange={(e) => setType(e.target.value as AuditType)}>
                {AUDIT_TYPES.map((t) => <option key={t} value={t}>{AUDIT_TYPE_LABEL[t]}</option>)}
              </Select>
              <Select label="Site" required value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                <option value="" disabled>Select…</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Department" value={department} onChange={(e) => setDepartment(e.target.value)} />
              <Select label="Lead auditor" required value={leadAuditor} onChange={(e) => setLeadAuditor(e.target.value)}>
                <option value="" disabled>Select…</option>
                {PEOPLE.map((p) => <option key={p}>{p}</option>)}
              </Select>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-ink-2">Audit team (optional)</p>
              <div className="flex flex-wrap gap-1.5">
                {PEOPLE.filter((p) => p !== leadAuditor).slice(0, 10).map((p) => (
                  <button key={p} onClick={() => toggleTeam(p)}
                    className="rounded-full border px-2.5 py-1 text-2xs font-medium transition-colors"
                    style={team.includes(p) ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : undefined}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Select label="Checklist template" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.custom ? ' (custom)' : ''}</option>)}
              </Select>
              <button onClick={() => setTplMode(true)} className="text-2xs font-semibold text-accent hover:underline">
                + Create a custom template
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Input label="Date" required type="date" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
              <Input label="Duration (days)" type="number" min={1} max={10} value={durationDays}
                onChange={(e) => setDurationDays(Math.max(1, Number(e.target.value) || 1))} />
              <Select label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as AuditPriority)}>
                <option>High</option><option>Medium</option><option>Low</option>
              </Select>
            </div>
            {team.length > 0 && <Badge tone="accent">{team.length} team member(s) selected</Badge>}
          </>
        )}
      </div>
    </Dialog>
  )
}
