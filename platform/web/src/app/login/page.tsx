'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { Alert, Button, Card, Input, Label } from '@/components/ui';
import { api, setSession, type Session } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

interface LoginResponse {
  requiresTwoFactor: boolean;
  tokens?: Session;
  twoFactorToken?: string;
}

export default function LoginPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorToken, setTwoFactorToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (twoFactorToken) {
        const tokens = await api<Session>('/api/v1/auth/login/2fa', {
          method: 'POST',
          body: JSON.stringify({ twoFactorToken, code }),
        });
        setSession(tokens);
        router.push('/dashboard');
        return;
      }
      const res = await api<LoginResponse>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (res.requiresTwoFactor && res.twoFactorToken) {
        setTwoFactorToken(res.twoFactorToken);
      } else if (res.tokens) {
        setSession(res.tokens);
        router.push('/dashboard');
      }
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
        <h1 className="mb-8 text-center text-2xl font-bold">{t('login.title')}</h1>
        <Card>
          <form onSubmit={submit} className="space-y-4">
            {twoFactorToken ? (
              <div>
                <Label htmlFor="code">{t('login.2fa')}</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                />
              </div>
            ) : (
              <>
                <div>
                  <Label htmlFor="email">{t('login.email')}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="password">{t('login.password')}</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </div>
              </>
            )}
            {error && <Alert tone="error">{error}</Alert>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? '…' : t('login.submit')}
            </Button>
          </form>
          {!twoFactorToken && (
            <p className="mt-4 text-center text-sm">
              <Link href="/forgot-password" className="font-medium text-brand-700 hover:underline dark:text-brand-400">
                Forgot your password?
              </Link>
            </p>
          )}
          <p className="mt-2 text-center text-sm text-slate-500">
            Patient or employer without an account?{' '}
            <Link href="/register" className="font-medium text-brand-700 hover:underline dark:text-brand-400">
              {t('nav.register')}
            </Link>
          </p>
        </Card>
        <p className="mt-6 text-center text-xs text-slate-400">
          Doctors and facility administrators are provisioned by their hospital, clinic or KKM — self-registration is deliberately not possible.
        </p>
      </main>
    </>
  );
}
