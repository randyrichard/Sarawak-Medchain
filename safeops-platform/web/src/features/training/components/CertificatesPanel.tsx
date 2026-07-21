import { useEffect, useMemo, useState } from 'react'
import { BadgeCheck, Download, Printer, QrCode, Search, ShieldCheck, ShieldX } from 'lucide-react'
import { api } from '@/api/client'
import type { CertificateView, CertVerification } from '@/api/training'
import { useOrg } from '@/features/org/OrgContext'
import { Avatar, Badge, Button, Card, Dialog, EmptyState, Input, Skeleton, StatusPill } from '@/components/ui'
import { certStatusKind, exportCertsCsv, printCertificate } from '../lib'
import { cn } from '@/lib/cn'

type Filter = 'all' | 'expired' | 'expiring' | 'competent'

export function CertificatesPanel({
  certs, initialVerify, onOpenEmployee,
}: {
  certs: CertificateView[] | null
  initialVerify?: string
  onOpenEmployee: (employeeId: string) => void
}) {
  const { sites } = useOrg()
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [verifyCode, setVerifyCode] = useState('')
  const [verifyResult, setVerifyResult] = useState<CertVerification | null>(null)
  const [verifying, setVerifying] = useState(false)

  const siteName = (id: string) => sites.find((s) => s.id.toUpperCase() === id.toUpperCase())?.name ?? id

  const runVerify = async (code: string) => {
    setVerifying(true)
    setVerifyResult(null)
    const res = await api.verifyCertificate(code)
    setVerifyResult(res)
    setVerifying(false)
  }

  // QR deep link (?verify=CERT-...) opens the verifier pre-filled
  useEffect(() => {
    if (initialVerify) {
      setVerifyCode(initialVerify)
      setVerifyOpen(true)
      void runVerify(initialVerify)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialVerify])

  const rows = useMemo(() => {
    if (!certs) return []
    const query = q.trim().toLowerCase()
    return certs
      .filter((c) => filter === 'all' || c.status === filter)
      .filter((c) => !query || [c.number, c.employeeName, c.courseName].join(' ').toLowerCase().includes(query))
  }, [certs, filter, q])

  if (certs === null) {
    return <Card className="space-y-3 p-5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</Card>
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex min-w-52 flex-1 items-center gap-2 rounded-lg border bg-surface px-3 py-2 md:max-w-xs">
          <Search size={14} className="shrink-0 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number, holder, course…" className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted" />
        </div>
        {(['all', 'expired', 'expiring', 'competent'] as Filter[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn('rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors', filter === f ? 'bg-accent-soft text-ink' : 'text-ink-2 hover:text-ink')}
            style={filter === f ? { borderColor: 'var(--accent)' } : undefined}>
            {f}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="secondary" icon={<QrCode size={13} />} onClick={() => { setVerifyResult(null); setVerifyCode(''); setVerifyOpen(true) }}>
            Verify
          </Button>
          <Button size="sm" variant="ghost" icon={<Download size={12} />} onClick={() => exportCertsCsv(certs)}>Export</Button>
        </div>
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={BadgeCheck} title="No certificates match">Certificates are issued when a training session is passed.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] text-left">
              <thead>
                <tr className="border-b text-2xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-2.5 font-semibold">Certificate</th>
                  <th className="px-3 py-2.5 font-semibold">Holder</th>
                  <th className="px-3 py-2.5 font-semibold">Issued</th>
                  <th className="px-3 py-2.5 font-semibold">Expires</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className={cn('border-b last:border-0', c.status === 'expired' && 'bg-critical-soft/40')}>
                    <td className="px-5 py-3">
                      <p className="text-sm font-semibold leading-snug text-ink">{c.courseName}</p>
                      <p className="font-mono text-2xs text-muted">{c.number}{c.mandatory && ' · mandatory'}</p>
                    </td>
                    <td className="px-3 py-3">
                      <button onClick={() => onOpenEmployee(c.employeeId)} className="flex items-center gap-1.5 text-xs text-ink-2 hover:text-accent">
                        <Avatar name={c.employeeName} size={18} /> {c.employeeName}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-xs text-ink-2" style={{ fontVariantNumeric: 'tabular-nums' }}>{c.issueDate}</td>
                    <td className={cn('px-3 py-3 text-xs', c.status === 'expired' ? 'font-semibold text-critical' : 'text-ink-2')} style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {c.expiryDate ?? 'No expiry'}
                      {c.daysToExpiry !== null && <span className="block text-2xs font-normal text-muted">{c.daysToExpiry < 0 ? `${Math.abs(c.daysToExpiry)}d ago` : `in ${c.daysToExpiry}d`}</span>}
                    </td>
                    <td className="px-3 py-3"><StatusPill kind={certStatusKind(c.status)} label={c.status === 'competent' ? 'Valid' : c.status === 'expiring' ? 'Expiring' : 'Expired'} /></td>
                    <td className="px-5 py-3 text-right">
                      <Button size="sm" variant="ghost" icon={<Printer size={12} />} onClick={() => printCertificate(c, siteName(c.siteId))}>Print</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog
        open={verifyOpen}
        onClose={() => setVerifyOpen(false)}
        title="Verify a certificate"
        description="Scan a certificate QR code or enter its number — anyone can confirm authenticity."
        footer={<Button variant="secondary" onClick={() => setVerifyOpen(false)}>Close</Button>}
      >
        <div className="space-y-3">
          <div className="flex items-end gap-2">
            <Input label="Certificate number" value={verifyCode} onChange={(e) => setVerifyCode(e.target.value)} placeholder="CERT-2026-0001" className="flex-1" />
            <Button loading={verifying} onClick={() => void runVerify(verifyCode)} icon={<ShieldCheck size={14} />}>Verify</Button>
          </div>
          {verifyResult && (
            <div className="rounded-xl border p-4" style={{ borderColor: verifyResult.valid ? 'var(--good)' : 'var(--critical)', background: verifyResult.valid ? 'var(--good-soft)' : 'var(--critical-soft)' }}>
              <div className="flex items-center gap-2">
                {verifyResult.valid ? <ShieldCheck size={20} style={{ color: 'var(--good)' }} /> : <ShieldX size={20} style={{ color: 'var(--critical)' }} />}
                <p className="text-sm font-bold text-ink">{verifyResult.valid ? 'Authentic & valid' : 'Not valid'}</p>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-ink-2">{verifyResult.reason}</p>
              {verifyResult.certificate && (
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t pt-2.5 text-xs">
                  <div><dt className="text-muted">Holder</dt><dd className="font-semibold text-ink">{verifyResult.certificate.employeeName}</dd></div>
                  <div><dt className="text-muted">Course</dt><dd className="font-semibold text-ink">{verifyResult.certificate.courseName}</dd></div>
                  <div><dt className="text-muted">Issued</dt><dd className="text-ink-2">{verifyResult.certificate.issueDate}</dd></div>
                  <div><dt className="text-muted">Expires</dt><dd className="text-ink-2">{verifyResult.certificate.expiryDate ?? 'No expiry'}</dd></div>
                  <div><dt className="text-muted">Issued by</dt><dd className="text-ink-2">{verifyResult.certificate.issuedBy}</dd></div>
                  <div><dt className="text-muted">Site</dt><dd className="text-ink-2">{verifyResult.certificate.siteId}</dd></div>
                </dl>
              )}
              {verifyResult.certificate && verifyResult.valid && (
                <Button size="sm" variant="secondary" className="mt-3" icon={<Printer size={12} />} onClick={() => printCertificate(verifyResult.certificate!, siteName(verifyResult.certificate!.siteId))}>
                  Print certificate
                </Button>
              )}
            </div>
          )}
          {!verifyResult && !verifying && <Badge tone="neutral">Tip: certificate numbers look like CERT-2026-0001</Badge>}
        </div>
      </Dialog>
    </>
  )
}
