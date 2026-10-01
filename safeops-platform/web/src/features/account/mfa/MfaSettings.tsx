import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ShieldCheck, ShieldOff } from 'lucide-react'
import { mfaApi, type MfaStatus } from '@/api/mfaApi'
import { ApiError } from '@/api/types'
import { Alert, Badge, Button, Dialog, Input, PasswordInput } from '@/components/ui'
import { MfaEnrolment, RecoveryCodes } from './MfaEnrolment'

/**
 * The multi-factor row on My account: its state, and the three things a person can do
 * with it - set it up, replace their recovery codes, turn it off.
 *
 * This row used to say "Enabled per account by your workspace administrator", which was
 * true only of a flag that protected nothing.
 */
export function MfaSettings({ backend }: { backend: boolean }) {
  const [status, setStatus] = useState<MfaStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'setup' | 'codes' | 'off' | null>(null)

  const load = useCallback(() => {
    if (!backend) return
    mfaApi.status().then(setStatus).catch(() => setError('Could not load your multi-factor settings.'))
  }, [backend])
  useEffect(load, [load])

  const close = () => { setDialog(null); load() }

  return (
    <div className="border-t pt-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-ink">
            Multi-factor sign-in
            {status?.enabled && <Badge tone="good" className="gap-1"><ShieldCheck size={10} /> On</Badge>}
            {status && !status.enabled && status.available && <Badge tone="neutral">Off</Badge>}
          </p>
          <p className="text-2xs text-muted">
            {!backend
              ? 'Available when this app is connected to a SafeOps server.'
              : !status
                ? 'A code from an authenticator app, as well as your password.'
                : !status.available
                  ? 'Not set up on this server yet. Ask whoever runs your SafeOps installation.'
                  : status.enabled
                    ? `A code from your authenticator app is needed to sign in. ${status.recoveryCodesRemaining} recovery code(s) left.`
                    : 'Add a code from an authenticator app to your sign-in, so a stolen password is not enough.'}
          </p>
        </div>
        {status?.available && !status.enabled && (
          <Button size="sm" className="shrink-0" icon={<ShieldCheck size={13} />} onClick={() => setDialog('setup')}>Set up</Button>
        )}
      </div>
      {error && <Alert tone="critical" className="mt-2">{error}</Alert>}
      {status?.enabled && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setDialog('codes')}>New recovery codes</Button>
          {status.required ? (
            <p className="self-center text-2xs text-muted">Required by your organisation, so it stays on.</p>
          ) : (
            <Button size="sm" variant="ghost" icon={<ShieldOff size={13} />} onClick={() => setDialog('off')}>Turn off</Button>
          )}
        </div>
      )}

      <Dialog open={dialog === 'setup'} onClose={close} title="Set up multi-factor sign-in" width="max-w-lg">
        {dialog === 'setup' && <MfaEnrolment onDone={close} />}
      </Dialog>
      <Dialog open={dialog === 'codes'} onClose={close} title="New recovery codes"
        description="Your old recovery codes stop working as soon as these are made.">
        {dialog === 'codes' && <NewRecoveryCodes />}
      </Dialog>
      <Dialog open={dialog === 'off'} onClose={close} title="Turn off multi-factor sign-in?"
        description="Signing in will need your password only.">
        {dialog === 'off' && <TurnOff onDone={close} />}
      </Dialog>
    </div>
  )
}

function NewRecoveryCodes() {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [codes, setCodes] = useState<string[] | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      setCodes((await mfaApi.regenerateRecoveryCodes(code)).recoveryCodes)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That did not work. Try the newest code.')
    } finally {
      setBusy(false)
    }
  }

  if (codes) return <RecoveryCodes codes={codes} />
  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      {error && <Alert tone="critical">{error}</Alert>}
      <Input label="Code from your authenticator app" inputMode="numeric" autoComplete="one-time-code"
        value={code} onChange={(e) => setCode(e.target.value)} className="font-mono tracking-widest" autoFocus />
      <Button type="submit" loading={busy} disabled={!code.trim()}>Make new codes</Button>
    </form>
  )
}

function TurnOff({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await mfaApi.disable(password, code)
      onDone()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That did not work.')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      {error && <Alert tone="critical">{error}</Alert>}
      <PasswordInput label="Your password" autoComplete="current-password"
        value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
      <Input label="Code from your authenticator app, or a recovery code" autoComplete="one-time-code"
        value={code} onChange={(e) => setCode(e.target.value)} className="font-mono tracking-widest" />
      <Button type="submit" variant="danger" loading={busy} disabled={!password || !code.trim()}>
        Turn off
      </Button>
    </form>
  )
}
