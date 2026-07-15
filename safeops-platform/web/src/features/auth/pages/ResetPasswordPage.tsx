import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { api } from '@/api/client'
import { ApiError } from '@/api/types'
import { Alert, Button, Input } from '@/components/ui'
import { AuthLayout } from './AuthLayout'

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const strength = useMemo(() => {
    let s = 0
    if (password.length >= 10) s++
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) s++
    if (/\d/.test(password)) s++
    if (/[^A-Za-z0-9]/.test(password)) s++
    return s
  }, [password])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    try {
      await api.resetPassword(token, password)
      navigate('/login', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Reset failed. Request a new link.')
      setBusy(false)
    }
  }

  const strengthLabel = ['Too weak', 'Weak', 'Okay', 'Good', 'Strong'][strength]
  const strengthColor = ['var(--critical)', 'var(--critical)', 'var(--warning)', 'var(--good)', 'var(--good)'][strength]

  return (
    <AuthLayout>
      <h1 className="text-xl font-semibold tracking-tight text-ink">Choose a new password</h1>
      <p className="mt-1 text-sm text-ink-2">Minimum 10 characters. Mix cases, numbers and symbols for strength.</p>

      {!token ? (
        <div className="mt-6">
          <Alert tone="critical" title="Missing reset token">
            Open this page from the link in your reset email, or{' '}
            <Link to="/forgot-password" className="font-semibold underline">request a new link</Link>.
          </Alert>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          {error && <Alert tone="critical">{error}</Alert>}
          <div className="space-y-1.5">
            <Input
              label="New password" type="password" autoComplete="new-password"
              value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus
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
            error={confirm && confirm !== password ? 'Does not match the password above.' : undefined}
          />
          <Button type="submit" size="lg" loading={busy} icon={<KeyRound size={15} />} className="w-full" disabled={strength < 2}>
            Set new password
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
