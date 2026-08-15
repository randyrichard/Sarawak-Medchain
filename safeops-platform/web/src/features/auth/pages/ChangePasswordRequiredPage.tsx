import { useState, type FormEvent } from 'react'
import { KeyRound } from 'lucide-react'
import { accountApi } from '@/api/accountApi'
import { ApiError } from '@/api/types'
import { Alert, Button, Input } from '@/components/ui'
import { useAuth } from '../AuthContext'
import { policyProblem } from '../passwordPolicy'
import { AuthLayout } from './AuthLayout'

/**
 * Forced password change.
 *
 * Shown instead of the app when the account is flagged `mustChangePassword`. Four things
 * set that flag — an administrator creating a user, forcing a reset, issuing a reset link,
 * or importing users in bulk — and until now nothing acted on it, so "Force password reset"
 * in the console changed a column and nothing else.
 *
 * It matters most at onboarding. The first administrator of a new workspace is created by
 * whoever deploys the system, with a password that person chose; without this screen that
 * password keeps working forever and the operator retains a login to the customer's
 * incident and audit records.
 *
 * There is deliberately no way past it but changing the password or signing out. A gate
 * with a dismiss button is a suggestion.
 */
export function ChangePasswordRequiredPage() {
  const { user, logout } = useAuth()

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const problem = next ? policyProblem(next) : null
  const mismatch = confirm.length > 0 && next !== confirm
  const same = next.length > 0 && next === current

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (problem || mismatch || same || !current || !next) return
    setBusy(true)
    setError(null)
    try {
      await accountApi.changePassword(current, next)
      /*
       * Sign out and back in, deliberately.
       *
       * The server spares this session and clears the flag, so reloading straight into the
       * app nearly works - but the password change rotates the refresh cookie, and a
       * reload fired immediately after the response can race that write and land on the
       * sign-in screen anyway. Rather than depend on the timing, the journey ends the same
       * way every time: sign in once with the password you just chose, which also proves
       * it works while the person is still paying attention.
       */
      setDone(true)
      await logout()
      setTimeout(() => window.location.replace('/login'), 1800)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change your password.')
      setBusy(false)
    }
  }

  if (done) {
    return (
      <AuthLayout>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Password changed</h1>
        <Alert tone="success" className="mt-6" title="Sign in with your new password">
          Every other session has been signed out. Taking you to the sign-in screen…
        </Alert>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <h1 className="text-xl font-semibold tracking-tight text-ink">Choose your own password</h1>
      <p className="mt-1 text-sm text-ink-2">
        This account is using a password somebody else set. Choose one only you know before
        continuing.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-3">
        <div className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
          <KeyRound size={14} className="shrink-0 text-muted" />
          <span className="min-w-0 truncate text-xs text-ink">{user?.email}</span>
        </div>

        <Input
          label="Current password"
          type="password"
          required
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          hint="The one you were given."
          autoComplete="current-password"
        />

        <Input
          label="New password"
          type="password"
          required
          value={next}
          onChange={(e) => setNext(e.target.value)}
          error={problem ?? (same ? 'Choose a different password from the current one.' : undefined)}
          autoComplete="new-password"
        />

        <Input
          label="Confirm new password"
          type="password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={mismatch ? 'Both passwords must match.' : undefined}
          autoComplete="new-password"
        />

        {error && <Alert tone="critical">{error}</Alert>}

        <Button
          type="submit"
          className="w-full"
          disabled={busy || !current || !next || !!problem || mismatch || same}
        >
          {busy ? 'Saving…' : 'Set my password'}
        </Button>
      </form>

      <button
        type="button"
        onClick={() => { void logout() }}
        className="mt-4 text-xs font-semibold text-muted hover:text-ink"
      >
        Sign out instead
      </button>
    </AuthLayout>
  )
}
