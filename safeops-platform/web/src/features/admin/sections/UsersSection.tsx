import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Ban, Download, KeyRound, MoreHorizontal, Search, ShieldCheck, Upload, UserPlus, UserX, Play,
} from 'lucide-react'
import { api } from '@/api/client'
import { ApiError } from '@/api/types'
import type { AdminUser, LoginEvent, RoleDef, UserDevice } from '@/api/admin'
import { useOrg } from '@/features/org/OrgContext'
import {
  Alert, Avatar, Badge, Button, Card, Dialog, Dropdown, DropdownItem, DropdownSeparator, EmptyState,
  Input, Select, Skeleton, StatusPill, Switch,
} from '@/components/ui'
import { timeAgo } from '@/lib/time'
import { fmtDateTime } from '@/features/incidents/lib'
import { downloadCsv, USER_STATUS_KIND, useAdminActor } from '../lib'

export function UsersSection() {
  const { company, sites } = useOrg()
  const actor = useAdminActor()
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [roles, setRoles] = useState<RoleDef[]>([])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const refresh = useCallback(() => {
    if (!company) return
    api.adminListUsers(company.id, { q, status }).then(setUsers)
  }, [company, q, status])

  useEffect(() => {
    setUsers(null)
    const t = setTimeout(refresh, q ? 250 : 0)
    return () => clearTimeout(t)
  }, [refresh, q])

  useEffect(() => { api.adminListRoles().then(setRoles) }, [])

  const roleName = useMemo(() => new Map(roles.map((r) => [r.id, r.name])), [roles])

  const run = async (fn: () => Promise<unknown>, msg?: string) => {
    setError(null)
    try {
      await fn()
      refresh()
      if (msg) { setFlash(msg); setTimeout(() => setFlash(null), 2500) }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Action failed.')
    }
  }

  const exportCsv = () => downloadCsv(
    ['Name', 'Email', 'Role', 'Status', 'MFA', 'Last login', 'Department'],
    (users ?? []).map((u) => [u.name, u.email, roleName.get(u.role) ?? u.role, u.status, u.mfaEnabled ? 'Yes' : 'No', u.lastLoginAt ?? 'never', u.department ?? '']),
    'safeops-users.csv',
  )

  return (
    <div className="space-y-3">
      {error && <Alert tone="critical" onDismiss={() => setError(null)}>{error}</Alert>}
      {flash && <Alert tone="success" onDismiss={() => setFlash(null)}>{flash}</Alert>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-52 flex-1 items-center gap-2 rounded-lg border bg-surface px-3 py-2 md:max-w-xs">
          <Search size={14} className="shrink-0 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, department…" className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-lg border bg-surface px-2.5 text-sm text-ink-2 outline-none" aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="invited">Invited</option>
          <option value="deactivated">Deactivated</option>
          <option value="locked">Locked</option>
        </select>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" icon={<Download size={13} />} onClick={exportCsv}>Export</Button>
          <Button size="sm" variant="secondary" icon={<Upload size={13} />} onClick={() => setImportOpen(true)}>Import CSV</Button>
          <Button size="sm" icon={<UserPlus size={14} />} onClick={() => setNewOpen(true)}>Create user</Button>
        </div>
      </div>

      <Card>
        {users === null ? (
          <div className="space-y-3 p-5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : users.length === 0 ? (
          <EmptyState icon={UserX} title="No users match">Adjust the filters or create a user.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead>
                <tr className="border-b text-2xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-2.5 font-semibold">User</th>
                  <th className="px-3 py-2.5 font-semibold">Role</th>
                  <th className="px-3 py-2.5 font-semibold">MFA</th>
                  <th className="px-3 py-2.5 font-semibold">Last login</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b last:border-0 hover:bg-accent-soft/30">
                    <td className="cursor-pointer px-5 py-3" onClick={() => setDetailId(u.id)}>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={u.name} size={30} />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-ink hover:text-accent">{u.name}</p>
                          <p className="truncate text-2xs text-muted">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-ink-2">{roleName.get(u.role) ?? u.role}</td>
                    <td className="px-3 py-3">
                      {u.mfaEnabled ? <Badge tone="good" className="gap-1"><ShieldCheck size={10} /> On</Badge> : <Badge tone="neutral">Off</Badge>}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : 'never'}</td>
                    <td className="px-3 py-3"><StatusPill kind={USER_STATUS_KIND[u.status]} label={u.status[0].toUpperCase() + u.status.slice(1)} /></td>
                    <td className="px-5 py-3 text-right">
                      <Dropdown
                        align="end"
                        trigger={() => <button className="rounded-lg border p-1.5 text-ink-2 hover:bg-accent-soft" aria-label="User actions"><MoreHorizontal size={14} /></button>}
                      >
                        <DropdownItem icon={<KeyRound size={14} />} onSelect={() => void run(() => api.adminResetPassword(u.id, actor), `Password reset sent to ${u.email}`)}>Send password reset</DropdownItem>
                        <DropdownItem icon={<ShieldCheck size={14} />} onSelect={() => void run(() => api.adminToggleMfa(u.id, actor), u.mfaEnabled ? 'MFA disabled' : 'MFA enabled')}>{u.mfaEnabled ? 'Disable MFA' : 'Enable MFA'}</DropdownItem>
                        <DropdownItem icon={<Play size={14} />} onSelect={() => void run(() => api.adminForcePasswordReset(u.id, actor), 'Reset forced at next login')}>Force reset at next login</DropdownItem>
                        <DropdownSeparator />
                        {u.status === 'locked' && <DropdownItem icon={<Play size={14} />} onSelect={() => void run(() => api.adminSetUserStatus(u.id, 'active', actor), 'Account unlocked')}>Unlock account</DropdownItem>}
                        {u.status !== 'deactivated' ? (
                          <DropdownItem danger icon={<Ban size={14} />} onSelect={() => void run(() => api.adminSetUserStatus(u.id, 'deactivated', actor), `${u.name} deactivated`)}>Deactivate</DropdownItem>
                        ) : (
                          <DropdownItem icon={<Play size={14} />} onSelect={() => void run(() => api.adminSetUserStatus(u.id, 'active', actor), `${u.name} reactivated`)}>Reactivate</DropdownItem>
                        )}
                      </Dropdown>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-2xs text-muted">{users?.length ?? 0} account(s) in scope · every change is written to the audit log with your IP and device.</p>

      <UserDetailDrawer userId={detailId} roleName={roleName} onClose={() => setDetailId(null)} />
      <NewUserDialog open={newOpen} roles={roles} sites={sites} onClose={() => setNewOpen(false)} onCreated={() => { setNewOpen(false); refresh(); setFlash('User created'); setTimeout(() => setFlash(null), 2500) }} />
      <BulkImportDialog open={importOpen} onClose={() => setImportOpen(false)} onDone={(r) => { setImportOpen(false); refresh(); setFlash(`${r.created} user(s) imported, ${r.skipped} skipped`); setTimeout(() => setFlash(null), 3000) }} />
    </div>
  )
}

function UserDetailDrawer({ userId, roleName, onClose }: { userId: string | null; roleName: Map<string, string>; onClose: () => void }) {
  const [user, setUser] = useState<AdminUser | null>(null)
  const [devices, setDevices] = useState<UserDevice[]>([])
  const [logins, setLogins] = useState<LoginEvent[]>([])

  useEffect(() => {
    if (!userId) return
    setUser(null)
    api.adminGetUser(userId).then(setUser)
    api.adminUserDevices(userId).then(setDevices)
    api.adminUserLoginHistory(userId).then(setLogins)
  }, [userId])

  if (!userId) return null
  return (
    <Dialog open onClose={onClose} title={user?.name ?? 'User'} description={user?.email} width="max-w-lg">
      {!user ? <Skeleton className="h-40 w-full" /> : (
        <div className="max-h-[62vh] space-y-4 overflow-y-auto">
          <div className="flex items-center gap-3">
            <Avatar name={user.name} size={44} />
            <div>
              <div className="flex items-center gap-2">
                <Badge tone="accent">{roleName.get(user.role) ?? user.role}</Badge>
                <StatusPill kind={USER_STATUS_KIND[user.status]} label={user.status} />
                {user.mfaEnabled && <Badge tone="good" className="gap-1"><ShieldCheck size={10} /> MFA</Badge>}
              </div>
              <p className="mt-1 text-2xs text-muted">Member since {fmtDateTime(user.createdAt).split(',')[0]} · {user.department ?? 'no department'}</p>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-2xs font-bold uppercase tracking-wider text-muted">Devices</p>
            <ul className="space-y-1.5">
              {devices.map((d) => (
                <li key={d.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs">
                  <span className="min-w-0 flex-1"><span className="font-medium text-ink">{d.name}</span> <span className="text-muted">· {d.browser} · {d.os}</span></span>
                  {d.current && <Badge tone="accent">This session</Badge>}
                  {d.trusted && <Badge tone="good">Trusted</Badge>}
                  <span className="text-2xs text-muted">{timeAgo(d.lastSeen)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-1.5 text-2xs font-bold uppercase tracking-wider text-muted">Recent sign-ins</p>
            <ul className="space-y-1">
              {logins.length === 0 && <p className="text-xs text-muted">No sign-in history.</p>}
              {logins.slice(0, 6).map((e) => (
                <li key={e.id} className="flex items-center gap-2 text-xs">
                  <StatusPill kind={e.result === 'success' ? 'good' : 'critical'} label={e.result === 'success' ? 'Success' : 'Failed'} />
                  <span className="text-ink-2">{e.device} · {e.location}</span>
                  <span className="ml-auto text-2xs text-muted">{timeAgo(e.at)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Dialog>
  )
}

function NewUserDialog({ open, roles, sites, onClose, onCreated }: { open: boolean; roles: RoleDef[]; sites: { id: string; short: string }[]; onClose: () => void; onCreated: () => void }) {
  const { company } = useOrg()
  const actor = useAdminActor()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('employee')
  const [siteId, setSiteId] = useState('')
  const [sendInvite, setSendInvite] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!company) return
    setBusy(true); setError(null)
    try {
      await api.adminCreateUser(company.id, { name, email, role, siteIds: siteId ? [siteId] : [], sendInvite }, actor)
      setName(''); setEmail('')
      onCreated()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create the user.')
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Create user" description="Provision a new account and optionally send an invitation email."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={() => void submit()}>Create user</Button></>}>
      <div className="space-y-3.5">
        {error && <Alert tone="critical">{error}</Alert>}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Full name" required value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Work email" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
          <Select label="Site (optional)" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value="">Organisation-wide</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.short}</option>)}
          </Select>
        </div>
        <Switch checked={sendInvite} onChange={setSendInvite} label="Send an invitation email (otherwise create with a temporary password)" />
      </div>
    </Dialog>
  )
}

function BulkImportDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (r: { created: number; skipped: number }) => void }) {
  const { company } = useOrg()
  const actor = useAdminActor()
  const [csv, setCsv] = useState('name,email,role\nAiman Yusof,aiman.yusof@borneo-ind.com.my,employee\nChong Wei,chong.wei@borneo-ind.com.my,supervisor')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null)

  const submit = async () => {
    if (!company) return
    setBusy(true); setError(null)
    try {
      const r = await api.adminBulkImport(company.id, csv, actor)
      setResult(r)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Import failed.')
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Bulk import users" description="Paste CSV with columns: name, email, role. Duplicates are skipped." width="max-w-lg"
      footer={result
        ? <Button onClick={() => onDone(result)}>Done</Button>
        : <><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={() => void submit()}>Import users</Button></>}>
      <div className="space-y-3">
        {error && <Alert tone="critical">{error}</Alert>}
        {result ? (
          <Alert tone="success" title="Import complete">
            {result.created} user(s) invited, {result.skipped} duplicate(s) skipped.
            {result.errors.length > 0 && <ul className="mt-1 list-disc pl-4 text-2xs">{result.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}</ul>}
          </Alert>
        ) : (
          <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={7}
            className="w-full rounded-lg border bg-surface px-3 py-2 font-mono text-xs text-ink outline-none focus:border-accent" spellCheck={false} />
        )}
      </div>
    </Dialog>
  )
}
