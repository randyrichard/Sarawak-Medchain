import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, MailCheck, Send } from 'lucide-react'
import { authApi } from '@/api/authApi'
import { explainNetworkFailure } from '@/api/networkError'
import { ApiError } from '@/api/types'
import { Alert, Button, Input } from '@/components/ui'
import { AuthLayout } from './AuthLayout'

/**
 * Self-service password reset.
 *
 * Until email delivery existed this page could only explain who to ask for a link, which
 * stranded the people most likely to need one - a sole administrator has no peer, and a
 * platform administrator belongs to no company at all. Now it asks the server to send one.
 *
 * ── Why the confirmation never says whether the account exists ────────────────
 * The endpoint answers identically for a real address and an invented one, and this screen
 * has to preserve that or it hands the oracle back through the UI. So the success state is
 * shown for every well-formed submission, worded to be true either way: "if that address
 * has an account". A message reading "sent!" for members and "no such user" for everybody
 * else would let anyone check who works at a customer, which is the reconnaissance step
 * before a phishing run.
 *
 * The same reasoning covers failure. Delivery problems are not surfaced here - the server
 * logs them - because an error shown only for real addresses is the same oracle wearing a
 * different hat.
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await authApi.requestPasswordReset(email.trim())
      setSent(true)
    } catch (e) {
      /*
       * Only reachable when the request itself could not be made - offline, the API
       * unreachable, or the rate limiter refusing. Never "that account does not exist",
       * which the server does not tell us and this screen must not imply.
       *
       * The message comes from the error rather than being hardcoded here, so a blocked
       * cross-origin request says so instead of blaming the reader's connection. This page
       * had its own copy of the old wording, which is why it kept saying "check your
       * connection" while the server was answering perfectly well.
       */
      setError(e instanceof ApiError ? e.message : explainNetworkFailure())
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <AuthLayout>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Check your email</h1>
        <div className="mt-6 space-y-4">
          <Alert tone="success" title="If that address has an account, a link is on its way">
            It works once and expires in 30 minutes. If nothing arrives within a few minutes,
            check your spam folder.
          </Alert>
          <p className="text-xs leading-relaxed text-muted">
            Still nothing? Your workspace administrator can issue a link directly from{' '}
            <span className="font-medium text-ink-2">Administration &rarr; Users</span>. If you
            are the administrator, contact SafeOps support.
          </p>
          <Link to="/login">
            <Button variant="secondary" size="lg" className="w-full">Back to sign in</Button>
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <h1 className="text-xl font-semibold tracking-tight text-ink">Reset your password</h1>
      <p className="mt-1 text-sm text-ink-2">
        Enter your work email and we will send you a link to choose a new one.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        {error && <Alert tone="critical">{error}</Alert>}
        <Input
          label="Work email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />
        <Button
          type="submit" size="lg" loading={busy} icon={<Send size={15} />} className="w-full"
          disabled={email.trim().length === 0}
        >
          Send reset link
        </Button>
      </form>

      <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-muted">
        <span className="mt-0.5 shrink-0" aria-hidden="true"><MailCheck size={13} /></span>
        <span>
          Links work once and expire after 30 minutes. Nobody, including SafeOps, ever holds a
          working password for your account.
        </span>
      </p>

      <Link
        to="/login"
        className="mt-6 inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-accent
                   transition-colors hover:text-ink focus:outline-none focus-visible:ring-2
                   focus-visible:ring-accent"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Back to sign in
      </Link>
    </AuthLayout>
  )
}
