import { useCallback, useEffect, useState } from 'react'
import { Network, Plus, Pencil, Power } from 'lucide-react'
import {
  orgAdminApi, type AdminDepartment, type AdminSite,
} from '@/api/orgAdminApi'
import { adminApi } from '@/api/adminApi'
import type { AdminUser } from '@/api/admin'
import { ApiError } from '@/api/types'
import { useOrg } from '@/features/org/OrgContext'
import { forgetDepartments } from '@/features/org/departments'
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, Dialog, EmptyState, Input, Skeleton,
} from '@/components/ui'
import { departmentInUseSummary } from '../lib'

/**
 * Departments.
 *
 * Hang off a site, and carry an accountable manager who is a real user rather than a typed
 * name - the visitor register showed what happens when identity is inferred from a display
 * name. Deactivating hides a department from the pickers; the incidents, visitors and
 * permits that already name it keep reading correctly.
 */
export function DepartmentsSection() {
  const { company } = useOrg()
  const [rows, setRows] = useState<AdminDepartment[] | null>(null)
  const [sites, setSites] = useState<AdminSite[]>([])
  const [people, setPeople] = useState<AdminUser[]>([])
  const [siteFilter, setSiteFilter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dialog, setDialog] = useState<{ open: boolean; editing: AdminDepartment | null }>(
    { open: false, editing: null },
  )
  const [draft, setDraft] = useState({ name: '', code: '', siteId: '', managerUserId: '' })

  const load = useCallback(() => {
    if (!company) return
    setRows(null)
    Promise.all([
      orgAdminApi.listDepartments(company.id),
      orgAdminApi.listSites(company.id),
      adminApi.listUsers(company.id, {}).catch(() => [] as AdminUser[]),
    ])
      .then(([d, s, u]) => { setRows(d); setSites(s); setPeople(u) })
      .catch((e) => {
        setRows([])
        setError(e instanceof ApiError ? e.message : 'Could not load the departments.')
      })
  }, [company])

  useEffect(load, [load])

  const say = (m: string) => { setFlash(m); setTimeout(() => setFlash(null), 5000) }

  const openNew = () => {
    // Only active sites can take a new department; an inactive one is on its way out.
    setDraft({ name: '', code: '', siteId: sites.find((s) => s.active)?.id ?? '', managerUserId: '' })
    setDialog({ open: true, editing: null })
  }

  const openEdit = (d: AdminDepartment) => {
    setDraft({
      name: d.name, code: d.code, siteId: d.siteId, managerUserId: d.manager?.id ?? '',
    })
    setDialog({ open: true, editing: d })
  }

  const save = async () => {
    if (!company) return
    setSaving(true)
    setError(null)
    try {
      const managerUserId = draft.managerUserId || null
      if (dialog.editing) {
        await orgAdminApi.updateDepartment(company.id, dialog.editing.id, {
          name: draft.name, code: draft.code, managerUserId,
        })
        say(`${draft.name} updated.`)
      } else {
        await orgAdminApi.createDepartment(company.id, {
          name: draft.name, code: draft.code, siteId: draft.siteId, managerUserId,
        })
        /*
         * The suggestion lists cache this workspace's departments, so without this a
         * department created here is not offered by the incident, asset or permit forms
         * until the page is reloaded - which reads as it not having saved.
         */
        forgetDepartments(company.id)
        say(`${draft.name} created.`)
      }
      setDialog({ open: false, editing: null })
      load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save that department.')
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (d: AdminDepartment) => {
    if (!company) return
    setBusy(d.id)
    setError(null)
    try {
      await orgAdminApi.setDepartmentActive(company.id, d.id, !d.active)
      say(`${d.name} ${d.active ? 'deactivated' : 'reactivated'}.`)
      load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not change that department.')
    } finally {
      setBusy(null)
    }
  }

  const visible = (rows ?? []).filter((d) => !siteFilter || d.siteId === siteFilter)

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader
          title="Departments"
          subtitle="Grouped by site, with the person accountable for each."
          right={(
            <Button size="sm" icon={<Plus size={14} />} onClick={openNew} disabled={sites.length === 0}>
              New department
            </Button>
          )}
        />
        <CardBody className="space-y-3">
          {error && <Alert tone="critical" onDismiss={() => setError(null)}>{error}</Alert>}
          {flash && <Alert tone="success" onDismiss={() => setFlash(null)}>{flash}</Alert>}

          <label className="flex items-center gap-2 text-xs text-muted">
            Site
            <select
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value)}
              className="h-8 rounded-lg border border-line bg-surface px-2 text-xs text-ink"
            >
              <option value="">All sites</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>

          {rows === null && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>}

          {rows !== null && visible.length === 0 && (
            <EmptyState icon={Network} title="No departments yet.">
              Departments group people and records inside a site. Add one to start
              filtering incidents and permits by area.
            </EmptyState>
          )}

          {visible.length > 0 && (
            <div className="overflow-x-auto">
              <ul className="divide-y divide-line">
                {visible.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-semibold text-ink">{d.name}</span>
                        {d.code && <span className="font-mono text-2xs text-muted">{d.code}</span>}
                        <Badge tone={d.active ? 'good' : 'neutral'}>
                          {d.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </p>
                      <p className="mt-0.5 text-2xs text-muted">
                        {d.siteName}
                        {' · '}
                        {d.manager ? `Manager ${d.manager.name}` : 'No manager assigned'}
                      </p>
                      <p className="text-2xs text-muted">{departmentInUseSummary(d)}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="sm" variant="secondary" icon={<Pencil size={12} />} onClick={() => openEdit(d)}>
                        Edit
                      </Button>
                      <Button
                        size="sm" variant="secondary" icon={<Power size={12} />}
                        disabled={busy === d.id} onClick={() => toggle(d)}
                      >
                        {d.active ? 'Deactivate' : 'Reactivate'}
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
        title={dialog.editing ? `Edit ${dialog.editing.name}` : 'New department'}
        width="max-w-lg"
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDialog({ open: false, editing: null })}>
              Cancel
            </Button>
            <Button
              onClick={save}
              disabled={saving || !draft.name.trim() || (!dialog.editing && !draft.siteId)}
            >
              {saving ? 'Saving…' : dialog.editing ? 'Save changes' : 'Create department'}
            </Button>
          </div>
        )}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Department name" required value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Maintenance"
          />
          <Input
            label="Code" value={draft.code}
            onChange={(e) => setDraft({ ...draft, code: e.target.value })}
            placeholder="MTN"
          />
          <label className="space-y-1.5">
            <span className="block text-xs font-semibold text-ink-2">Site</span>
            <select
              value={draft.siteId}
              disabled={Boolean(dialog.editing)}
              onChange={(e) => setDraft({ ...draft, siteId: e.target.value })}
              className="h-9 w-full rounded-lg border border-line bg-surface px-2 text-xs text-ink disabled:opacity-60"
            >
              {sites.filter((s) => s.active).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {dialog.editing && (
              // Moving a department between sites would re-scope every record naming it.
              <span className="text-2xs text-muted">A department cannot be moved between sites.</span>
            )}
          </label>
          <label className="space-y-1.5">
            <span className="block text-xs font-semibold text-ink-2">Manager</span>
            <select
              value={draft.managerUserId}
              onChange={(e) => setDraft({ ...draft, managerUserId: e.target.value })}
              className="h-9 w-full rounded-lg border border-line bg-surface px-2 text-xs text-ink"
            >
              <option value="">Nobody assigned</option>
              {/* Only members of this workspace: a manager is an account, not a name. */}
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {p.email}</option>
              ))}
            </select>
          </label>
        </div>
      </Dialog>
    </div>
  )
}
