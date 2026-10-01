import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LogIn, ShieldCheck } from 'lucide-react'
import { useAuth } from '../AuthContext'
import { usePageTitle } from '@/app/pageTitle'
import { safeInternalPath } from '../safeRedirect'
import { loadPreferences } from '@/features/account/preferences'
import { getPlatformInfo } from '@/features/platform/usePlatformAdmin'
import { ApiError, ROLE_LABEL, type Role } from '@/api/types'
import { MfaRequiredError } from '@/api/authApi'
import { Alert, Button, Checkbox, Input, PasswordInput } from '@/components/ui'
import { AuthLayout } from './AuthLayout'
import { shouldShowDemoLogins } from '../demoLogins'

// Folded away in a production build for the same reason as the password below: these are
// the six accounts the demo seed creates, and listing them ships the naming convention.
const DEMO_ACCOUNTS: { role: Role; email: string }[] = import.meta.env.DEV
  || import.meta.env.VITE_DEMO_LOGINS === 'true' ? [
  { role: 'ceo', email: 'ceo@demo.safeops.app' },
  { role: 'admin', email: 'admin@demo.safeops.app' },
  { role: 'hse_manager', email: 'hse@demo.safeops.app' },
  { role: 'safety_officer', email: 'officer@demo.safeops.app' },
  { role: 'supervisor', email: 'supervisor@demo.safeops.app' },
  { role: 'employee', email: 'employee@demo.safeops.app' },
] : []
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
 *
 * `/platform` is the exception, and it is not hypothetical: a customer whose session
 * expired on a page linked from an email, or who simply had /platform open, was bounced to
 * the login screen and then - having signed in perfectly successfully - dropped straight
 * onto "This area is for SafeOps staff." Their first impression of the product is a wall,
 * with no indication they are even signed in.
 *
 * The refusal itself is right and stays: the console is staff-only and the server re-checks
 * every call. What is wrong is choosing it as a landing page for somebody who can never
 * open it. So the deep link is honoured only if they can actually use it, and otherwise
 * they go where they would have gone had they arrived at the login screen directly.
 */
export async function destination(from: string): Promise<string> {
  const wantsPlatform = from === '/platform' || from.startsWith('/platform/')
  if (from !== '/' && !wantsPlatform) return from
  if (wantsPlatform && (await getPlatformInfo()).platformAdmin) return from
  const { landingPage } = await loadPreferences()
  return safeInternalPath(landingPage)
}

export function LoginPage() {
  usePageTitle('Sign in')
  const { login, verifyMfa } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // Sanitise the post-login destination — never trust a caller-supplied redirect target.
  const from = safeInternalPath((location.state as { from?: string } | null)?.from)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [remember, setRemember] = useState(true)
  // Set once the password has been accepted and the account wants a code as well.
  const [challenge, setChallenge] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [useRecovery, setUseRecovery] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(email, password, remember)
      navigate(await destination(from), { replace: true })
    } catch (err) {
      if (err instanceof MfaRequiredError) {
        setChallenge(err.challenge)
        setBusy(false)
        return
      }
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.')
      setBusy(false)
    }
  }

  const submitCode = async (e: FormEvent) => {
    e.preventDefault()
    if (!challenge) return
    setBusy(true)
    setError(null)
    try {
      await verifyMfa(challenge, code)
      navigate(await destination(from), { replace: true })
    } catch (err) {
      setCode('')
      if (err instanceof ApiError && err.code === 'mfa_challenge_expired') {
        // Five minutes passed, or the account was locked meanwhile: back to the password.
        setChallenge(null)
        setPassword('')
      }
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.')
      setBusy(false)
    }
  }

  if (challenge) {
    return (
      <AuthLayout>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Enter your code</h1>
        <p className="mt-1 text-sm text-ink-2">
          {useRecovery
            ? 'Enter one of the recovery codes you saved when you set up multi-factor sign-in.'
            : 'Open your authenticator app and enter the 6-digit code for SafeOps.'}
        </p>
        <form onSubmit={submitCode} className="mt-6 space-y-4" noValidate>
          {error && <Alert tone="critical">{error}</Alert>}
          <Input
            label={useRecovery ? 'Recovery code' : 'Authentication code'}
            inputMode={useRecovery ? 'text' : 'numeric'} autoComplete="one-time-code"
            placeholder={useRecovery ? 'XXXX-XXXX' : '123 456'}
            value={code} onChange={(e) => setCode(e.target.value)} required autoFocus
            className="font-mono tracking-widest"
          />
          <Button type="submit" size="lg" loading={busy} icon={<ShieldCheck size={15} />} className="w-full"
            disabled={!code.trim()}>
            Verify and sign in
          </Button>
          <div className="flex items-center justify-between gap-3 text-xs">
            <button type="button" className="font-medium text-accent hover:text-ink"
              onClick={() => { setUseRecovery((v) => !v); setCode(''); setError(null) }}>
              {useRecovery ? 'Use the authenticator app instead' : 'Lost your phone? Use a recovery code'}
            </button>
            <button type="button" className="text-muted hover:text-ink"
              onClick={() => { setChallenge(null); setCode(''); setPassword(''); setError(null) }}>
              Back
            </button>
          </div>
        </form>
      </AuthLayout>
    )
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
        <PasswordInput
          label="Password" autoComplete="current-password" placeholder="••••••••••"
          value={password} onChange={(e) => setPassword(e.target.value)} required
        />
        {/*
          Recovery is administrator-issued: an admin creates a single-use link from the user
          console and passes it on, because this deployment has no email delivery.

          That constraint used to be explained in a paragraph here. It is now a link, for a
          plain reason - "Forgot password?" is the first thing anyone looks for on a sign-in
          screen, and a wall of small grey text where the link should be reads as a broken
          product rather than a deliberate choice. The page it leads to says the same thing
          with room to separate the two audiences it applies to, and it is where the form
          goes once email delivery exists.

          Sitting opposite the checkbox rather than under the button because that is where
          people already look for it.
        */}
        <div className="flex items-center justify-between gap-3">
          <Checkbox
            label="Keep me signed in"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          <Link
            to="/forgot-password"
            className="rounded text-xs font-medium text-accent transition-colors hover:text-ink
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-accent
                       coarse:inline-flex coarse:min-h-11 coarse:items-center"
          >
            Forgot password?
          </Link>
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
