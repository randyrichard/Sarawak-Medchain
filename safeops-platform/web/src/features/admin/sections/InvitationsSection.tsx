import { useCallback, useEffect, useState } from 'react'
import { MailPlus, Copy, Ban, Check } from 'lucide-react'
import {
  orgAdminApi, type AdminInvitation, type AdminSite, type RoleCatalogEntry,
} from '@/api/orgAdminApi'
import { ApiError } from '@/api/types'
import { useOrg } from '@/features/org/OrgContext'
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, Dialog, EmptyState, Input, Skeleton,
} from '@/components/ui'
import { fmtDateTime } from '@/features/incidents/lib'
import { invitationLink, invitationState } from '../lib'

/**
 * Invitations.
 *
 * An invitation creates the account immediately - so it shows in Users as Invited with its
 * role already settled - and issues a single-use, time-limited secret that lets the person
 * set a password. The link is shown once, here, because no mail provider is configured in
 * this deployment: telling an administrator an email is on its way when nothing was sent is
 * how somebody waits a week for a message that never existed.
 */
export function InvitationsSection() {
  const { company } = useOrg()
  const [rows, setRows] = useState<AdminInvitation[] | null>(null)
  const [sites, setSites] = useState<AdminSite[]>([])
  const [roles, setRoles] = useState<RoleCatalogEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState({ email: '', name: '', role: 'employee', siteIds: [] as string[] })
  /** The one moment the token exists in the browser. Cleared when the panel closes. */
  const [issued, setIssued] = useState<{ email: string; link: string; expiresAt: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(() => {
    if (!company) return
    setRows(null)
    Promise.all([
      orgAdminApi.listInvitations(company.id),
      orgAdminApi.listSites(company.id),
      orgAdminApi.roleCatalog(company.id),
    ])
      .then(([i, s, r]) => { setRows(i); setSites(s); setRoles(r) })
      .catch((e) => {
        setRows([])
        setError(e instanceof ApiError ? e.message : 'Could not load the invitations.')
      })
  }, [company])

  useEffect(load, [load])

  const send = async () => {
    if (!company) return
    setSaving(true)
    setError(null)
    try {
      const res = await orgAdminApi.createInvitation(company.id, {
        email: draft.email,
        name: draft.name || undefined,
        role: draft.role,
        siteIds: draft.siteIds.length ? draft.siteIds : undefined,
      })
      setIssued({
        email: res.email, link: invitationLink(res.token), expiresAt: res.expiresAt,
      })
      setOpen(false)
      setDraft({ email: '', name: '', role: 'employee', siteIds: [] })
      load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not send that invitation.')
    } finally {
      setSaving(false)
    }
  }

  const revoke = async (inv: AdminInvitation) => {
    if (!company) return
    setBusy(inv.id)
    try {
      await orgAdminApi.revokeInvitation(company.id, inv.id)
      load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not revoke that invitation.')
    } finally {
      setBusy(null)
    }
  }

  const copy = async () => {
    if (!issued) return
    try {
      await navigator.clipboard.writeText(issued.link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setError('Could not copy — select the link and copy it manually.')
    }
  }

  const selectedRole = roles.find((r) => r.role === draft.role)

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader
          title="Invitations"
          subtitle="Invite somebody into this workspace with a role and, if you want, specific sites."
          right={(
            <Button size="sm" icon={<MailPlus size={14} />} onClick={() => setOpen(true)}>
              Invite user
            </Button>
          )}
        />
        <CardBody className="space-y-3">
          {error && <Alert tone="critical" onDismiss={() => setError(null)}>{error}</Alert>}

          {/* Shown once. There is no way to retrieve this link afterwards. */}
          {issued && (
            <Alert tone="success" onDismiss={() => setIssued(null)}>
              <div className="space-y-1.5">
                <p>
                  Invitation created for <strong>{issued.email}</strong>. It expires{' '}
                  {fmtDateTime(issued.expiresAt)}.
                </p>
                <p className="text-2xs">
                  No mail provider is configured, so send this link yourself. It is shown
                  once and cannot be retrieved later — issue a new invitation if it is lost.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded bg-[var(--surface-2)] px-2 py-1 font-mono text-2xs">
                    {issued.link}
                  </code>
                  <Button
                    size="sm" variant="secondary"
                    icon={copied ? <Check size={12} /> : <Copy size={12} />}
                    onClick={copy}
                  >
                    {copied ? 'Copied' : 'Copy link'}
                  </Button>
                </div>
              </div>
            </Alert>
          )}

          {rows === null && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>}

          {rows !== null && rows.length === 0 && (
            <EmptyState icon={MailPlus} title="Nobody invited yet.">
              Invite your HSE manager, safety officers and supervisors so they can start
              raising permits and investigating incidents.
            </EmptyState>
          )}

          {rows && rows.length > 0 && (
            <div className="overflow-x-auto">
              <ul className="divide-y divide-line">
                {rows.map((inv) => {
                  const state = invitationState(inv.state)
                  return (
                    <li key={inv.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-semibold text-ink">{inv.email}</span>
                          <Badge tone={state.tone}>{state.label}</Badge>
                          <Badge tone="neutral">{inv.role.replace(/_/g, ' ')}</Badge>
                        </p>
                        <p className="mt-0.5 text-2xs text-muted">
                          Invited by {inv.invitedBy} · {fmtDateTime(inv.createdAt)}
                          {inv.state === 'pending' && <> · expires {fmtDateTime(inv.expiresAt)}</>}
                          {inv.acceptedAt && <> · accepted {fmtDateTime(inv.acceptedAt)}</>}
                        </p>
                      </div>
                      {inv.state === 'pending' && (
                        <Button
                          size="sm" variant="secondary" icon={<Ban size={12} />}
                          disabled={busy === inv.id} onClick={() => revoke(inv)}
                        >
                          Revoke
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </CardBody>
      </Card>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Invite a user"
        description="They receive a single-use link to set their own password."
        width="max-w-lg"
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={send} disabled={saving || !draft.email.trim()}>
              {saving ? 'Creating…' : 'Create invitation'}
            </Button>
          </div>
        )}
      >
        <div className="space-y-3">
          <Input
            label="Email address" required type="email" value={draft.email}
            onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            placeholder="name@company.com"
          />
          <Input
            label="Name" value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            hint="Optional — they can set their own when they accept."
          />
          <label className="block space-y-1.5">
            <span className="block text-xs font-semibold text-ink-2">Role</span>
            <select
              value={draft.role}
              onChange={(e) => setDraft({ ...draft, role: e.target.value })}
              className="h-9 w-full rounded-lg border border-line bg-transparent px-2 text-xs text-ink"
            >
              {roles.map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
            </select>
            {/* What the role actually grants, so nobody picks one from its name alone. */}
            {selectedRole && <span className="block text-2xs text-muted">{selectedRole.summary}</span>}
          </label>

          <fieldset className="space-y-1.5">
            <legend className="text-xs font-semibold text-ink-2">Sites</legend>
            <p className="text-2xs text-muted">
              Leave all unticked for organisation-wide access.
            </p>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {sites.filter((s) => s.active).map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-xs text-ink">
                  <input
                    type="checkbox"
                    checked={draft.siteIds.includes(s.id)}
                    onChange={(e) => setDraft({
                      ...draft,
                      siteIds: e.target.checked
                        ? [...draft.siteIds, s.id]
                        : draft.siteIds.filter((x) => x !== s.id),
                    })}
                  />
                  {s.name}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </Dialog>
    </div>
  )
}
