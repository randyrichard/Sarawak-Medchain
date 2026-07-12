'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { getSession, setSession, type Session } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { ThemeToggle } from '@/components/providers';
import { Button } from '@/components/ui';

export function SiteHeader() {
  const { t, locale, setLocale } = useI18n();
  const [session, setLocal] = useState<Session | null>(null);

  useEffect(() => {
    setLocal(getSession());
    const onChange = () => setLocal(getSession());
    window.addEventListener('emc-session-changed', onChange);
    return () => window.removeEventListener('emc-session-changed', onChange);
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-brand-700 dark:text-brand-400">
          <ShieldCheck className="h-6 w-6" aria-hidden />
          <span>{t('app.name')}</span>
        </Link>
        <nav className="flex items-center gap-2" aria-label="Main">
          <Link
            href="/verify"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {t('nav.verify')}
          </Link>
          <button
            onClick={() => setLocale(locale === 'en' ? 'ms' : 'en')}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="Switch language"
          >
            {locale === 'en' ? 'BM' : 'EN'}
          </button>
          <ThemeToggle />
          {session ? (
            <>
              <Link href="/dashboard">
                <Button variant="secondary">{t('nav.dashboard')}</Button>
              </Link>
              <Button
                variant="ghost"
                onClick={() => {
                  setSession(null);
                  window.location.href = '/';
                }}
              >
                {t('nav.logout')}
              </Button>
            </>
          ) : (
            <Link href="/login">
              <Button>{t('nav.login')}</Button>
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
