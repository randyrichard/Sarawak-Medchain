import { useCallback, useEffect, useState } from 'react'
import { Briefcase, Plus, Pencil, Archive, MapPin } from 'lucide-react'
import {
  orgAdminApi, PROJECT_STATUS_LABEL,
  type AdminProject, type AdminSite, type ProjectStatus,
} from '@/api/orgAdminApi'
import { ApiError } from '@/api/types'
import { useOrg } from '@/features/org/OrgContext'
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, Dialog, EmptyState, Input, Select,
  Skeleton, Textarea,
} from '@/components/ui'

/**
 * Projects, and which sites sit under them.
 *
 * A project is never deleted, only cancelled. Its sites carry incidents, permits, assets
 * and employees, and no removal that keeps those readable is a delete - the database agrees,
 * holding Site.projectId as ON DELETE SET NULL so a project can never take a safety history
 * with it.
 *
 * Sites are attached from here rather than from the site editor because this is where the
 * shape of the organisation is visible: an administrator moving a site is answering "what
 * is in this job", not "what is this site called".
 */
type Draft = {
  name: string; code: string; client: string; description: string
  startDate: string; endDate: string; status: ProjectStatus
}

const EMPTY: Draft = {
  name: '', code: '', client: '', description: '',
  startDate: '', endDate: '', status: 'planned',
}

const STATUS_TONE: Record<ProjectStatus, 'accent' | 'neutral' | 'warning' | 'critical'> = {
  planned: 'neutral',
  active: 'accent',
  completed: 'neutral',
  suspended: 'warning',
  cancelled: 'critical',
}

/** A date input wants YYYY-MM-DD; the API returns a full ISO instant. */
const forInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '')

export function ProjectsSection() {
  const { company } = useOrg()
  const [rows, setRows] = useState<AdminProject[] | null>(null)
  const [sites, setSites] = useState<AdminSite[]>([])
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ open: boolean; editing: AdminProject | null }>(
    { open: false, editing: null },
  )
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [assigning, setAssigning] = useState<AdminProject | null>(null)

  const load = useCallback(() => {
    if (!company) return
    setRows(null)
    /*
     * Both lists, independently. The site list is only needed to offer what can be moved
     * into a project, so failing to load it must not take the project list down with it.
     */
    Promise.allSettled([
      orgAdminApi.listProjects(company.id),
      orgAdminApi.listSites(company.id),
    ]).then(([projects, siteList]) => {
      if (projects.status === 'fulfilled') setRows(projects.value)
      else {
        setRows([])
        setError(projects.reason instanceof ApiError
          ? projects.reason.message : 'Could not load the projects.')
      }
      if (siteList.status === 'fulfilled') setSites(siteList.value)
    })
  }, [company])

  useEffect(load, [load])

  const say = (m: string) => { setFlash(m); setTimeout(() => setFlash(null), 5000) }

  const openNew = () => { setDraft(EMPTY); setDialog({ open: true, editing: null }) }
  const openEdit = (p: AdminProject) => {
    setDraft({
      name: p.name, code: p.code, client: p.client, description: p.description,
      startDate: forInput(p.startDate), endDate: forInput(p.endDate), status: p.status,
    })
    setDialog({ open: true, editing: p })
  }

  const save = async () => {
    if (!company) return
    setSaving(true)
    setError(null)
    // Empty date fields mean "not set", which the API takes as null rather than as "".
    const payload = {
      ...draft,
      startDate: draft.startDate || null,
      endDate: draft.endDate || null,
    }
    try {
      if (dialog.editing) {
        await orgAdminApi.updateProject(company.id, dialog.editing.id, payload)
        say(`${draft.name} updated.`)
      } else {
        await orgAdminApi.createProject(company.id, payload)
        say(`${draft.name} created.`)
      }
      setDialog({ open: false, editing: null })
      load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save that project.')
    } finally {
      setSaving(false)
    }
  }

  const archive = async (p: AdminProject) => {
    if (!company) return
    setBusy(p.id)
    setError(null)
    try {
      const result = await orgAdminApi.archiveProject(company.id, p.id)
      // Say what happened to the sites, because "cancelled" on its own invites the worry
      // that something went with it.
      say(`${p.name} cancelled. Its ${result.sitesRetained} site(s) and their records are unchanged.`)
      load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not cancel that project.')
    } finally {
      setBusy(null)
    }
  }

  const moveSite = async (siteId: string, projectId: string | null) => {
    if (!company) return
    setBusy(siteId)
    setError(null)
    try {
      await orgAdminApi.assignSiteToProject(company.id, siteId, projectId)
      load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not move that site.')
    } finally {
      setBusy(null)
    }
  }

  const needle = q.trim().toLowerCase()
  const visible = (rows ?? []).filter((p) =>
    !needle || `${p.name} ${p.code} ${p.client}`.toLowerCase().includes(needle))
  const unassigned = sites.filter((s) => s.active && !visible.some(
    (p) => p.sites.some((x) => x.id === s.id)))

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader
          title="Projects"
          subtitle="A body of work, holding the sites it runs. Cancel rather than delete — the sites and their records stay."
          right={(
            <Button size="sm" icon={<Plus size={14} />} onClick={openNew}>New project</Button>
          )}
        />
        <CardBody className="space-y-3">
          {error && <Alert tone="critical" onDismiss={() => setError(null)}>{error}</Alert>}
          {flash && <Alert tone="success" onDismiss={() => setFlash(null)}>{flash}</Alert>}

          {rows !== null && rows.length > 0 && (
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, code or client…"
              aria-label="Search projects"
            />
          )}

          {rows === null && <Skeleton className="h-24 w-full" />}

          {rows !== null && rows.length === 0 && (
            <EmptyState
              icon={Briefcase}
              title="No projects yet"
              action={<Button size="sm" icon={<Plus size={14} />} onClick={openNew}>New project</Button>}
            >
              {/*
                Says what a project is for and what it costs to skip. Sites work perfectly
                well without one, so this has to read as an option rather than as a setup
                step somebody has failed to complete.
              */}
              Group sites under the job they belong to, then filter dashboards and monthly
              reports by project. Sites without a project keep working exactly as they do now.
            </EmptyState>
          )}

          {visible.map((p) => (
            <div key={p.id} className="rounded-xl border px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{p.name}</span>
                    <Badge tone={STATUS_TONE[p.status]}>{PROJECT_STATUS_LABEL[p.status]}</Badge>
                    {p.code && <span className="font-mono text-2xs text-muted">{p.code}</span>}
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {p.client ? `${p.client} · ` : ''}
                    {p.siteCount} site{p.siteCount === 1 ? '' : 's'}
                    {p.managerName ? ` · ${p.managerName}` : ''}
                    {p.startDate ? ` · from ${forInput(p.startDate)}` : ''}
                    {p.endDate ? ` to ${forInput(p.endDate)}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button size="sm" variant="secondary" icon={<MapPin size={13} />}
                    onClick={() => setAssigning(p)}>
                    Sites
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Pencil size={13} />}
                    onClick={() => openEdit(p)}>
                    Edit
                  </Button>
                  {p.status !== 'cancelled' && (
                    <Button size="sm" variant="ghost" icon={<Archive size={13} />}
                      loading={busy === p.id} onClick={() => void archive(p)}>
                      Cancel
                    </Button>
                  )}
                </div>
              </div>

              {p.sites.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {p.sites.map((s) => (
                    <Badge key={s.id} tone={s.active ? 'neutral' : 'warning'}>{s.name}</Badge>
                  ))}
                </div>
              )}
            </div>
          ))}

          {rows !== null && rows.length > 0 && unassigned.length > 0 && (
            <p className="text-2xs text-muted">
              {unassigned.length} active site{unassigned.length === 1 ? ' is' : 's are'} not in
              any project. They keep working — open a project and use Sites to move them in.
            </p>
          )}
        </CardBody>
      </Card>

      {/* Create / edit */}
      <Dialog
        open={dialog.open}
        onClose={() => setDialog({ open: false, editing: null })}
        title={dialog.editing ? `Edit ${dialog.editing.name}` : 'New project'}
        description="A project groups the sites it runs. Everything here can be changed later."
        width="max-w-lg"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setDialog({ open: false, editing: null })}>
              Cancel
            </Button>
            <Button loading={saving} disabled={!draft.name.trim()} onClick={() => void save()}>
              {dialog.editing ? 'Save changes' : 'Create project'}
            </Button>
          </>
        )}
      >
        <div className="space-y-3">
          <Input label="Project name" required value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="e.g. Bintulu Tank Farm Upgrade" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Project code" value={draft.code}
              onChange={(e) => setDraft({ ...draft, code: e.target.value })}
              placeholder="e.g. PRJ-2026-014"
              hint="Your own reference. Optional, but unique when set." />
            <Input label="Client" value={draft.client}
              onChange={(e) => setDraft({ ...draft, client: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="Start date" type="date" value={draft.startDate}
              onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} />
            <Input label="End date" type="date" value={draft.endDate}
              onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} />
            <Select label="Status" value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value as ProjectStatus })}>
              {(Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[]).map((k) => (
                <option key={k} value={k}>{PROJECT_STATUS_LABEL[k]}</option>
              ))}
            </Select>
          </div>
          <Textarea label="Description" rows={2} value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        </div>
      </Dialog>

      {/* Which sites are in this project */}
      <Dialog
        open={!!assigning}
        onClose={() => setAssigning(null)}
        title={assigning ? `Sites in ${assigning.name}` : ''}
        description="Moving a site changes which project its incidents, permits and actions are reported under."
        width="max-w-lg"
        footer={<Button variant="secondary" onClick={() => setAssigning(null)}>Done</Button>}
      >
        <div className="space-y-1.5">
          {sites.filter((s) => s.active).length === 0 && (
            <p className="text-sm text-muted">This workspace has no active sites.</p>
          )}
          {sites.filter((s) => s.active).map((s) => {
            const here = !!assigning?.sites.some((x) => x.id === s.id)
            const elsewhere = !here && (rows ?? []).find((p) => p.sites.some((x) => x.id === s.id))
            return (
              <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{s.name}</span>
                  <span className="block text-2xs text-muted">
                    {elsewhere ? `Currently in ${elsewhere.name}` : here ? 'In this project' : 'Not in a project'}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant={here ? 'ghost' : 'secondary'}
                  loading={busy === s.id}
                  onClick={() => void moveSite(s.id, here ? null : assigning!.id)}
                >
                  {here ? 'Remove' : 'Add'}
                </Button>
              </div>
            )
          })}
        </div>
      </Dialog>
    </div>
  )
}
