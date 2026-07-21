import { useEffect, useMemo, useState } from 'react'
import { Check, Plus, ShieldQuestion, Trash2 } from 'lucide-react'
import { api } from '@/api/client'
import { ApiError } from '@/api/types'
import type { RbacAction, RbacModule, RoleDef } from '@/api/admin'
import { MODULE_LABEL, RBAC_ACTIONS, RBAC_MODULES } from '@/api/admin'
import { Alert, Badge, Button, Card, CardBody, CardHeader, Dialog, Select, Skeleton } from '@/components/ui'
import { useAdminActor } from '../lib'
import { cn } from '@/lib/cn'

const ACTION_LABEL: Record<RbacAction, string> = {
  view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete', approve: 'Approve', export: 'Export',
}

export function RolesSection() {
  const actor = useAdminActor()
  const [roles, setRoles] = useState<RoleDef[] | null>(null)
  const [activeRole, setActiveRole] = useState<string>('hse_manager')
  const [error, setError] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)

  const load = () => api.adminListRoles().then((r) => { setRoles(r); if (!r.find((x) => x.id === activeRole)) setActiveRole(r[0]?.id ?? '') })
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const role = useMemo(() => roles?.find((r) => r.id === activeRole), [roles, activeRole])

  const toggle = async (module: RbacModule, action: RbacAction) => {
    if (!role) return
    setSaving(`${module}:${action}`)
    setError(null)
    try {
      const updated = await api.adminToggleRolePermission(role.id, module, action, actor)
      setRoles((cur) => cur?.map((r) => (r.id === updated.id ? { ...updated, userCount: r.userCount } : r)) ?? null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update permission.')
    } finally { setSaving(null) }
  }

  const removeRole = async () => {
    if (!role) return
    setError(null)
    try {
      await api.adminDeleteRole(role.id, actor)
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete role.')
    }
  }

  if (roles === null) return <Card className="p-5"><Skeleton className="h-96 w-full" /></Card>

  return (
    <div className="space-y-3">
      {error && <Alert tone="critical" onDismiss={() => setError(null)}>{error}</Alert>}

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        {/* Role list */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-2xs font-bold uppercase tracking-wider text-muted">Roles</p>
            <Button size="sm" variant="ghost" icon={<Plus size={12} />} onClick={() => setNewOpen(true)}>New</Button>
          </div>
          <div className="space-y-1">
            {roles.map((r) => (
              <button key={r.id} onClick={() => setActiveRole(r.id)}
                className={cn('flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors', activeRole === r.id ? 'bg-accent-soft' : 'hover:bg-accent-soft/50')}
                style={activeRole === r.id ? { borderColor: 'var(--accent)' } : undefined}>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{r.name}</span>
                  <span className="block text-2xs text-muted">{r.userCount ?? 0} user(s){r.system ? '' : ' · custom'}</span>
                </span>
                {!r.system && <Badge tone="accent">Custom</Badge>}
              </button>
            ))}
          </div>
        </div>

        {/* Permission matrix */}
        <Card>
          <CardHeader
            title={role?.name ?? 'Role'}
            subtitle={role?.description}
            right={role && !role.system ? <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => void removeRole()}>Delete role</Button> : undefined}
          />
          <CardBody className="overflow-x-auto">
            {role?.id === 'admin' && (
              <Alert tone="info" className="mb-3">The Administrator role always has full access and cannot be reduced.</Alert>
            )}
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="border-b text-2xs uppercase tracking-wide text-muted">
                  <th className="py-2.5 pr-4 font-semibold">Module</th>
                  {RBAC_ACTIONS.map((a) => <th key={a} className="px-2 py-2.5 text-center font-semibold">{ACTION_LABEL[a]}</th>)}
                </tr>
              </thead>
              <tbody>
                {RBAC_MODULES.map((m) => (
                  <tr key={m} className="border-b last:border-0">
                    <td className="py-2.5 pr-4 text-sm font-medium text-ink">{MODULE_LABEL[m]}</td>
                    {RBAC_ACTIONS.map((a) => {
                      const on = role?.permissions[m].includes(a) ?? false
                      const locked = role?.id === 'admin'
                      return (
                        <td key={a} className="px-2 py-2.5 text-center">
                          <button
                            disabled={locked || saving === `${m}:${a}`}
                            onClick={() => void toggle(m, a)}
                            className={cn('inline-flex h-6 w-6 items-center justify-center rounded-md border transition-colors disabled:opacity-60',
                              on ? 'text-white' : 'text-muted hover:border-[var(--accent)]')}
                            style={on ? { background: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
                            aria-label={`${on ? 'Revoke' : 'Grant'} ${ACTION_LABEL[a]} on ${MODULE_LABEL[m]}`}
                          >
                            {on && <Check size={13} strokeWidth={3} />}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 flex items-center gap-1 text-2xs text-muted"><ShieldQuestion size={11} /> Granting any action implies View. Changes are saved instantly and audited. New role definitions apply to future assignments.</p>
          </CardBody>
        </Card>
      </div>

      <NewRoleDialog open={newOpen} roles={roles} onClose={() => setNewOpen(false)} onCreated={(id) => { setNewOpen(false); load().then(() => setActiveRole(id)) }} />
    </div>
  )
}

function NewRoleDialog({ open, roles, onClose, onCreated }: { open: boolean; roles: RoleDef[]; onClose: () => void; onCreated: (id: string) => void }) {
  const actor = useAdminActor()
  const [name, setName] = useState('')
  const [cloneFrom, setCloneFrom] = useState('safety_officer')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true); setError(null)
    try {
      const role = await api.adminCreateRole(name, cloneFrom, actor)
      setName('')
      onCreated(role.id)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create the role.')
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Create custom role" description="Start from an existing role's permissions, then refine the matrix."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={() => void submit()}>Create role</Button></>}>
      <div className="space-y-3">
        {error && <Alert tone="critical">{error}</Alert>}
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Role name (e.g. Contractor Coordinator)"
          className="h-9 w-full rounded-lg border bg-surface px-3 text-sm text-ink outline-none focus:border-accent" />
        <Select label="Clone permissions from" value={cloneFrom} onChange={(e) => setCloneFrom(e.target.value)}>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
      </div>
    </Dialog>
  )
}
