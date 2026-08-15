import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import { request } from '@/api/http'
import { ApiError } from '@/api/types'
import { Alert, Button, Input } from '@/components/ui'
import { policyProblem } from '../passwordPolicy'
import { AuthLayout } from './AuthLayout'

/**
 * Accepting an invitation.
 *
 * The invitee has no account to sign in with, so the token in the URL is the whole
 * authority. It is checked before anything is asked of them: a dead link says so
 * immediately rather than after somebody has chosen and confirmed a password.
 *
 * The workspace name is shown because an invitation that does not say who it is from is
 * indistinguishable from a phishing link.
 */


interface Preview {
  email: string
  companyName: string
  role: string
  invitedBy: string
  expiresAt: string
}

export function AcceptInvitationPage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()

  const [preview, setPreview] = useState<Preview | null>(null)
  // null = still asking the server whether this invitation is alive.
  const [valid, setValid] = useState<boolean | null>(null)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!token) { setValid(false); return }
    let cancelled = false
    request<Preview>(`/invitations/${encodeURIComponent(token)}`)
      .then((p) => { if (!cancelled) { setPreview(p); setValid(true) } })
      .catch(() => { if (!cancelled) setValid(false) })
    return () => { cancelled = true }
  }, [token])

  const problem = password ? policyProblem(password) : null
  const mismatch = confirm.length > 0 && password !== confirm

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (problem || mismatch || !password) return
    setBusy(true)
    setError(null)
    try {
      await request(`/invitations/${encodeURIComponent(token)}/accept`, {
        method: 'POST',
        body: JSON.stringify({ password, name: name.trim() || undefined }),
      })
      setDone(true)
      // Straight to sign-in: the account is active and the password is the one just set.
      setTimeout(() => navigate('/login', { replace: true }), 2500)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not accept this invitation.')
    } finally {
      setBusy(false)
    }
  }

  if (valid === null) {
    return (
      <AuthLayout>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Checking your invitation</h1>
        <p className="mt-2 text-sm text-ink-2">Verifying the link…</p>
      </AuthLayout>
    )
  }

  if (valid === false) {
    return (
      <AuthLayout>
        <h1 className="text-xl font-semibold tracking-tight text-ink">
          This invitation cannot be used
        </h1>
        <Alert tone="critical" className="mt-6">
          This invitation is invalid, expired or already used. Ask whoever invited you to
          send a new one.
        </Alert>
        <Link to="/login" className="mt-4 block text-xs font-semibold text-accent">
          Back to sign in
        </Link>
      </AuthLayout>
    )
  }

  if (done) {
    return (
      <AuthLayout>
        <h1 className="text-xl font-semibold tracking-tight text-ink">You&rsquo;re all set</h1>
        <Alert tone="success" className="mt-6" title="Your account is ready">
          Your password is set and your account is active. Taking you to sign in…
        </Alert>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <h1 className="text-xl font-semibold tracking-tight text-ink">
        Join {preview?.companyName ?? 'the workspace'}
      </h1>
      {/* Who invited you and as what: an invitation that says neither is a phishing link. */}
      <p className="mt-1 text-sm text-ink-2">
        {preview?.invitedBy ?? 'An administrator'} invited you as{' '}
        {preview?.role.replace(/_/g, ' ')}.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <div className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
          <UserPlus size={14} className="shrink-0 text-muted" />
          <span className="min-w-0 truncate text-xs text-ink">{preview?.email}</span>
        </div>

        <Input
          label="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="How your name should appear on records"
          autoComplete="name"
        />

        <Input
          label="Choose a password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={problem ?? undefined}
          autoComplete="new-password"
        />

        <Input
          label="Confirm password"
          type="password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={mismatch ? 'Both passwords must match.' : undefined}
          autoComplete="new-password"
        />

        {error && <Alert tone="critical">{error}</Alert>}

        <Button type="submit" className="w-full" disabled={busy || !password || !!problem || mismatch}>
          {busy ? 'Setting up…' : 'Accept invitation'}
        </Button>
      </form>
    </AuthLayout>
  )
}
