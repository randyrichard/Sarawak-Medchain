import qrcode from 'qrcode-generator'
import type {
  CertificateView, CompetencyLevel, CompetencyStatus, CourseCategory, EmployeeCompetency,
} from '@/api/training'
import type { StatusKind } from '@/components/ui'

export const COMPETENCY_META: Record<CompetencyStatus, { color: string; label: string }> = {
  competent: { color: 'var(--good)', label: 'Competent' },
  expiring: { color: 'var(--warning)', label: 'Expiring' },
  expired: { color: 'var(--critical)', label: 'Expired' },
  missing: { color: 'var(--critical)', label: 'Not trained' },
  na: { color: 'var(--grid)', label: 'Not required' },
}

export const LEVEL_META: Record<CompetencyLevel, { kind: StatusKind; color: string }> = {
  'Fully Competent': { kind: 'good', color: 'var(--good)' },
  Competent: { kind: 'good', color: 'var(--s2)' },
  Developing: { kind: 'warning', color: 'var(--warning)' },
  'At Risk': { kind: 'critical', color: 'var(--critical)' },
}

export const CATEGORY_TONE: Record<CourseCategory, string> = {
  induction: 'var(--s1)',
  safety: 'var(--s6)',
  equipment: 'var(--s8)',
  emergency: 'var(--s3)',
  health: 'var(--s2)',
  environmental: 'var(--s4)',
  custom: 'var(--s5)',
}

export const certStatusKind = (s: CertificateView['status']): StatusKind =>
  s === 'competent' ? 'good' : s === 'expiring' ? 'warning' : 'critical'

export const canManageTraining = (role: string | null) => ['admin', 'hse_manager'].includes(role ?? '')
export const canRunSessions = (role: string | null) => ['admin', 'hse_manager', 'safety_officer'].includes(role ?? '')

/** QR-embedded printable digital certificate. */
export function printCertificate(cert: CertificateView, siteName: string) {
  const verifyUrl = `${window.location.origin}/training?verify=${encodeURIComponent(cert.number)}`
  const qr = qrcode(0, 'M')
  qr.addData(verifyUrl)
  qr.make()
  const qrSvg = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true })
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const html = `<!doctype html><html><head><title>${cert.number}</title><style>
    *{box-sizing:border-box}
    body{font-family:"Segoe UI",system-ui,sans-serif;margin:0;padding:40px;color:#111}
    .cert{border:3px double #1c5cab;border-radius:14px;padding:40px;max-width:820px;margin:0 auto;position:relative}
    .brand{color:#1c5cab;font-weight:800;letter-spacing:.5px;font-size:14px}
    .title{font-size:30px;font-weight:800;margin:18px 0 4px;color:#0d366b}
    .sub{color:#555;font-size:13px}
    .holder{font-size:26px;font-weight:700;margin:26px 0 2px}
    .course{font-size:18px;color:#1c5cab;font-weight:600}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 28px;margin:22px 0;font-size:13px;max-width:560px}
    .grid b{color:#000}
    .qr{position:absolute;top:36px;right:36px;width:120px;height:120px}
    .qr svg{width:100%;height:100%}
    .foot{margin-top:24px;display:flex;justify-content:space-between;align-items:flex-end;font-size:12px;color:#333}
    .sig{border-top:1px solid #333;padding-top:4px;min-width:200px;font-style:italic}
    @media print{body{padding:0}.cert{border-radius:0}}
  </style></head><body><div class="cert">
    <div class="qr">${qrSvg}</div>
    <div class="brand">SAFEOPS · SAFETY INTELLIGENCE PLATFORM</div>
    <div class="title">Certificate of Competency</div>
    <div class="sub">This certifies that</div>
    <div class="holder">${esc(cert.employeeName)}</div>
    <div class="sub">has successfully completed and is assessed competent in</div>
    <div class="course">${esc(cert.courseName)}</div>
    <div class="grid">
      <span><b>Certificate No:</b> ${cert.number}</span><span><b>Site:</b> ${esc(siteName)}</span>
      <span><b>Issued:</b> ${cert.issueDate}</span><span><b>Expires:</b> ${cert.expiryDate ?? 'No expiry'}</span>
      <span><b>Issued by:</b> ${esc(cert.issuedBy)}</span><span><b>Score:</b> ${cert.score ?? '—'}%</span>
    </div>
    <div class="foot">
      <span class="sig">${esc(cert.issuedBy)}<br>Authorised Trainer</span>
      <span>Scan the QR code to verify authenticity at any time.</span>
    </div>
  </div><script>window.onload=()=>window.print()</script></body></html>`
  const w = window.open('', '_blank', 'width=920,height=720')
  if (w) {
    w.document.write(html)
    w.document.close()
  }
}

function download(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const esc = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`

export function exportMatrixCsv(
  courses: { id: string; code: string; name: string }[],
  employees: EmployeeCompetency[],
) {
  const header = ['Employee', 'Position', 'Site', 'Department', 'Level', 'Compliance %', ...courses.map((c) => c.code)]
  const rows = employees.map((e) =>
    [e.name, e.position, e.siteId.toUpperCase(), e.department, e.level, e.compliancePct,
      ...courses.map((c) => e.cells[c.id]?.status ?? 'na')].map(esc).join(','),
  )
  download([header.map(esc).join(','), ...rows].join('\r\n'), 'safeops-competency-matrix.csv', 'text/csv;charset=utf-8')
}

export function exportCertsCsv(certs: CertificateView[]) {
  const header = ['Certificate No', 'Employee', 'Course', 'Site', 'Issued', 'Expires', 'Status', 'Days to expiry', 'Issued by']
  const rows = certs.map((c) =>
    [c.number, c.employeeName, c.courseName, c.siteId.toUpperCase(), c.issueDate, c.expiryDate ?? 'No expiry', c.status, c.daysToExpiry ?? '', c.issuedBy].map(esc).join(','),
  )
  download([header.map(esc).join(','), ...rows].join('\r\n'), 'safeops-certificates.csv', 'text/csv;charset=utf-8')
}
