import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { LogIn } from 'lucide-react'
import { useAuth } from '../AuthContext'
import { safeInternalPath } from '../safeRedirect'
import { loadPreferences } from '@/features/account/preferences'
import { ApiError, ROLE_LABEL, type Role } from '@/api/types'
import { Alert, Button, Checkbox, Input } from '@/components/ui'
import { AuthLayout } from './AuthLayout'
import { shouldShowDemoLogins } from '../demoLogins'

const DEMO_ACCOUNTS: { role: Role; email: string }[] = [
  { role: 'ceo', email: 'ceo@demo.safeops.app' },
  { role: 'admin', email: 'admin@demo.safeops.app' },
  { role: 'hse_manager', email: 'hse@demo.safeops.app' },
  { role: 'safety_officer', email: 'officer@demo.safeops.app' },
  { role: 'supervisor', email: 'supervisor@demo.safeops.app' },
  { role: 'employee', email: 'employee@demo.safeops.app' },
]
// Must match the API seed (prisma/seed.ts). Length satisfies the server-side policy.
/*
 * Written so the literal cannot reach a production bundle.
 *
 * Vite replaces `import.meta.env.DEV` with a constant at build time, so in a production
 * build this folds to the env lookup and the string below is eliminated as dead code -
 * hiding the panel alone was not enough, because the constant still shipped in the
 * JavaScript and anybody could read it with view-source. A deliberate demo deployment
 * supplies VITE_DEMO_PASSWORD at build time instead.
 */
const DEMO_PASSWORD = import.meta.env.DEV
  ? 'SafeOpsPlatform2026'
  : (import.meta.env.VITE_DEMO_PASSWORD ?? '')

// Build-time constant: the demo accounts must never appear on a customer's login page.
const showDemoLogins = shouldShowDemoLogins(import.meta.env)

/**
 * Where to land after signing in.
 *
 * A deep link the user was bounced off wins — they asked for that page. Only when they
 * came to the login screen directly does their landing-page preference decide. Both go
 * through the open-redirect guard.
 */
async function destination(from: string): Promise<string> {
  if (from !== '/') return from
  const { landingPage } = await loadPreferences()
  return safeInternalPath(landingPage)
}

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // Sanitise the post-login destination — never trust a caller-supplied redirect target.
  const from = safeInternalPath((location.state as { from?: string } | null)?.from)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [remember, setRemember] = useState(true)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(email, password, remember)
      navigate(await destination(from), { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.')
      setBusy(false)
    }
  }

  const quickLogin = async (demoEmail: string) => {
    setBusy(true)
    setError(null)
    try {
      await login(demoEmail, DEMO_PASSWORD)
      navigate(await destination(from), { replace: true })
    } catch {
      setError('Demo login failed.')
      setBusy(false)
    }
  }

  return (
    <AuthLayout>
      <h1 className="text-xl font-semibold tracking-tight text-ink">Sign in</h1>
      <p className="mt-1 text-sm text-ink-2">Welcome back. Your sites are waiting.</p>

      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        {error && <Alert tone="critical">{error}</Alert>}
        <Input
          label="Work email" type="email" autoComplete="email" placeholder="you@company.com"
          value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus
        />
        <Input
          label="Password" type="password" autoComplete="current-password" placeholder="••••••••••"
          value={password} onChange={(e) => setPassword(e.target.value)} required
        />
        <div className="flex items-center justify-between">
          <Checkbox
            label="Keep me signed in"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          {/*
            Recovery is administrator-issued: an admin creates a single-use link from the
            user console and passes it on. Self-service arrives with email delivery — until
            then a "Forgot password?" link would lead nowhere, which is worse than saying
            plainly who can help.
          */}
          <span className="text-xs text-muted">
            Forgot it? Ask your workspace admin.
          </span>
        </div>
        <Button type="submit" size="lg" loading={busy} icon={<LogIn size={15} />} className="w-full">
          Sign in
        </Button>
      </form>

      {showDemoLogins && (
      <div className="mt-8">
        <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted">
          Demo workspace — sign in as any role
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {DEMO_ACCOUNTS.map((d) => (
            <button
              key={d.role}
              disabled={busy}
              onClick={() => void quickLogin(d.email)}
              className="rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium text-ink-2 transition-colors hover:bg-accent-soft hover:text-ink disabled:opacity-50"
            >
              {ROLE_LABEL[d.role]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-2xs text-muted">Shared demo password: {DEMO_PASSWORD}</p>
      </div>
      )}
    </AuthLayout>
  )
}
