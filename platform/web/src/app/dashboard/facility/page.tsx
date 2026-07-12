'use client';

/** Hospital / clinic administrator portal: doctor management + analytics. */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Input, Label, Stat, statusTone, Table, Td } from '@/components/ui';
import { api } from '@/lib/api';

interface FacilityInfo {
  name: string;
  type: string;
  registrationNo: string;
  state: string;
  status: string;
  _count: { doctors: number; mcs: number; users: number };
}

interface DoctorRow {
  id: string;
  fullName: string;
  email: string;
  mmcNumber: string;
  specialty: string | null;
  status: string;
  mcCount: number;
}

interface FacilityAnalytics {
  totals: { total: number; last30: number; revoked: number; activeDoctors: number };
  topDoctors: Array<{ doctorId: string; name?: string; count: number }>;
}

const emptyDoctor = { fullName: '', email: '', password: '', ic: '', mmcNumber: '', specialty: '' };

export default function FacilityDashboard() {
  const [facility, setFacility] = useState<FacilityInfo | null>(null);
  const [doctors, setDoctors] = useState<DoctorRow[]>([]);
  const [analytics, setAnalytics] = useState<FacilityAnalytics | null>(null);
  const [form, setForm] = useState(emptyDoctor);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [f, d, a] = await Promise.all([
        api<FacilityInfo>('/api/v1/facility/me'),
        api<DoctorRow[]>('/api/v1/facility/doctors'),
        api<FacilityAnalytics>('/api/v1/facility/analytics'),
      ]);
      setFacility(f);
      setDoctors(d);
      setAnalytics(a);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const registerDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api('/api/v1/facility/doctors', {
        method: 'POST',
        body: JSON.stringify({ ...form, specialty: form.specialty || undefined }),
      });
      setSuccess(`Dr. ${form.fullName} registered — a dedicated signing keypair was generated.`);
      setForm(emptyDoctor);
      setShowForm(false);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const doctorAction = (id: string, action: 'suspend' | 'reinstate') =>
    api(`/api/v1/facility/doctors/${id}/${action}`, {
      method: 'POST',
      body: action === 'suspend' ? JSON.stringify({ reason: 'Suspended by facility administrator' }) : undefined,
    })
      .then(load)
      .catch((e) => setError(e.message));

  return (
    <div className="space-y-6">
      {error && <Alert tone="error">{error}</Alert>}
      {success && <Alert tone="success">{success}</Alert>}

      {facility && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold">{facility.name}</h1>
            <p className="text-sm text-slate-500">
              {facility.type} · {facility.registrationNo} · {facility.state}{' '}
              <Badge tone={statusTone(facility.status)}>{facility.status}</Badge>
            </p>
          </div>
          <Button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Close' : '+ Register doctor'}</Button>
        </div>
      )}

      {analytics && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Total MCs issued" value={analytics.totals.total.toLocaleString()} />
          <Stat label="Last 30 days" value={analytics.totals.last30.toLocaleString()} />
          <Stat label="Revoked" value={analytics.totals.revoked} />
          <Stat label="Active doctors" value={analytics.totals.activeDoctors} />
        </div>
      )}

      {showForm && (
        <Card
          title="Register a doctor"
          description="The MMC number is validated against the Malaysian Medical Council register. A dedicated Ed25519 signing keypair is generated and encrypted at rest."
        >
          <form onSubmit={registerDoctor} className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="dFullName">Full name</Label>
              <Input id="dFullName" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
            </div>
            <div>
              <Label htmlFor="dMmc">MMC number</Label>
              <Input id="dMmc" value={form.mmcNumber} onChange={(e) => setForm({ ...form, mmcNumber: e.target.value })} required />
            </div>
            <div>
              <Label htmlFor="dEmail">Email</Label>
              <Input id="dEmail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div>
              <Label htmlFor="dIc">IC number</Label>
              <Input id="dIc" value={form.ic} onChange={(e) => setForm({ ...form, ic: e.target.value })} required />
            </div>
            <div>
              <Label htmlFor="dSpecialty">Specialty (optional)</Label>
              <Input id="dSpecialty" value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="dPassword">Initial password (min 10 chars)</Label>
              <Input id="dPassword" type="password" minLength={10} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">Register doctor</Button>
            </div>
          </form>
        </Card>
      )}

      <Card title="Doctors">
        <Table headers={['Name', 'MMC No.', 'Specialty', 'Email', 'MCs issued', 'Status', 'Actions']}>
          {doctors.map((d) => (
            <tr key={d.id}>
              <Td className="font-medium">{d.fullName}</Td>
              <Td className="font-mono text-xs">{d.mmcNumber}</Td>
              <Td>{d.specialty ?? '—'}</Td>
              <Td className="text-xs">{d.email}</Td>
              <Td>{d.mcCount}</Td>
              <Td>
                <Badge tone={statusTone(d.status)}>{d.status}</Badge>
              </Td>
              <Td>
                {d.status === 'ACTIVE' ? (
                  <Button variant="danger" onClick={() => doctorAction(d.id, 'suspend')}>
                    Suspend
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={() => doctorAction(d.id, 'reinstate')}>
                    Reinstate
                  </Button>
                )}
              </Td>
            </tr>
          ))}
          {doctors.length === 0 && (
            <tr>
              <Td colSpan={7} className="py-8 text-center text-slate-400">
                No doctors registered yet
              </Td>
            </tr>
          )}
        </Table>
      </Card>

      {analytics && analytics.topDoctors.length > 0 && (
        <Card title="Issuance by doctor — last 30 days">
          <Table headers={['Doctor', 'MCs issued']}>
            {analytics.topDoctors.map((d) => (
              <tr key={d.doctorId}>
                <Td className="font-medium">{d.name ?? d.doctorId}</Td>
                <Td>{d.count}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}
