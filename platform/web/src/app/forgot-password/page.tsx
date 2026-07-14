'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { Alert, Button, Card, Input, Label } from '@/components/ui';
import { api } from '@/lib/api';

interface ForgotResponse {
  delivered: 'email' | 'demo-link';
  resetUrl?: string;
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState<ForgotResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      setResult(
        await api<ForgotResponse>('/api/v1/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email }),
        })
      );
    } catch {
      // Uniform response — treat any outcome as "submitted"
      setResult({ delivered: 'email' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-md px-4 py-16">
        <h1 className="mb-8 text-center text-2xl font-bold">Reset your password</h1>
        <Card>
          {result ? (
            <div className="space-y-4">
              <Alert tone="success">
                If an account exists for <strong>{email}</strong>, a password-reset link has been
                sent. The link is valid for one hour.
              </Alert>
              {result.delivered === 'demo-link' && result.resetUrl && (
                <Alert tone="info">
                  <p className="font-semibold">Demo mode (no email provider configured):</p>
                  <p className="mt-1">Use this one-time link to continue:</p>
                  <Link
                    href={result.resetUrl.replace(/^https?:\/\/[^/]+/, '')}
                    className="mt-1 block break-all font-mono text-xs text-brand-700 hover:underline dark:text-brand-400"
                  >
                    {result.resetUrl}
                  </Link>
                </Alert>
              )}
              <Link href="/login" className="block text-center text-sm text-brand-700 hover:underline dark:text-brand-400">
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Enter your account email and we will send a link to reset your password.
              </p>
              <div>
                <Label htmlFor="email">Email address</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? 'Sending…' : 'Send reset link'}
              </Button>
              <Link href="/login" className="block text-center text-sm text-slate-500 hover:underline">
                Back to sign in
              </Link>
            </form>
          )}
        </Card>
      </main>
    </>
  );
}
