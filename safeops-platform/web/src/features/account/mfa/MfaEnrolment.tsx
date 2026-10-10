import { useEffect, useMemo, useState, type FormEvent } from 'react'
import qrcode from 'qrcode-generator'
import { Copy, Download, ShieldCheck } from 'lucide-react'
import { mfaApi } from '@/api/mfaApi'
import { ApiError } from '@/api/types'
import { Alert, Button, Input } from '@/components/ui'
import { chunk } from '@/lib/chunk'
import { saveBlob } from '@/lib/saveBlob'

/**
 * Setting up an authenticator app, start to finish.
 *
 * Three steps, each one a thing the person does rather than reads: scan the code, type the
 * number the app shows, keep the recovery codes. Nothing is switched on until the typed
 * number proves the app has the secret, so abandoning this half way leaves the account
 * exactly as it was.
 *
 * Used from the account page and from the screen shown when a workspace requires MFA.
 */
export function MfaEnrolment({ onDone }: { onDone: () => void }) {
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)

  useEffect(() => {
    let cancelled = false
    mfaApi.beginSetup()
      .then((s) => { if (!cancelled) setSetup(s) })
      .catch((e) => { if (!cancelled) setError(e instanceof ApiError ? e.message : 'Setup could not start. Try again.') })
    return () => { cancelled = true }
  }, [])

  // An image data URL rather than injected SVG markup: nothing here becomes HTML.
  const qr = useMemo(() => {
    if (!setup) return null
    const q = qrcode(0, 'M')
    q.addData(setup.otpauthUri)
    q.make()
    return q.createDataURL(5, 2)
  }, [setup])

  const confirm = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = await mfaApi.enable(code)
      setRecoveryCodes(r.recoveryCodes)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That did not work. Try the newest code.')
    } finally {
      setBusy(false)
    }
  }

  if (recoveryCodes) {
    return (
      <div className="space-y-3">
        <Alert tone="success" title="Multi-factor sign-in is on">
          From now on, signing in asks for a code from your authenticator app.
        </Alert>
        <RecoveryCodes codes={recoveryCodes} />
        <Button className="w-full" icon={<ShieldCheck size={14} />} onClick={onDone}>
          I have saved my recovery codes
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={confirm} className="space-y-4" noValidate>
      {error && <Alert tone="critical">{error}</Alert>}
      <ol className="space-y-4 text-sm text-ink-2">
        <li>
          <p className="font-medium text-ink">1. Scan this with an authenticator app</p>
          <p className="text-2xs text-muted">
            Google Authenticator, Microsoft Authenticator, Authy or 1Password all work.
          </p>
          <div className="mt-2 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <div className="flex h-44 w-44 shrink-0 items-center justify-center rounded-xl border bg-white p-2">
              {qr ? <img src={qr} alt="QR code to add SafeChain to your authenticator app" className="h-full w-full" /> : (
                <span className="text-2xs text-neutral-500">Preparing…</span>
              )}
            </div>
            {setup && (
              <div className="min-w-0">
                <p className="text-2xs text-muted">Can&apos;t scan? Enter this key instead:</p>
                <p className="mt-1 break-all font-mono text-sm tracking-wider text-ink">
                  {chunk(setup.secret)}
                </p>
              </div>
            )}
          </div>
        </li>
        <li>
          <p className="font-medium text-ink">2. Enter the 6-digit code the app shows</p>
          <Input
            aria-label="Code from your authenticator app"
            inputMode="numeric" autoComplete="one-time-code" placeholder="123 456" maxLength={7}
            value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))}
            className="mt-2 max-w-40 font-mono tracking-widest"
          />
        </li>
      </ol>
      <Button type="submit" loading={busy} disabled={!setup || code.replace(/\s/g, '').length !== 6}>
        Turn on multi-factor sign-in
      </Button>
    </form>
  )
}

/**
 * The one-time recovery codes, with ways to keep them. Shown once: only digests are
 * stored, so there is no "show them again" - only "make new ones".
 */
export function RecoveryCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false)
  const text = `SafeChain recovery codes - each works once\n\n${codes.join('\n')}\n`
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  const download = () => {
    saveBlob(new Blob([text], { type: 'text/plain' }), 'safechain-recovery-codes.txt')
  }
  return (
    <div className="rounded-xl border p-3">
      <p className="text-sm font-medium text-ink">Recovery codes</p>
      <p className="text-2xs text-muted">
        If you lose your phone, each of these signs you in once. Keep them somewhere safe -
        this is the only time they are shown.
      </p>
      <ul className="mt-3 grid grid-cols-2 gap-1.5 font-mono text-sm text-ink">
        {codes.map((c) => <li key={c} className="rounded bg-sunken px-2 py-1 text-center">{c}</li>)}
      </ul>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="secondary" icon={<Copy size={12} />} onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button size="sm" variant="secondary" icon={<Download size={12} />} onClick={download}>
          Download
        </Button>
      </div>
    </div>
  )
}
