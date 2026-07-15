import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, MailCheck } from 'lucide-react'
import { api } from '@/api/client'
import { Alert, Button, Input } from '@/components/ui'
import { AuthLayout } from './AuthLayout'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [demoToken, setDemoToken] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const { resetToken } = await api.requestPasswordReset(email)
    setDemoToken(resetToken)
    setSent(true)
    setBusy(false)
  }

  return (
    <AuthLayout>
      <Link to="/login" className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">
        <ArrowLeft size={13} /> Back to sign in
      </Link>
      <h1 className="text-xl font-semibold tracking-tight text-ink">Reset your password</h1>
      <p className="mt-1 text-sm text-ink-2">
        Enter your work email. If an account exists, we'll send a reset link that is valid for 15 minutes.
      </p>

      {sent ? (
        <div className="mt-6 space-y-4">
          <Alert tone="success" title="Check your email">
            If {email} has a SafeOps account, a reset link is on its way.
          </Alert>
          {demoToken && (
            <Alert tone="info" title="Demo shortcut (no email sending in Sprint 1)">
              Use this link:&nbsp;
              <Link to={`/reset-password?token=${demoToken}`} className="font-semibold text-accent underline">
                reset-password?token={demoToken}
              </Link>
            </Alert>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          <Input
            label="Work email" type="email" autoComplete="email" placeholder="you@company.com"
            value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus
          />
          <Button type="submit" size="lg" loading={busy} icon={<MailCheck size={15} />} className="w-full">
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
