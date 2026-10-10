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
  ErrorState, Input, Select, Skeleton, StatusPill, Switch,
} from '@/components/ui'
import { timeAgo } from '@/lib/time'
import { fmtDateTime } from '@/features/incidents/lib'
import { downloadCsv, USER_STATUS_KIND, useAdminActor } from '../lib'

export function UsersSection() {
  const { company, sites } = useOrg()
  const companyId = company?.id ?? ''
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
  // The raw reset token exists exactly once, in this response. If the admin closes the
  // dialog without copying it, it is gone and they must issue another.
  const [mfaResetFor, setMfaResetFor] = useState<AdminUser | null>(null)
  const [resetLink, setResetLink] = useState<{ email: string; url: string; minutes: number } | null>(null)

  const refresh = useCallback(() => {
    if (!company) return
    api.adminListUsers(company.id, { q, status }).then(setUsers)
  }, [company, q, status])

  useEffect(() => {
    setUsers(null)
    const t = setTimeout(refresh, q ? 250 : 0)
    return () => clearTimeout(t)
  }, [refresh, q])

  // Per company: the roles list used to load once, so after switching company the role names
  // (and the roles offered when inviting) were the first company's.
  useEffect(() => {
    let live = true
    api.adminListRoles(companyId).then((r) => { if (live) setRoles(r) }).catch(() => { if (live) setRoles([]) })
    return () => { live = false }
  }, [companyId])

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

  /**
   * Issues a reset link: emailed if a provider is configured, shown once if not.
   *
   * Both outcomes are told plainly. Saying "reset sent" while sending nothing is how an
   * earlier version left users stranded; showing a link the recipient has already been
   * emailed would put a working credential on screen for no reason.
   *
   * The server decides which happened - it returns the token only when delivery did not
   * occur - so this cannot claim an email went out that did not.
   */
  const issueReset = async (u: AdminUser) => {
    setError(null)
    try {
      const r = await api.adminResetPassword(companyId, u.id, actor)
      if (r.emailed) {
        setFlash(`A reset link has been emailed to ${u.email}. It expires in ${r.expiresInMinutes} minutes.`)
      } else if (r.token) {
        setResetLink({
          email: u.email,
          url: `${window.location.origin}/reset-password?token=${r.token}`,
          minutes: r.expiresInMinutes,
        })
      } else {
        // Neither emailed nor returned. Nothing to hand over, so say so rather than
        // showing an empty box.
        setError(r.deliveryNote ?? 'The reset link could not be issued. Try again.')
      }
      refresh()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not issue a reset link.')
    }
  }

  const exportCsv = () => downloadCsv(
    ['Name', 'Email', 'Role', 'Status', 'MFA', 'Last login', 'Department'],
    (users ?? []).map((u) => [u.name, u.email, roleName.get(u.role) ?? u.role, u.status, u.mfaEnabled ? 'Yes' : 'No', u.lastLoginAt ?? 'never', u.department ?? '']),
    'safechain-users.csv',
  )

  return (
    <div className="space-y-3">
      {error && <Alert tone="critical" onDismiss={() => setError(null)}>{error}</Alert>}
      {flash && <Alert tone="success" onDismiss={() => setFlash(null)}>{flash}</Alert>}

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-52 flex-1 cursor-text items-center gap-2 rounded-lg border coarse:min-h-11 bg-surface px-3 py-2 coarse:py-0 md:max-w-xs focus-within:border-accent">
          <Search size={14} aria-hidden className="shrink-0 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, department…" className="w-full coarse:self-stretch bg-transparent text-sm text-ink outline-none placeholder:text-muted" />
        </label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 coarse:h-11 rounded-lg border bg-surface px-2.5 text-sm text-ink-2 outline-none" aria-label="Filter by status">
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
          <div className="relative overflow-x-auto">
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
                        trigger={() => <button className="inline-flex items-center justify-center rounded-lg border p-1.5 text-ink-2 hover:bg-accent-soft coarse:min-h-11 coarse:min-w-11" aria-label="User actions"><MoreHorizontal size={14} /></button>}
                      >
                        <DropdownItem icon={<KeyRound size={14} />} onSelect={() => void issueReset(u)}>Issue reset link</DropdownItem>
                        {/* Only a reset: switching MFA on needs the person's own phone, so they do it from My account. */}
                        {u.mfaEnabled && <DropdownItem icon={<ShieldCheck size={14} />} onSelect={() => setMfaResetFor(u)}>Reset MFA (lost phone)</DropdownItem>}
                        <DropdownItem icon={<Play size={14} />} onSelect={() => void run(() => api.adminForcePasswordReset(companyId, u.id, actor), 'Reset forced at next login')}>Force reset at next login</DropdownItem>
                        <DropdownSeparator />
                        {u.status === 'locked' && <DropdownItem icon={<Play size={14} />} onSelect={() => void run(() => api.adminSetUserStatus(companyId, u.id, 'active', actor), 'Account unlocked')}>Unlock account</DropdownItem>}
                        {u.status !== 'deactivated' ? (
                          <DropdownItem danger icon={<Ban size={14} />} onSelect={() => void run(() => api.adminSetUserStatus(companyId, u.id, 'deactivated', actor), `${u.name} deactivated`)}>Deactivate</DropdownItem>
                        ) : (
                          <DropdownItem icon={<Play size={14} />} onSelect={() => void run(() => api.adminSetUserStatus(companyId, u.id, 'active', actor), `${u.name} reactivated`)}>Reactivate</DropdownItem>
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
      <ResetLinkDialog link={resetLink} onClose={() => setResetLink(null)} />
      <Dialog
        open={!!mfaResetFor}
        onClose={() => setMfaResetFor(null)}
        title="Reset multi-factor sign-in?"
        description={mfaResetFor?.email}
        footer={(
          <>
            <Button variant="ghost" onClick={() => setMfaResetFor(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => {
              const u = mfaResetFor
              setMfaResetFor(null)
              if (u) void run(() => api.adminResetMfa(companyId, u.id, actor), `MFA reset for ${u.name}`)
            }}>
              Reset MFA
            </Button>
          </>
        )}
      >
        <p className="text-sm text-ink-2">
          For someone who has lost their phone and their recovery codes. Their authenticator
          stops working, they are signed out everywhere, and they sign in next with their
          password alone - then set MFA up again from My account, or straight away if your
          organisation requires it. Confirm who is asking before you do this.
        </p>
      </Dialog>
    </div>
  )
}

/**
 * Shows a freshly issued reset link.
 *
 * Shown once and never retrievable: the server keeps only the digest, so there is no
 * screen that can show it again. The copy button matters more than it looks — the token
 * is 43 characters and retyping it by hand is how a locked-out user stays locked out.
 */
function ResetLinkDialog({
  link, onClose,
}: { link: { email: string; url: string; minutes: number } | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be refused; the link is on screen to select manually.
      setCopied(false)
    }
  }

  return (
    <Dialog
      open={!!link}
      onClose={onClose}
      title="Reset link issued"
      description={link ? `Give this to ${link.email}. It works once and expires in ${link.minutes} minutes.` : undefined}
      footer={<Button onClick={onClose}>Done</Button>}
    >
      {link && (
        <div className="space-y-3">
          <div className="rounded-lg border bg-page px-3 py-2">
            <p className="break-all font-mono text-2xs text-ink-2">{link.url}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => void copy()}>
              {copied ? 'Copied' : 'Copy link'}
            </Button>
            <span className="text-2xs text-muted">
              Their existing sessions have been signed out.
            </span>
          </div>
          <Alert tone="warning">
            This is the only time the link is shown. Close this dialog and it cannot be
            retrieved — you would need to issue a new one.
          </Alert>
        </div>
      )}
    </Dialog>
  )
}

function UserDetailDrawer({ userId, roleName, onClose }: { userId: string | null; roleName: Map<string, string>; onClose: () => void }) {
  const { company } = useOrg()
  const companyId = company?.id ?? ''
  const [user, setUser] = useState<AdminUser | null>(null)
  const [devices, setDevices] = useState<UserDevice[]>([])
  const [logins, setLogins] = useState<LoginEvent[]>([])

  const [loadError, setLoadError] = useState<unknown>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!userId) return
    let live = true
    setUser(null); setLoadError(null)
    // The user is what the drawer is about, so its failure is shown with a retry; devices and
    // sign-in history are secondary and simply stay empty if they fail.
    api.adminGetUser(companyId, userId).then((u) => { if (live) setUser(u) }).catch((e) => { if (live) setLoadError(e) })
    api.adminUserDevices(companyId, userId).then((d) => { if (live) setDevices(d) }).catch(() => {})
    api.adminUserLoginHistory(companyId, userId).then((l) => { if (live) setLogins(l) }).catch(() => {})
    return () => { live = false }
  }, [companyId, userId, attempt])

  if (!userId) return null
  return (
    <Dialog open onClose={onClose} title={user?.name ?? 'User'} description={user?.email} width="max-w-lg">
      {!user && loadError ? <ErrorState title="Couldn't load this user" error={loadError} onRetry={() => setAttempt((n) => n + 1)} />
        : !user ? <Skeleton className="h-40 w-full" /> : (
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
                  <span className="text-ink-2">{e.device}{e.ip ? ` · ${e.ip}` : ''}</span>
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
    <Dialog
      error={error} open={open} onClose={onClose} title="Create user" description="Provision a new account and optionally send an invitation email."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={() => void submit()}>Create user</Button></>}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-x-3 gap-y-5">
          <Input label="Full name" required value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Work email" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-5">
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
    <Dialog
      error={error} open={open} onClose={onClose} title="Bulk import users" description="Paste CSV with columns: name, email, role. Duplicates are skipped." width="max-w-lg"
      footer={result
        ? <Button onClick={() => onDone(result)}>Done</Button>
        : <><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={() => void submit()}>Import users</Button></>}>
      <div className="space-y-3">
        {result ? (
          <Alert tone="success" title="Import complete">
            {result.created} user(s) invited, {result.skipped} duplicate(s) skipped.
            {result.errors.length > 0 && <ul className="mt-1 list-disc pl-4 text-2xs">{result.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}</ul>}
          </Alert>
        ) : (
          <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={7} aria-label="Users to import, as CSV"
            className="w-full rounded-lg border bg-surface px-3 py-2 font-mono text-xs text-ink outline-none focus:border-accent" spellCheck={false} />
        )}
      </div>
    </Dialog>
  )
}
