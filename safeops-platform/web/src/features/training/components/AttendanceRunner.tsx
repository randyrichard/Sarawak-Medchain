import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Award, Check, PenLine, Send, UserCheck, X } from 'lucide-react'
import { api } from '@/api/client'
import { ApiError } from '@/api/types'
import type { CertificateView, SessionAttendee, SessionView } from '@/api/training'
import { EMPLOYEES } from '@/api/mock/fixtures'
import { useActor } from '@/features/incidents/lib'
import { Alert, Avatar, Badge, Button, Checkbox, Input } from '@/components/ui'
import { cn } from '@/lib/cn'

interface Row {
  employeeId: string
  employeeName: string
  present: boolean
  result: 'pass' | 'fail' | null
  score: string
}

/** Fast attendance & assessment — one tap per attendee, then sign to issue certs. */
export function AttendanceRunner({
  session, onClose, onCompleted,
}: {
  session: SessionView | null
  onClose: () => void
  onCompleted: () => void
}) {
  const actor = useActor()
  const [rows, setRows] = useState<Row[]>([])
  const [signature, setSignature] = useState('')
  const [attested, setAttested] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [issued, setIssued] = useState<CertificateView[] | null>(null)

  useEffect(() => {
    if (!session) return
    setError(null)
    setIssued(null)
    setSignature('')
    setAttested(false)
    setRows(
      session.enrolled.map((id) => {
        const emp = EMPLOYEES.find((e) => e.id === id)
        return { employeeId: id, employeeName: emp?.name ?? id, present: true, result: 'pass' as const, score: '85' }
      }),
    )
  }, [session?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const present = rows.filter((r) => r.present).length
  const passing = rows.filter((r) => r.present && r.result === 'pass').length
  const incomplete = rows.some((r) => r.present && r.result === null)
  const canSubmit = present > 0 && !incomplete && signature.trim().length >= 5 && attested

  const set = (id: string, p: Partial<Row>) => setRows((cur) => cur.map((r) => (r.employeeId === id ? { ...r, ...p } : r)))
  const allPresent = useMemo(() => rows.every((r) => r.present), [rows])

  const submit = async () => {
    if (!session) return
    setBusy(true)
    setError(null)
    const attendance: SessionAttendee[] = rows.map((r) => ({
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      present: r.present,
      result: r.present ? r.result : null,
      score: r.present && r.score ? Number(r.score) : undefined,
    }))
    try {
      const res = await api.completeSession(session.id, { attendance, signature }, actor)
      setIssued(res.certificates)
      onCompleted()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not complete the session.')
    } finally {
      setBusy(false)
    }
  }

  if (!session) return null

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 animate-fade-in bg-black/40" onClick={issued ? onClose : undefined} aria-hidden />
      <aside role="dialog" aria-label={`Attendance ${session.code}`} className="absolute inset-y-0 right-0 flex w-full max-w-[520px] animate-scale-in flex-col border-l bg-surface shadow-modal">
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0">
            <p className="font-mono text-2xs text-muted">{session.code} · {session.mode}</p>
            <h2 className="text-lg font-semibold leading-snug tracking-tight text-ink">{session.courseName}</h2>
            <p className="text-2xs text-muted">{session.scheduledFor} · {session.venue} · trainer {session.trainer}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-accent-soft hover:text-ink"><X size={16} /></button>
        </div>

        {issued ? (
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-6">
            <div className="flex flex-col items-center gap-2 py-3 text-center">
              <Award size={36} style={{ color: 'var(--good)' }} />
              <p className="text-lg font-semibold text-ink">{issued.length} certificate(s) issued</p>
              <p className="max-w-sm text-sm leading-relaxed text-ink-2">
                Certificates are live in the competency matrix and each holder's profile. Expiry reminders are now scheduled automatically.
              </p>
            </div>
            <ul className="space-y-1.5">
              {issued.map((c) => (
                <li key={c.id}>
                  <Link to={`/training?verify=${c.number}`} className="flex items-center justify-between rounded-lg border px-3.5 py-2.5 text-sm transition-colors hover:bg-accent-soft/50">
                    <span className="flex items-center gap-2"><Avatar name={c.employeeName} size={20} /> {c.employeeName}</span>
                    <span className="font-mono text-2xs text-accent">{c.number}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <Button className="w-full" onClick={onClose}>Done</Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b px-5 py-2">
              <span className="text-2xs text-muted">{present}/{rows.length} present · {passing} passing</span>
              <button
                onClick={() => setRows((cur) => cur.map((r) => ({ ...r, present: !allPresent })))}
                className="inline-flex items-center gap-1 text-2xs font-semibold text-accent hover:underline"
              >
                <UserCheck size={12} /> {allPresent ? 'Mark all absent' : 'Mark all present'}
              </button>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
              {error && <Alert tone="critical">{error}</Alert>}
              {rows.length === 0 && <p className="py-6 text-center text-sm text-muted">No one enrolled — add participants first.</p>}
              {rows.map((r) => (
                <div key={r.employeeId} className={cn('rounded-xl border p-3 transition-opacity', !r.present && 'opacity-55')}>
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={() => set(r.employeeId, { present: !r.present })}
                      className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md border', r.present ? 'text-white' : 'text-muted')}
                      style={r.present ? { background: 'var(--good)', borderColor: 'var(--good)' } : undefined}
                      aria-label={r.present ? 'Present' : 'Absent'}
                    >
                      {r.present && <Check size={14} strokeWidth={3} />}
                    </button>
                    <Avatar name={r.employeeName} size={26} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{r.employeeName}</span>
                    {r.present && (
                      <div className="flex items-center gap-1.5">
                        <div className="flex overflow-hidden rounded-lg border">
                          {(['pass', 'fail'] as const).map((res) => (
                            <button
                              key={res}
                              onClick={() => set(r.employeeId, { result: res })}
                              className={cn('px-2.5 py-1 text-2xs font-bold uppercase', r.result === res ? 'text-white' : 'text-ink-2')}
                              style={r.result === res ? { background: res === 'pass' ? 'var(--good)' : 'var(--critical)' } : undefined}
                            >
                              {res}
                            </button>
                          ))}
                        </div>
                        <input
                          value={r.score}
                          onChange={(e) => set(r.employeeId, { score: e.target.value.replace(/\D/g, '').slice(0, 3) })}
                          className="h-7 w-12 rounded-lg border bg-surface px-1.5 text-center text-2xs text-ink outline-none focus:border-accent"
                          aria-label="Score"
                          placeholder="%"
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}

              <div className="rounded-xl border px-4 py-3" style={{ borderColor: 'var(--accent)' }}>
                <p className="mb-2 flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-accent"><PenLine size={11} /> Trainer signature</p>
                <Input placeholder={actor.name} value={signature} onChange={(e) => setSignature(e.target.value)} aria-label="Type your full name to sign" />
                {signature.trim().length >= 5 && <p className="mt-1.5 border-b pb-1 font-mono text-base italic text-ink">{signature}</p>}
                <div className="mt-2"><Checkbox label="I confirm attendance and assessment results are accurate." checked={attested} onChange={(e) => setAttested(e.target.checked)} /></div>
              </div>
            </div>

            <div className="border-t px-5 py-3">
              {passing > 0 && <p className="mb-2 text-2xs font-semibold text-good">{passing} certificate(s) will be issued on submit.</p>}
              <Button className="w-full" size="lg" icon={<Send size={14} />} loading={busy} disabled={!canSubmit} onClick={() => void submit()}>
                {incomplete ? 'Set Pass/Fail for every present attendee' : 'Complete session & issue certificates'}
              </Button>
            </div>
          </>
        )}
      </aside>
    </div>,
    document.body,
  )
}
