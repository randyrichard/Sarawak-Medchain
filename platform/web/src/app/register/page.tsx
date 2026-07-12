'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { Alert, Button, Card, Input, Label } from '@/components/ui';
import { api, setSession, type Session } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState<'PATIENT' | 'EMPLOYER'>('PATIENT');
  const [form, setForm] = useState({ fullName: '', email: '', password: '', ic: '', phone: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const tokens = await api<Session>('/api/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          role,
          fullName: form.fullName,
          email: form.email,
          password: form.password,
          ic: role === 'PATIENT' ? form.ic : undefined,
          phone: form.phone || undefined,
        }),
      });
      setSession(tokens);
      router.push('/dashboard');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-md px-4 py-16">
        <h1 className="mb-8 text-center text-2xl font-bold">Create an account</h1>
        <Card>
          <div className="mb-5 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1 dark:bg-slate-800" role="tablist">
            {(['PATIENT', 'EMPLOYER'] as const).map((r) => (
              <button
                key={r}
                role="tab"
                aria-selected={role === r}
                onClick={() => setRole(r)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  role === r
                    ? 'bg-white text-brand-800 shadow dark:bg-slate-900 dark:text-brand-300'
                    : 'text-slate-500'
                }`}
              >
                {r === 'PATIENT' ? 'Patient' : 'Employer'}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="fullName">{role === 'PATIENT' ? 'Full name (as per IC)' : 'Company / HR contact name'}</Label>
              <Input id="fullName" value={form.fullName} onChange={set('fullName')} required />
            </div>
            {role === 'PATIENT' && (
              <div>
                <Label htmlFor="ic">IC / Passport number</Label>
                <Input id="ic" value={form.ic} onChange={set('ic')} placeholder="990101-13-5678" required />
              </div>
            )}
            <div>
              <Label htmlFor="email">Email address</Label>
              <Input id="email" type="email" value={form.email} onChange={set('email')} required />
            </div>
            <div>
              <Label htmlFor="phone">Phone (optional)</Label>
              <Input id="phone" value={form.phone} onChange={set('phone')} />
            </div>
            <div>
              <Label htmlFor="password">Password (min 10 characters)</Label>
              <Input id="password" type="password" minLength={10} value={form.password} onChange={set('password')} required />
            </div>
            {error && <Alert tone="error">{error}</Alert>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? '…' : 'Create account'}
            </Button>
          </form>
        </Card>
      </main>
    </>
  );
}
