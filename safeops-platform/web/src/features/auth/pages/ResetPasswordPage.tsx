import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { authApi } from '@/api/authApi'
import { ApiError } from '@/api/types'
import { Alert, Button, Input } from '@/components/ui'
import { AuthLayout } from './AuthLayout'

/** Mirrors the server policy, so the user is told before a round trip rather than after. */
function policyProblem(pw: string): string | null {
  if (pw.length < 12) return 'At least 12 characters.'
  if (!/[a-z]/.test(pw)) return 'Include a lowercase letter.'
  if (!/[A-Z]/.test(pw)) return 'Include an uppercase letter.'
  if (!/[0-9]/.test(pw)) return 'Include a number.'
  return null
}

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  // null = still asking the server whether this link is alive.
  const [linkValid, setLinkValid] = useState<boolean | null>(null)

  // Checking up front means a dead link says so immediately, instead of after the user
  // has chosen and confirmed a password.
  useEffect(() => {
    if (!token) return
    let cancelled = false
    authApi.checkResetToken(token)
      .then((ok) => { if (!cancelled) setLinkValid(ok) })
      .catch(() => { if (!cancelled) setLinkValid(false) })
    return () => { cancelled = true }
  }, [token])

  const strength = useMemo(() => {
    let s = 0
    if (password.length >= 12) s++
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) s++
    if (/\d/.test(password)) s++
    if (/[^A-Za-z0-9]/.test(password)) s++
    return s
  }, [password])

  const problem = password.length > 0 ? policyProblem(password) : null
  const mismatch = confirm.length > 0 && confirm !== password

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    try {
      await authApi.resetPassword(token, password)
      setDone(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Reset failed. Ask your administrator for a new link.')
      setBusy(false)
    }
  }

  const strengthLabel = ['Too weak', 'Weak', 'Okay', 'Good', 'Strong'][strength]
  const strengthColor = ['var(--critical)', 'var(--critical)', 'var(--warning)', 'var(--good)', 'var(--good)'][strength]

  if (done) {
    return (
      <AuthLayout>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Password updated</h1>
        <div className="mt-6 space-y-4">
          <Alert tone="success" title="You can sign in now">
            Your password has been changed and every other device has been signed out.
          </Alert>
          <Button size="lg" className="w-full" onClick={() => navigate('/login', { replace: true })}>
            Go to sign in
          </Button>
        </div>
      </AuthLayout>
    )
  }

  const deadLink = !token || linkValid === false

  return (
    <AuthLayout>
      <h1 className="text-xl font-semibold tracking-tight text-ink">Choose a new password</h1>
      <p className="mt-1 text-sm text-ink-2">
        At least 12 characters, including an uppercase letter and a number.
      </p>

      {deadLink ? (
        <div className="mt-6 space-y-4">
          <Alert tone="critical" title={token ? 'This link is no longer valid' : 'Missing reset link'}>
            Reset links are single-use and expire after 30 minutes. Ask your workspace
            administrator to issue a new one.
          </Alert>
          <Link to="/login">
            <Button variant="secondary" size="lg" className="w-full">Back to sign in</Button>
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          {error && <Alert tone="critical">{error}</Alert>}
          <div className="space-y-1.5">
            <Input
              label="New password" type="password" autoComplete="new-password"
              value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus
              error={problem ?? undefined}
            />
            {password && (
              <div className="flex items-center gap-2">
                <div className="flex h-1 flex-1 gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="flex-1 rounded-full" style={{ background: i < strength ? strengthColor : 'var(--grid)' }} />
                  ))}
                </div>
                <span className="text-2xs font-medium" style={{ color: strengthColor }}>{strengthLabel}</span>
              </div>
            )}
          </div>
          <Input
            label="Confirm new password" type="password" autoComplete="new-password"
            value={confirm} onChange={(e) => setConfirm(e.target.value)} required
            error={mismatch ? 'Does not match the password above.' : undefined}
          />
          <Button
            type="submit" size="lg" loading={busy} icon={<KeyRound size={15} />} className="w-full"
            disabled={!!problem || mismatch || confirm.length === 0 || linkValid === null}
          >
            Set new password
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
