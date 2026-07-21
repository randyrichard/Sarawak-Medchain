import type { AuditStatus, AuditView, FindingDerivedStatus, FindingSeverity } from '@/api/audits'
import { AUDIT_TYPE_LABEL } from '@/api/audits'
import type { StatusKind } from '@/components/ui'

export const SEVERITY_META: Record<FindingSeverity, { kind: StatusKind }> = {
  Critical: { kind: 'critical' },
  Major: { kind: 'serious' },
  Minor: { kind: 'warning' },
  Observation: { kind: 'info' },
}

export const AUDIT_STATUS_META: Record<AuditStatus, { kind: StatusKind }> = {
  Planned: { kind: 'info' },
  'In Progress': { kind: 'warning' },
  Completed: { kind: 'serious' }, // completed ≠ done: findings still open
  Closed: { kind: 'good' },
}

export const FINDING_STATUS_META: Record<FindingDerivedStatus, { kind: StatusKind }> = {
  Open: { kind: 'critical' },
  'Action In Progress': { kind: 'warning' },
  'Awaiting Verification': { kind: 'warning' },
  Closed: { kind: 'good' },
}

export const isComplianceManager = (role: string | null) => ['admin', 'hse_manager'].includes(role ?? '')

export const scoreColor = (score: number) =>
  score >= 85 ? 'var(--good)' : score >= 70 ? 'var(--warning)' : 'var(--critical)'

/** Printable audit report — opens a clean document and triggers the print dialog. */
export function printAuditReport(audit: AuditView, findings: { code: string; severity: string; category: string; description: string; status: string; actionCode: string; actionOwner: string; actionDue: string }[], siteName: string) {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const rows = findings
    .map(
      (f) => `<tr><td>${f.code}</td><td>${f.severity}</td><td>${esc(f.category)}</td><td>${esc(f.description)}</td><td>${f.actionCode} · ${esc(f.actionOwner)} · due ${f.actionDue}</td><td>${f.status}</td></tr>`,
    )
    .join('')
  const html = `<!doctype html><html><head><title>${audit.code} — Audit Report</title><style>
    body{font-family:"Segoe UI",system-ui,sans-serif;color:#111;margin:32px;font-size:13px}
    h1{font-size:20px;margin:0 0 2px}
    h2{font-size:14px;margin-top:20px}
    .meta{color:#555;margin-bottom:18px}
    .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:4px 24px;margin:14px 0;max-width:640px}
    .grid b{font-weight:600}
    table{border-collapse:collapse;width:100%;margin-top:10px;font-size:12px}
    th,td{border:1px solid #bbb;padding:6px 8px;text-align:left;vertical-align:top}
    th{background:#f0f2f5}
    .score{font-size:32px;font-weight:700}
    .sig{margin-top:28px;color:#333}
    @media print{body{margin:12mm}}
  </style></head><body>
    <h1>${audit.code} — ${esc(audit.title)}</h1>
    <p class="meta">SafeOps Audit Report · ${AUDIT_TYPE_LABEL[audit.type]} · Generated ${new Date().toLocaleString('en-MY')}</p>
    <div class="grid">
      <span><b>Site:</b> ${esc(siteName)}</span><span><b>Department:</b> ${esc(audit.department)}</span>
      <span><b>Lead auditor:</b> ${esc(audit.leadAuditor)}</span><span><b>Team:</b> ${esc(audit.team.join(', ') || '—')}</span>
      <span><b>Date:</b> ${audit.scheduledFor} (${audit.durationDays} day/s)</span><span><b>Status:</b> ${audit.status}</span>
    </div>
    ${audit.score !== undefined ? `<p>Audit score: <span class="score">${audit.score}%</span></p>` : ''}
    <h2>Findings (${findings.length})</h2>
    ${findings.length ? `<table><thead><tr><th>Ref</th><th>Severity</th><th>Category</th><th>Description</th><th>Corrective action</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>` : '<p>No findings raised.</p>'}
    ${audit.signature ? `<p class="sig">Digitally signed by <b>${esc(audit.signature)}</b>${audit.completedAt ? ` on ${new Date(audit.completedAt).toLocaleString('en-MY')}` : ''}${audit.gps ? ` · GPS ${audit.gps}` : ''}</p>` : ''}
    <script>window.onload = () => window.print()</script>
  </body></html>`
  const w = window.open('', '_blank', 'width=900,height=700')
  if (w) {
    w.document.write(html)
    w.document.close()
  }
}
