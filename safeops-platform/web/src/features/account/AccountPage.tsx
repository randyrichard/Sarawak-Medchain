import { useEffect, useState } from 'react'
import { KeyRound, Monitor } from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import { useOrg } from '@/features/org/OrgContext'
import { ROLE_LABEL, ApiError } from '@/api/types'
import {
  accountApi, LANDING_PAGES, LANDING_PAGE_LABEL,
  type LandingPage, type UserPreferences,
} from '@/api/accountApi'
import { useTheme } from '@/app/theme'
import { setCachedPreferences } from './preferences'
import {
  Alert, Avatar, Badge, Button, Card, CardBody, CardHeader, Dialog, Input, PageHeader,
} from '@/components/ui'
import { loadSession } from '@/features/auth/session'

export function AccountPage() {
  const { user, logout, backend } = useAuth()
  const { company } = useOrg()
  const [pwOpen, setPwOpen] = useState(false)
  // In backend mode the session lives in an httpOnly cookie that JavaScript cannot read —
  // by design. Only the legacy mock path exposes an expiry to display.
  const session = backend ? null : loadSession()

  if (!user) return null

  return (
    <>
      <PageHeader title="My account" subtitle="Profile, memberships and session security" />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Profile" />
          <CardBody className="flex items-center gap-4">
            <Avatar name={user.name} size={56} />
            <div className="min-w-0">
              <p className="text-lg font-semibold text-ink">{user.name}</p>
              <p className="text-sm text-ink-2">{user.title}</p>
              <p className="text-xs text-muted">{user.email}</p>
            </div>
          </CardBody>
          <CardBody className="border-t">
            <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted">Memberships</p>
            <ul className="space-y-2">
              {user.memberships.map((m) => (
                <li key={m.companyId} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-ink">{m.companyId === company?.id ? `${company.name} (active)` : m.companyId.toUpperCase()}</span>
                  <Badge tone={m.companyId === company?.id ? 'accent' : 'neutral'}>{ROLE_LABEL[m.role]}</Badge>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Security" subtitle="Password and two-factor authentication" />
            <CardBody className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-ink">Password</p>
                  {/* States the policy the server actually enforces — see validatePasswordStrength. */}
                  <p className="text-2xs text-muted">
                    At least 12 characters, with an uppercase letter and a number
                  </p>
                </div>
                <Button variant="secondary" size="sm" icon={<KeyRound size={13} />} onClick={() => setPwOpen(true)}>
                  Change
                </Button>
              </div>
              <div className="flex items-center justify-between gap-3 border-t pt-3">
                <div>
                  <p className="text-sm font-medium text-ink">Two-factor authentication</p>
                  <p className="text-2xs text-muted">
                    Enabled per account by your workspace administrator
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>

          <PreferencesCard />

          <Card>
            <CardHeader title="Active session" />
            <CardBody className="space-y-3">
              <div className="flex items-start gap-3 text-sm">
                <Monitor size={16} className="mt-0.5 text-muted" />
                <div>
                  <p className="font-medium text-ink">This browser</p>
                  <p className="text-2xs text-muted">
                    {backend
                      ? 'Signed in · session held in a secure server-side cookie'
                      : session
                        ? `Signed in · expires ${new Date(session.expiresAt).toLocaleString()}`
                        : 'Session state unavailable'}
                  </p>
                </div>
              </div>
              <Alert tone="info">
                Sessions expire automatically after 8 hours. Sign out on shared site-office computers.
              </Alert>
              <Button variant="danger" size="sm" onClick={() => void logout()}>
                Sign out of this session
              </Button>
            </CardBody>
          </Card>
        </div>
      </div>

      <ChangePasswordDialog open={pwOpen} onClose={() => setPwOpen(false)} />
    </>
  )
}

/** Mirrors the server's policy so the user is told before a round trip, not after. */
function passwordProblem(pw: string): string | null {
  if (pw.length < 12) return 'At least 12 characters.'
  if (!/[a-z]/.test(pw)) return 'Include a lowercase letter.'
  if (!/[A-Z]/.test(pw)) return 'Include an uppercase letter.'
  if (!/[0-9]/.test(pw)) return 'Include a number.'
  return null
}

function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<number | null>(null)

  const reset = () => {
    setCurrent(''); setNext(''); setConfirm('')
    setError(null); setDone(null); setBusy(false)
  }

  const close = () => { reset(); onClose() }

  // Only shown once the field has been touched — telling someone their empty password is
  // too short before they have typed is nagging, not help.
  const strength = next.length > 0 ? passwordProblem(next) : null
  const mismatch = confirm.length > 0 && next !== confirm
  const canSubmit = current.length > 0 && next.length > 0 && !strength && !mismatch && !busy

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const { revokedSessions } = await accountApi.changePassword(current, next)
      setDone(revokedSessions)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not change your password. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done !== null) {
    return (
      <Dialog
        open={open}
        onClose={close}
        title="Password changed"
        footer={<Button onClick={close}>Done</Button>}
      >
        <Alert tone="success">
          Your password has been updated. You are still signed in on this device.
        </Alert>
        <p className="mt-3 text-sm text-ink-2">
          {done === 0
            ? 'No other devices were signed in.'
            : `${done} other session${done === 1 ? '' : 's'} ${done === 1 ? 'was' : 'were'} signed out — sign in again with the new password on ${done === 1 ? 'that device' : 'those devices'}.`}
        </p>
      </Dialog>
    )
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Change password"
      description="Your other devices will be signed out. This one stays signed in."
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={!canSubmit}>
            {busy ? 'Changing…' : 'Change password'}
          </Button>
        </>
      }
    >
      {error && <Alert tone="critical" className="mb-3">{error}</Alert>}
      <div className="space-y-3">
        <Input
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder="••••••••••"
        />
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder="••••••••••"
          hint={strength ? undefined : 'At least 12 characters, with an uppercase letter and a number.'}
          error={strength ?? undefined}
        />
        <Input
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="••••••••••"
          error={mismatch ? 'The two passwords do not match.' : undefined}
        />
      </div>
    </Dialog>
  )
}

/**
 * Preferences.
 *
 * Theme stays in localStorage: it belongs to the device, and routing a dark-mode toggle
 * through the server would make it wait on the network. The other two are stored against
 * the account, because "where I start" should follow a person from their laptop to the
 * site office tablet.
 */
function PreferencesCard() {
  const { theme, toggle } = useTheme()
  const { sites, switchSite } = useOrg()
  const [prefs, setPrefs] = useState<UserPreferences | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    // Deliberately not the cached loader: that one falls back silently, and defaults shown
    // as if they were saved settings is the worst thing this card could do.
    accountApi.getPreferences()
      .then((p) => { setCachedPreferences(p); if (!cancelled) setPrefs(p) })
      .catch(() => { if (!cancelled) setError('Could not load your preferences.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const save = async (patch: Partial<UserPreferences>) => {
    // Optimistic: these are small, reversible settings and a spinner per dropdown would
    // be worse than a rare rollback.
    const previous = prefs
    setPrefs((p) => (p ? { ...p, ...patch } : p))
    setError(null)
    try {
      const next = await accountApi.updatePreferences(patch)
      setPrefs(next)
      setCachedPreferences(next)
      // Apply the site straight away. Waiting for the next sign-in to show any effect
      // reads as a setting that did nothing.
      if ('defaultSiteId' in patch) switchSite(next.defaultSiteId)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setPrefs(previous)
      setError(e instanceof ApiError ? e.message : 'Could not save that preference.')
    }
  }

  return (
    <div id="preferences">
      <Card>
      <CardHeader
        title="Preferences"
        subtitle="Theme is kept on this device; the rest follow you everywhere"
        right={saved ? <Badge tone="good">Saved</Badge> : undefined}
      />
      <CardBody className="space-y-4">
        {error && <Alert tone="critical">{error}</Alert>}

        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-ink">Appearance</p>
            <p className="text-2xs text-muted">Stored on this device only</p>
          </div>
          <Button variant="secondary" size="sm" onClick={toggle}>
            {theme === 'dark' ? 'Dark' : 'Light'}
          </Button>
        </div>

        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">Start on</p>
            <p className="text-2xs text-muted">The page you land on after signing in</p>
          </div>
          <select
            aria-label="Landing page"
            disabled={loading || !prefs}
            value={prefs?.landingPage ?? '/'}
            onChange={(e) => void save({ landingPage: e.target.value as LandingPage })}
            className="h-9 rounded-lg border bg-surface px-2.5 text-sm text-ink-2 outline-none disabled:opacity-50"
          >
            {LANDING_PAGES.map((p) => (
              <option key={p} value={p}>{LANDING_PAGE_LABEL[p]}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">Default site</p>
            <p className="text-2xs text-muted">Which site the app is scoped to when you sign in</p>
          </div>
          <select
            aria-label="Default site"
            disabled={loading || !prefs}
            value={prefs?.defaultSiteId ?? ''}
            onChange={(e) => void save({ defaultSiteId: e.target.value || null })}
            className="h-9 max-w-52 rounded-lg border bg-surface px-2.5 text-sm text-ink-2 outline-none disabled:opacity-50"
          >
            <option value="">All sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        </CardBody>
      </Card>
    </div>
  )
}
