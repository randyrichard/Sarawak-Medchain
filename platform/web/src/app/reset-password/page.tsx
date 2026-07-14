'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { Alert, Button, Card, Input, Label } from '@/components/ui';
import { api } from '@/lib/api';

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      await api('/api/v1/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword: password }),
      });
      setDone(true);
      setTimeout(() => router.push('/login'), 2500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return <Alert tone="error">This reset link is missing its token. Request a new one.</Alert>;
  }
  if (done) {
    return (
      <Alert tone="success">
        Your password has been reset. All other sessions were signed out. Redirecting to sign in…
      </Alert>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Choose a new password: at least 10 characters with uppercase, lowercase and a number.
      </p>
      <div>
        <Label htmlFor="password">New password</Label>
        <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={10} autoComplete="new-password" required autoFocus />
      </div>
      <div>
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? 'Resetting…' : 'Reset password'}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-md px-4 py-16">
        <h1 className="mb-8 text-center text-2xl font-bold">Set a new password</h1>
        <Card>
          <Suspense fallback={<p className="text-sm text-slate-400">Loading…</p>}>
            <ResetForm />
          </Suspense>
          <Link href="/login" className="mt-4 block text-center text-sm text-slate-500 hover:underline">
            Back to sign in
          </Link>
        </Card>
      </main>
    </>
  );
}
