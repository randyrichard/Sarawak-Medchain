import { useCallback, useEffect, useState } from 'react'
import { Building2, Plus, Pencil, Power } from 'lucide-react'
import { orgAdminApi, type AdminSite } from '@/api/orgAdminApi'
import { ApiError } from '@/api/types'
import { useOrg } from '@/features/org/OrgContext'
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, Dialog, EmptyState, Input, Skeleton,
} from '@/components/ui'
import { TIMEZONES } from '@/api/reportsApi'
import { siteAllowanceLabel, siteAllowanceOf, siteInUseSummary, siteLimitNote } from '../lib'

/**
 * Sites.
 *
 * A site is never deleted here, only deactivated. Incidents, permits, assets and employees
 * point at it, and a site that stops existing takes their history with it - so the count of
 * what each one carries is shown next to it, and the only off-switch offered is reversible.
 */
type Draft = {
  name: string; code: string; city: string; address: string
  timezone: string; contactName: string; contactPhone: string
}

const EMPTY: Draft = {
  name: '', code: '', city: '', address: '',
  timezone: 'Asia/Kuching', contactName: '', contactPhone: '',
}

export function SitesSection() {
  const { company } = useOrg()
  const [rows, setRows] = useState<AdminSite[] | null>(null)
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ open: boolean; editing: AdminSite | null }>(
    { open: false, editing: null },
  )
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    if (!company) return
    setRows(null)
    orgAdminApi.listSites(company.id)
      .then(setRows)
      .catch((e) => {
        setRows([])
        setError(e instanceof ApiError ? e.message : 'Could not load the sites.')
      })
  }, [company])

  useEffect(load, [load])

  const say = (m: string) => { setFlash(m); setTimeout(() => setFlash(null), 5000) }

  const openNew = () => { setDraft(EMPTY); setDialog({ open: true, editing: null }) }
  const openEdit = (s: AdminSite) => {
    setDraft({
      name: s.name, code: s.code, city: s.city, address: s.address,
      timezone: s.timezone, contactName: s.contactName, contactPhone: s.contactPhone,
    })
    setDialog({ open: true, editing: s })
  }

  const save = async () => {
    if (!company) return
    setSaving(true)
    setError(null)
    try {
      if (dialog.editing) {
        await orgAdminApi.updateSite(company.id, dialog.editing.id, draft)
        say(`${draft.name} updated.`)
      } else {
        await orgAdminApi.createSite(company.id, draft)
        say(`${draft.name} created.`)
      }
      setDialog({ open: false, editing: null })
      load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save that site.')
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (s: AdminSite) => {
    if (!company) return
    setBusy(s.id)
    setError(null)
    try {
      await orgAdminApi.setSiteActive(company.id, s.id, !s.active)
      say(`${s.name} ${s.active ? 'deactivated' : 'reactivated'}.`)
      load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not change that site.')
    } finally {
      setBusy(null)
    }
  }

  const needle = q.trim().toLowerCase()
  const visible = (rows ?? []).filter((s) =>
    !needle || `${s.name} ${s.code} ${s.city}`.toLowerCase().includes(needle))

  /*
   * The plan's site allowance.
   *
   * Shown, and used to disable New site, so the limit is met as a sentence before it is met
   * as a failed request. The rows are already loaded, so counting here costs nothing and
   * needs no extra endpoint. The API refuses the write regardless of what this decides.
   */
  const allowance = siteAllowanceOf(rows, company?.entitlements)
  const allowanceLabel = siteAllowanceLabel(allowance)
  const planLabel = company ? company.plan.charAt(0).toUpperCase() + company.plan.slice(1) : ''

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader
          title="Sites"
          subtitle="Every location this organisation operates. Deactivate rather than delete — records point here."
          right={(
            <div className="flex items-center gap-2">
              {allowanceLabel && (
                <Badge tone={allowance.atLimit ? 'warning' : 'neutral'}>{allowanceLabel}</Badge>
              )}
              <Button
                size="sm"
                icon={<Plus size={14} />}
                onClick={openNew}
                disabled={allowance.atLimit}
                title={allowance.atLimit ? siteLimitNote(allowance, planLabel) : undefined}
              >
                New site
              </Button>
            </div>
          )}
        />
        <CardBody className="space-y-3">
          {error && <Alert tone="critical" onDismiss={() => setError(null)}>{error}</Alert>}
          {flash && <Alert tone="success" onDismiss={() => setFlash(null)}>{flash}</Alert>}

          {/*
            Not dismissible: it explains a disabled control, and an explanation the reader
            can close leaves a button that looks broken for no stated reason.
          */}
          {allowance.atLimit && (
            <Alert tone="warning">{siteLimitNote(allowance, planLabel)}</Alert>
          )}

          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, code or city"
          />

          {rows === null && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>}

          {rows !== null && visible.length === 0 && (
            <EmptyState icon={Building2} title={needle ? 'No site matches that search.' : 'No sites yet.'}>
              {needle
                ? 'Try a different name, code or city.'
                : 'Add the first location so incidents, permits and equipment have somewhere to belong.'}
            </EmptyState>
          )}

          {/*
            Rows wrap rather than being pinned to a min-width: on a phone that put Edit and
            Deactivate behind a sideways scroll nobody finds. The container keeps
            overflow-x-auto as a backstop for anything unexpectedly wide.
          */}
          {visible.length > 0 && (
            <div className="overflow-x-auto">
              <ul className="divide-y divide-line">
                {visible.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-semibold text-ink">{s.name}</span>
                        {s.code && <span className="font-mono text-2xs text-muted">{s.code}</span>}
                        <Badge tone={s.active ? 'good' : 'neutral'}>
                          {s.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </p>
                      <p className="mt-0.5 text-2xs text-muted">
                        {[s.city, s.address].filter(Boolean).join(' · ') || 'No address recorded'}
                        {' · '}{s.timezone}
                      </p>
                      {s.contactName && (
                        <p className="text-2xs text-muted">
                          Contact {s.contactName}
                          {s.contactPhone && <> · {s.contactPhone}</>}
                        </p>
                      )}
                      {/* What would be orphaned. Stated, so nobody expects a delete. */}
                      <p className="mt-0.5 text-2xs text-muted">{siteInUseSummary(s)}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="sm" variant="secondary" icon={<Pencil size={12} />} onClick={() => openEdit(s)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Power size={12} />}
                        disabled={busy === s.id}
                        onClick={() => toggle(s)}
                      >
                        {s.active ? 'Deactivate' : 'Reactivate'}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardBody>
      </Card>

      <Dialog
        open={dialog.open}
        onClose={() => setDialog({ open: false, editing: null })}
        title={dialog.editing ? `Edit ${dialog.editing.name}` : 'New site'}
        description="Sites scope incidents, permits, equipment and people."
        width="max-w-lg"
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDialog({ open: false, editing: null })}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || !draft.name.trim()}>
              {saving ? 'Saving…' : dialog.editing ? 'Save changes' : 'Create site'}
            </Button>
          </div>
        )}
      >
        <div className="grid gap-x-3 gap-y-5 sm:grid-cols-2">
          <Input
            label="Site name" required value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Bintulu Fabrication Yard"
          />
          <Input
            label="Code" value={draft.code}
            onChange={(e) => setDraft({ ...draft, code: e.target.value })}
            placeholder="BTU-01"
          />
          <Input
            label="City" value={draft.city}
            onChange={(e) => setDraft({ ...draft, city: e.target.value })}
          />
          <label className="space-y-1.5">
            <span className="block text-xs font-semibold text-ink-2">Timezone</span>
            <select
              value={draft.timezone}
              onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
              className="h-9 coarse:h-11 w-full rounded-lg border border-line bg-surface px-2 text-xs text-ink"
            >
              {TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <div className="sm:col-span-2">
            <Input
              label="Address" value={draft.address}
              onChange={(e) => setDraft({ ...draft, address: e.target.value })}
            />
          </div>
          <Input
            label="Contact person" value={draft.contactName}
            onChange={(e) => setDraft({ ...draft, contactName: e.target.value })}
          />
          <Input
            label="Contact phone" value={draft.contactPhone}
            onChange={(e) => setDraft({ ...draft, contactPhone: e.target.value })}
          />
        </div>
      </Dialog>
    </div>
  )
}
