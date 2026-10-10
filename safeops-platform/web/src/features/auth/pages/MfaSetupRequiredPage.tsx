import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { Alert, Button } from '@/components/ui'
import { MfaEnrolment } from '@/features/account/mfa/MfaEnrolment'
import { useAuth } from '../AuthContext'
import { AuthLayout } from './AuthLayout'

/**
 * Shown instead of the app when a workspace requires multi-factor sign-in and this person
 * has not set it up.
 *
 * The same rule as the forced password change: no dismiss button, because the API refuses
 * everything but the setup until it is done (requireAuth), and a gate that can be skipped
 * is a suggestion. Signing out is the only other way off this screen.
 */
export function MfaSetupRequiredPage() {
  const { user, reload, logout } = useAuth()
  const [error, setError] = useState<string | null>(null)

  const finish = async () => {
    try {
      // The token in hand was minted before setup and still says it is required.
      await reload()
    } catch {
      setError('Multi-factor sign-in is on, but the session could not be refreshed. Sign in again.')
    }
  }

  return (
    <AuthLayout>
      <h1 className="text-xl font-semibold tracking-tight text-ink">Set Up Multi-Factor Sign-In</h1>
      <p className="mt-1 text-sm text-ink-2">
        Your organisation requires a code from an authenticator app, as well as your password,
        every time {user?.email ?? 'you'} signs in. It takes about a minute.
      </p>
      <div className="mt-6 space-y-4">
        {error && <Alert tone="critical">{error}</Alert>}
        <MfaEnrolment onDone={() => void finish()} />
        <Button variant="ghost" size="sm" icon={<LogOut size={13} />} onClick={() => void logout()}>
          Sign Out Instead
        </Button>
      </div>
    </AuthLayout>
  )
}
