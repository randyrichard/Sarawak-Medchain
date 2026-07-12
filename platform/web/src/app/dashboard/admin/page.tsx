'use client';

/** KKM (SUPER_ADMIN) and State Admin dashboard: national analytics,
 *  facility approvals, fraud alerts, audit trail. */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, BarChart, Button, Card, Stat, statusTone, Table, Td } from '@/components/ui';
import { api } from '@/lib/api';

interface Analytics {
  totals: {
    totalMCs: number;
    activeMCs: number;
    revokedMCs: number;
    verifications: number;
    openAlerts: number;
    facilities: number;
    doctors: number;
  };
  dailyIssuance: Array<{ date: string; count: number }>;
  verificationOutcomes: Array<{ result: string; count: number }>;
  byState: Array<{ state: string; count: number }>;
  topFacilities: Array<{ id?: string; name?: string; type?: string; count: number }>;
}

interface Facility {
  id: string;
  type: string;
  name: string;
  registrationNo: string;
  state: string;
  status: string;
  _count: { doctors: number; mcs: number };
}

interface FraudAlert {
  id: string;
  type: string;
  severity: string;
  status: string;
  details: Record<string, unknown>;
  createdAt: string;
}

interface AuditEntry {
  seq: string;
  action: string;
  actorId: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
}

export default function AdminDashboard() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [alerts, setAlerts] = useState<FraudAlert[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'facilities' | 'fraud' | 'audit'>('overview');

  const load = useCallback(async () => {
    try {
      const [a, f, al, au] = await Promise.all([
        api<Analytics>('/api/v1/admin/analytics'),
        api<Facility[]>('/api/v1/admin/facilities'),
        api<FraudAlert[]>('/api/v1/admin/fraud-alerts'),
        api<AuditEntry[]>('/api/v1/admin/audit?limit=50'),
      ]);
      setAnalytics(a);
      setFacilities(f);
      setAlerts(al);
      setAuditEntries(au);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const facilityAction = async (id: string, action: 'approve' | 'suspend') => {
    try {
      await api(`/api/v1/admin/facilities/${id}/${action}`, {
        method: 'POST',
        body: action === 'suspend' ? JSON.stringify({ reason: 'Suspended by administrator review' }) : JSON.stringify({}),
      });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const reviewAlert = async (id: string, status: 'CONFIRMED' | 'DISMISSED') => {
    try {
      await api(`/api/v1/admin/fraud-alerts/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      {error && <Alert tone="error">{error}</Alert>}

      <div className="flex flex-wrap gap-2" role="tablist">
        {(
          [
            ['overview', 'Overview'],
            ['facilities', 'Facility Registry'],
            ['fraud', `Fraud Alerts${analytics ? ` (${analytics.totals.openAlerts})` : ''}`],
            ['audit', 'Audit Trail'],
          ] as const
        ).map(([key, label]) => (
          <Button key={key} variant={tab === key ? 'primary' : 'outline'} onClick={() => setTab(key)} role="tab" aria-selected={tab === key}>
            {label}
          </Button>
        ))}
      </div>

      {tab === 'overview' && analytics && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
            <Stat label="Total MCs" value={analytics.totals.totalMCs.toLocaleString()} />
            <Stat label="Active" value={analytics.totals.activeMCs.toLocaleString()} />
            <Stat label="Revoked" value={analytics.totals.revokedMCs.toLocaleString()} />
            <Stat label="Verifications (30d)" value={analytics.totals.verifications.toLocaleString()} />
            <Stat label="Open fraud alerts" value={analytics.totals.openAlerts} />
            <Stat label="Approved facilities" value={analytics.totals.facilities} />
            <Stat label="Active doctors" value={analytics.totals.doctors} />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="MCs issued — last 30 days">
              <BarChart data={analytics.dailyIssuance.map((d) => ({ label: d.date.slice(5), value: d.count }))} />
            </Card>
            <Card title="Verification outcomes — last 30 days">
              <ul className="space-y-2">
                {analytics.verificationOutcomes.map((o) => (
                  <li key={o.result} className="flex items-center justify-between">
                    <Badge tone={statusTone(o.result)}>{o.result}</Badge>
                    <span className="text-sm font-semibold">{o.count.toLocaleString()}</span>
                  </li>
                ))}
                {analytics.verificationOutcomes.length === 0 && (
                  <p className="py-4 text-center text-sm text-slate-400">No verifications yet</p>
                )}
              </ul>
            </Card>
            <Card title="Issuance by state">
              <BarChart data={analytics.byState.map((s) => ({ label: s.state, value: s.count }))} />
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                {analytics.byState.map((s) => (
                  <span key={s.state}>
                    {s.state}: <strong>{s.count}</strong>
                  </span>
                ))}
              </div>
            </Card>
            <Card title="Top issuing facilities">
              <Table headers={['Facility', 'Type', 'MCs']}>
                {analytics.topFacilities.map((f) => (
                  <tr key={f.id ?? f.name}>
                    <Td className="font-medium">{f.name}</Td>
                    <Td>{f.type}</Td>
                    <Td>{f.count}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
          </div>
        </>
      )}

      {tab === 'facilities' && (
        <Card title="Clinic & hospital registry" description="Approve new registrations; suspend facilities under investigation.">
          <Table headers={['Name', 'Type', 'Registration', 'State', 'Doctors', 'MCs', 'Status', 'Actions']}>
            {facilities.map((f) => (
              <tr key={f.id}>
                <Td className="font-medium">{f.name}</Td>
                <Td>{f.type}</Td>
                <Td className="font-mono text-xs">{f.registrationNo}</Td>
                <Td>{f.state}</Td>
                <Td>{f._count.doctors}</Td>
                <Td>{f._count.mcs}</Td>
                <Td>
                  <Badge tone={statusTone(f.status)}>{f.status}</Badge>
                </Td>
                <Td>
                  {f.status === 'PENDING' && (
                    <Button variant="secondary" onClick={() => facilityAction(f.id, 'approve')}>
                      Approve
                    </Button>
                  )}
                  {f.status === 'APPROVED' && (
                    <Button variant="danger" onClick={() => facilityAction(f.id, 'suspend')}>
                      Suspend
                    </Button>
                  )}
                  {f.status === 'SUSPENDED' && (
                    <Button variant="secondary" onClick={() => facilityAction(f.id, 'approve')}>
                      Reinstate
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {tab === 'fraud' && (
        <Card title="Fraud detection alerts" description="Raised automatically by the fraud engine — duplicates, volume anomalies, tampering, geo anomalies.">
          <Table headers={['Severity', 'Type', 'Details', 'Raised', 'Status', 'Actions']}>
            {alerts.map((a) => (
              <tr key={a.id}>
                <Td>
                  <Badge tone={statusTone(a.severity)}>{a.severity}</Badge>
                </Td>
                <Td className="font-medium">{a.type.replaceAll('_', ' ')}</Td>
                <Td className="max-w-md truncate font-mono text-xs">{JSON.stringify(a.details)}</Td>
                <Td className="text-xs">{new Date(a.createdAt).toLocaleString()}</Td>
                <Td>
                  <Badge tone={a.status === 'OPEN' ? 'amber' : 'slate'}>{a.status}</Badge>
                </Td>
                <Td>
                  {a.status === 'OPEN' && (
                    <div className="flex gap-2">
                      <Button variant="danger" onClick={() => reviewAlert(a.id, 'CONFIRMED')}>
                        Confirm
                      </Button>
                      <Button variant="outline" onClick={() => reviewAlert(a.id, 'DISMISSED')}>
                        Dismiss
                      </Button>
                    </div>
                  )}
                </Td>
              </tr>
            ))}
            {alerts.length === 0 && (
              <tr>
                <Td className="py-8 text-center text-slate-400" colSpan={6}>
                  No fraud alerts — all clear
                </Td>
              </tr>
            )}
          </Table>
        </Card>
      )}

      {tab === 'audit' && (
        <Card title="Immutable audit trail" description="Hash-chained: every entry commits to the previous one, so tampering is mathematically detectable.">
          <Table headers={['#', 'Action', 'Actor', 'Entity', 'Timestamp']}>
            {auditEntries.map((e) => (
              <tr key={e.seq}>
                <Td className="font-mono text-xs">{e.seq}</Td>
                <Td className="font-medium">{e.action.replaceAll('_', ' ')}</Td>
                <Td className="font-mono text-xs">{e.actorId?.slice(0, 12) ?? 'system'}</Td>
                <Td className="text-xs">
                  {e.entityType} {e.entityId?.slice(0, 12)}
                </Td>
                <Td className="text-xs">{new Date(e.createdAt).toLocaleString()}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}
