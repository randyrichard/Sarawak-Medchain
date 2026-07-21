import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, Download, Search } from 'lucide-react'
import { api } from '@/api/client'
import type { AuditEntry, RbacModule } from '@/api/admin'
import { MODULE_LABEL, RBAC_MODULES } from '@/api/admin'
import { Avatar, Badge, Button, Card, EmptyState, Skeleton } from '@/components/ui'
import { fmtDateTime } from '@/features/incidents/lib'
import { downloadCsv } from '../lib'
import { ScrollText } from 'lucide-react'

const MODULE_TAG = (m: AuditEntry['module']) => (m === 'auth' ? 'Authentication' : m === 'system' ? 'System' : MODULE_LABEL[m as RbacModule])

export function AuditLogSection() {
  const [rows, setRows] = useState<AuditEntry[] | null>(null)
  const [q, setQ] = useState('')
  const [module, setModule] = useState<string>('')

  const load = useCallback(() => api.adminListAudit({ q, module: module as RbacModule | '' }).then(setRows), [q, module])
  useEffect(() => {
    setRows(null)
    const t = setTimeout(load, q ? 250 : 0)
    return () => clearTimeout(t)
  }, [load, q])

  const exportCsv = () => downloadCsv(
    ['Timestamp', 'User', 'Role', 'Action', 'Module', 'Target', 'IP', 'Device', 'Old value', 'New value'],
    (rows ?? []).map((e) => [e.at, e.actor, e.actorRole, e.action, MODULE_TAG(e.module), e.target, e.ip, e.device, e.oldValue ?? '', e.newValue ?? '']),
    'safeops-audit-log.csv',
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-52 flex-1 items-center gap-2 rounded-lg border bg-surface px-3 py-2 md:max-w-sm">
          <Search size={14} className="shrink-0 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search actor, action, target, IP…" className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted" />
        </div>
        <select value={module} onChange={(e) => setModule(e.target.value)} className="h-9 rounded-lg border bg-surface px-2.5 text-sm text-ink-2 outline-none" aria-label="Filter by module">
          <option value="">All modules</option>
          {RBAC_MODULES.map((m) => <option key={m} value={m}>{MODULE_LABEL[m]}</option>)}
          <option value="auth">Authentication</option>
          <option value="system">System</option>
        </select>
        <Button size="sm" variant="ghost" className="ml-auto" icon={<Download size={13} />} onClick={exportCsv}>Export CSV</Button>
      </div>

      <Card>
        {rows === null ? (
          <div className="space-y-3 p-5">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={ScrollText} title="No log entries match">Every mutation across the platform is recorded here.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead>
                <tr className="border-b text-2xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-2.5 font-semibold">Actor</th>
                  <th className="px-3 py-2.5 font-semibold">Action</th>
                  <th className="px-3 py-2.5 font-semibold">Change</th>
                  <th className="px-3 py-2.5 font-semibold">Source</th>
                  <th className="px-5 py-2.5 text-right font-semibold">When</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="border-b last:border-0 hover:bg-accent-soft/30">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={e.actor} size={22} />
                        <div className="min-w-0"><p className="text-sm font-medium text-ink">{e.actor}</p><p className="text-2xs text-muted">{e.actorRole}</p></div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-sm text-ink">{e.action}</p>
                      <p className="text-2xs text-muted">{e.target}</p>
                    </td>
                    <td className="px-3 py-3 text-2xs text-ink-2">
                      {e.oldValue || e.newValue ? (
                        <span className="inline-flex items-center gap-1">
                          {e.oldValue && <span className="rounded bg-critical-soft px-1.5 py-0.5 text-critical">{e.oldValue}</span>}
                          {e.oldValue && e.newValue && <ArrowRight size={10} className="text-muted" />}
                          {e.newValue && <span className="rounded px-1.5 py-0.5" style={{ background: 'var(--good-soft)', color: 'var(--delta-good)' }}>{e.newValue}</span>}
                        </span>
                      ) : <span className="text-muted">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone="neutral">{MODULE_TAG(e.module)}</Badge>
                      <p className="mt-0.5 font-mono text-2xs text-muted">{e.ip} · {e.device}</p>
                    </td>
                    <td className="px-5 py-3 text-right text-2xs text-muted" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtDateTime(e.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-2xs text-muted">{rows?.length ?? 0} entries · append-only · retained per the policy in Backup &amp; Recovery.</p>
    </div>
  )
}
