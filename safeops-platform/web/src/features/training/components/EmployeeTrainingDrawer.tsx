import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Award, BookOpen, CalendarClock, GraduationCap, Printer, TriangleAlert, X } from 'lucide-react'
import { api } from '@/api/client'
import { ApiError } from '@/api/types'
import type { EmployeeTrainingProfile } from '@/api/training'
import type { Actor } from '@/api/incidents'
import { useOrg } from '@/features/org/OrgContext'
import { useActor, fmtDate } from '@/features/incidents/lib'
import { Alert, Avatar, Badge, Button, Skeleton, StatusPill } from '@/components/ui'
import { certStatusKind, COMPETENCY_META, LEVEL_META, printCertificate } from '../lib'
import { cn } from '@/lib/cn'

export function EmployeeTrainingDrawer({
  employeeId, actor, manage, onClose, onChanged,
}: {
  employeeId: string | null
  actor: Actor
  manage: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const { sites } = useOrg()
  const me = useActor()
  const [profile, setProfile] = useState<EmployeeTrainingProfile | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [raised, setRaised] = useState<Record<string, string>>({})

  const load = (id: string) => api.getEmployeeTraining(id).then(setProfile)

  useEffect(() => {
    if (!employeeId) return
    setProfile(null)
    setError(null)
    setRaised({})
    void load(employeeId)
  }, [employeeId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!employeeId) return null
  const c = profile?.competency
  const siteName = (id: string) => sites.find((s) => s.id.toUpperCase() === id.toUpperCase())?.name ?? id

  const raiseAction = async (courseId: string) => {
    setBusy(courseId)
    setError(null)
    try {
      const capa = await api.raiseTrainingAction(employeeId, courseId, me)
      setRaised((r) => ({ ...r, [courseId]: capa.id }))
      onChanged()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not raise the action.')
    } finally {
      setBusy(null)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 animate-fade-in bg-black/40" onClick={onClose} aria-hidden />
      <aside role="dialog" aria-label="Employee training profile" className="absolute inset-y-0 right-0 flex w-full max-w-[540px] animate-scale-in flex-col border-l bg-surface shadow-modal">
        {!c ? (
          <div className="space-y-4 p-6"><Skeleton className="h-16 w-full" /><Skeleton className="h-40 w-full" /><Skeleton className="h-40 w-full" /></div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
              <div className="flex items-center gap-3">
                <Avatar name={c.name} size={44} />
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold leading-snug tracking-tight text-ink">{c.name}</h2>
                  <p className="text-2xs text-muted">{c.position} · {siteName(c.siteId)} · {c.department}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <StatusPill kind={LEVEL_META[c.level].kind} label={c.level} />
                    <span className="text-2xs text-muted">{c.compliancePct}% competency</span>
                  </div>
                </div>
              </div>
              <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-accent-soft hover:text-ink"><X size={16} /></button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              {error && <Alert tone="critical" onDismiss={() => setError(null)}>{error}</Alert>}

              {/* Snapshot */}
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  ['Required', c.requiredCount, 'var(--ink)'],
                  ['Current', c.competentCount, 'var(--good)'],
                  ['Expiring', c.expiringCount, 'var(--warning)'],
                  ['Gaps', c.gapCount, 'var(--critical)'],
                ].map(([label, val, color]) => (
                  <div key={label as string} className="rounded-lg border py-2">
                    <p className="text-lg font-semibold" style={{ color: color as string, fontVariantNumeric: 'tabular-nums' }}>{val as number}</p>
                    <p className="text-2xs text-muted">{label}</p>
                  </div>
                ))}
              </div>

              {/* Required competencies */}
              <div>
                <p className="mb-1.5 flex items-center gap-1 text-2xs font-bold uppercase tracking-wider text-muted"><BookOpen size={11} /> Mandatory & required training</p>
                <ul className="space-y-1.5">
                  {profile!.required.map((r) => {
                    const meta = COMPETENCY_META[r.status]
                    const isGap = r.status === 'expired' || r.status === 'missing'
                    return (
                      <li key={r.course.id} className="rounded-lg border px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: meta.color }} />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{r.course.name}</span>
                          {r.course.mandatory && <Badge tone="neutral">Mandatory</Badge>}
                          <span className="text-2xs font-semibold" style={{ color: meta.color }}>{meta.label}</span>
                        </div>
                        {isGap && r.course.mandatory && manage && (
                          raised[r.course.id] ? (
                            <Link to={`/actions?open=${raised[r.course.id]}`} className="mt-1.5 inline-block text-2xs font-semibold text-accent hover:underline">
                              Corrective action raised → track in CAPA
                            </Link>
                          ) : (
                            <Button size="sm" variant="ghost" className="mt-1.5" icon={<TriangleAlert size={11} />} loading={busy === r.course.id} onClick={() => void raiseAction(r.course.id)}>
                              Raise corrective action
                            </Button>
                          )
                        )}
                      </li>
                    )
                  })}
                  {profile!.required.length === 0 && <p className="text-xs text-muted">No mandatory training mapped to this role.</p>}
                </ul>
              </div>

              {/* Upcoming renewals */}
              {profile!.upcomingRenewals.length > 0 && (
                <div>
                  <p className="mb-1.5 flex items-center gap-1 text-2xs font-bold uppercase tracking-wider text-muted"><CalendarClock size={11} /> Upcoming renewals</p>
                  <ul className="space-y-1">
                    {profile!.upcomingRenewals.map((r) => (
                      <li key={r.courseName} className="flex items-center justify-between rounded-lg bg-warning-soft px-3 py-1.5 text-xs" style={{ background: 'var(--warning-soft)' }}>
                        <span className="text-ink">{r.courseName}</span>
                        <span className="font-semibold text-ink-2">{r.expiryDate} · {r.daysToExpiry}d</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Enrolled sessions */}
              {profile!.enrolledSessions.length > 0 && (
                <div>
                  <p className="mb-1.5 text-2xs font-bold uppercase tracking-wider text-muted">Enrolled sessions</p>
                  <ul className="space-y-1">
                    {profile!.enrolledSessions.map((s) => (
                      <li key={s.id} className="flex items-center justify-between rounded-lg border px-3 py-1.5 text-xs">
                        <span className="text-ink">{s.courseName}</span>
                        <span className="text-2xs text-muted">{s.scheduledFor} · {s.venue}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Certificates */}
              <div>
                <p className="mb-1.5 flex items-center gap-1 text-2xs font-bold uppercase tracking-wider text-muted"><GraduationCap size={11} /> Digital certificates ({profile!.certificates.length})</p>
                <ul className="space-y-1.5">
                  {profile!.certificates.map((cert) => (
                    <li key={cert.id} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                      <Award size={14} className="shrink-0 text-accent" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{cert.courseName}</p>
                        <p className="font-mono text-2xs text-muted">{cert.number} · exp {cert.expiryDate ?? 'none'}</p>
                      </div>
                      <StatusPill kind={certStatusKind(cert.status)} label={cert.status === 'competent' ? 'Valid' : cert.status === 'expiring' ? 'Expiring' : 'Expired'} />
                      <Button size="sm" variant="ghost" icon={<Printer size={11} />} onClick={() => printCertificate(cert, siteName(cert.siteId))} aria-label="Print certificate" />
                    </li>
                  ))}
                  {profile!.certificates.length === 0 && <p className="text-xs text-muted">No certificates on record yet.</p>}
                </ul>
              </div>

              {/* Learning history */}
              <div>
                <p className="mb-2 text-2xs font-bold uppercase tracking-wider text-muted">Learning timeline</p>
                <ol className="relative space-y-3 before:absolute before:bottom-1.5 before:left-[5px] before:top-1.5 before:w-px before:bg-grid">
                  {profile!.history.map((h, i) => (
                    <li key={i} className="relative flex gap-3">
                      <span className="z-10 mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2 bg-surface"
                        style={{ borderColor: h.kind === 'expired' ? 'var(--critical)' : h.kind === 'certified' ? 'var(--good)' : 'var(--baseline)' }} />
                      <div className="min-w-0 flex-1">
                        <p className={cn('text-sm leading-snug', h.kind === 'expired' ? 'text-critical' : 'text-ink')}>{h.text}</p>
                        <p className="text-2xs text-muted">{fmtDate(h.at)}</p>
                      </div>
                    </li>
                  ))}
                  {profile!.history.length === 0 && <p className="text-xs text-muted">No training history yet.</p>}
                </ol>
              </div>
            </div>
          </>
        )}
      </aside>
    </div>,
    document.body,
  )
}
