import type { PermitView } from '@/api/permits'
import { GAS_LIMITS } from '@/api/permits'

const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
const fmt = (iso: string) => new Date(iso).toLocaleString('en-MY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/**
 * Printable permit.
 *
 * A permit has to exist on paper at the work face — displayed at the job, signed, and
 * kept for the regulator afterwards. This renders the full document: precautions with
 * who confirmed each, atmospheric readings, isolation register, signatures and the audit
 * trail, so the printout is the legal record rather than a summary of one.
 */
export function printPermit(p: PermitView) {
  const controls = p.controls.map((c) => `
    <tr>
      <td style="text-align:center">${c.confirmed ? '&#10003;' : '&#9744;'}</td>
      <td>${esc(c.label)}${c.required ? ' <b style="color:#b00">*</b>' : ''}</td>
      <td>${c.confirmedBy ? esc(c.confirmedBy) : '—'}</td>
      <td>${c.confirmedAt ? fmt(c.confirmedAt) : '—'}</td>
    </tr>`).join('')

  const gas = p.gasTests.length
    ? `<table><thead><tr><th>Time</th><th>Tested by</th><th>O&#8322; %</th><th>LEL %</th><th>H&#8322;S ppm</th><th>CO ppm</th><th>Result</th></tr></thead><tbody>
        ${p.gasTests.map((g) => `<tr>
          <td>${fmt(g.testedAt)}</td><td>${esc(g.testedBy)}</td>
          <td>${g.oxygenPct}</td><td>${g.lelPct}</td><td>${g.h2sPpm}</td><td>${g.coPpm}</td>
          <td style="font-weight:700;color:${g.pass ? '#0a7' : '#b00'}">${g.pass ? 'PASS' : 'FAIL'}</td>
        </tr>`).join('')}
      </tbody></table>
      <p class="small">Limits — O&#8322; ${GAS_LIMITS.oxygenMin}&ndash;${GAS_LIMITS.oxygenMax}%, LEL &lt;${GAS_LIMITS.lelMax}%, H&#8322;S &lt;${GAS_LIMITS.h2sMax}ppm, CO &lt;${GAS_LIMITS.coMax}ppm</p>`
    : '<p class="small">No atmospheric testing recorded.</p>'

  const isolations = p.isolations.length
    ? `<table><thead><tr><th>Tag</th><th>Isolation</th><th>Applied by</th><th>Released by</th></tr></thead><tbody>
        ${p.isolations.map((i) => `<tr>
          <td style="font-family:monospace">${esc(i.tagId)}</td><td>${esc(i.description)}</td>
          <td>${esc(i.isolatedBy ?? '—')}<br><span class="small">${i.isolatedAt ? fmt(i.isolatedAt) : ''}</span></td>
          <td>${i.removedBy ? esc(i.removedBy) : '<b style="color:#b00">STILL APPLIED</b>'}<br><span class="small">${i.removedAt ? fmt(i.removedAt) : ''}</span></td>
        </tr>`).join('')}
      </tbody></table>`
    : '<p class="small">No isolation points recorded.</p>'

  const signatures = p.signatures.map((s) => `
    <div class="sig">
      <div class="signame">${esc(s.name)}</div>
      <div class="small">${esc(s.role.toUpperCase())} &middot; ${fmt(s.signedAt)}</div>
      <div class="small">${esc(s.statement)}</div>
    </div>`).join('')

  const timeline = p.timeline.map((e) => `
    <tr><td>${fmt(e.at)}</td><td>${esc(e.actor)}</td><td>${esc(e.action)}${e.detail ? ` &mdash; ${esc(e.detail)}` : ''}</td></tr>`).join('')

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(p.code)} — Permit to Work</title><style>
    *{box-sizing:border-box}
    body{font-family:"Segoe UI",system-ui,sans-serif;color:#111;margin:26px;font-size:12px}
    h1{font-size:19px;margin:0 0 2px}
    h2{font-size:13px;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.06em;color:#333;border-bottom:1px solid #bbb;padding-bottom:3px}
    .band{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border:2px solid #1c5cab;border-radius:8px;padding:12px 14px}
    .brand{color:#1c5cab;font-weight:800;font-size:11px;letter-spacing:.5px}
    .status{font-size:15px;font-weight:800;text-transform:uppercase}
    .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:3px 24px;margin:10px 0}
    .grid b{font-weight:600}
    table{border-collapse:collapse;width:100%;margin-top:6px;font-size:11px}
    th,td{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}
    th{background:#f0f2f5}
    .small{color:#555;font-size:10px}
    .sig{border:1px solid #bbb;border-radius:6px;padding:8px 10px;margin-bottom:6px}
    .signame{font-family:monospace;font-style:italic;font-size:15px;border-bottom:1px solid #333;display:inline-block;padding:0 18px 2px 0}
    .warn{border:2px solid #b00;color:#b00;padding:8px 10px;border-radius:6px;font-weight:700;margin:10px 0}
    @media print{body{margin:10mm}}
  </style></head><body>
    <div class="band">
      <div>
        <div class="brand">SAFEOPS &middot; PERMIT TO WORK</div>
        <h1>${esc(p.code)} &mdash; ${esc(p.typeLabel)}</h1>
        <div>${esc(p.title)}</div>
      </div>
      <div style="text-align:right">
        <div class="status">${esc(p.statusLabel)}</div>
        <div class="small">Printed ${fmt(new Date().toISOString())}</div>
      </div>
    </div>

    ${p.status === 'expired' ? '<div class="warn">PERMIT EXPIRED &mdash; WORK MUST NOT PROCEED</div>' : ''}
    ${p.status === 'suspended' ? `<div class="warn">PERMIT SUSPENDED &mdash; ${esc(p.suspendedReason ?? '')}</div>` : ''}

    <div class="grid">
      <span><b>Location:</b> ${esc(p.location)}</span><span><b>Department:</b> ${esc(p.department)}</span>
      <span><b>Applicant:</b> ${esc(p.applicant)}</span><span><b>Contractor:</b> ${esc(p.contractor ?? '—')}</span>
      <span><b>Workers:</b> ${p.workerCount}</span><span><b>Issued by:</b> ${esc(p.approver ?? '—')}</span>
      <span><b>Valid from:</b> ${fmt(p.validFrom)}</span><span><b>Valid to:</b> ${fmt(p.validTo)}</span>
    </div>
    ${p.description ? `<p>${esc(p.description)}</p>` : ''}

    <h2>Precautions &amp; controls</h2>
    <table><thead><tr><th style="width:28px"></th><th>Control</th><th style="width:110px">Confirmed by</th><th style="width:110px">Time</th></tr></thead>
      <tbody>${controls}</tbody></table>
    <p class="small"><b style="color:#b00">*</b> required before issue</p>

    <h2>Atmospheric testing</h2>
    ${gas}

    <h2>Isolation register</h2>
    ${isolations}

    <h2>Signatures</h2>
    ${signatures || '<p class="small">No signatures recorded.</p>'}

    <h2>Audit trail</h2>
    <table><thead><tr><th style="width:120px">Time</th><th style="width:120px">Actor</th><th>Event</th></tr></thead><tbody>${timeline}</tbody></table>

    <p class="small" style="margin-top:14px">This permit is valid only for the work, location and window stated above. Work must stop immediately if conditions change.</p>
    <script>window.onload = () => window.print()</script>
  </body></html>`

  const w = window.open('', '_blank', 'width=900,height=760')
  if (w) {
    w.document.write(html)
    w.document.close()
  }
}
