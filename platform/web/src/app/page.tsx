'use client';

import Link from 'next/link';
import { FileCheck2, Fingerprint, Landmark, LockKeyhole, QrCode, ShieldCheck } from 'lucide-react';
import { SiteHeader } from '@/components/site-header';
import { Button } from '@/components/ui';
import { useI18n } from '@/lib/i18n';

const pillarIcons = [Fingerprint, LockKeyhole, QrCode, ShieldCheck, Landmark, FileCheck2] as const;

export default function HomePage() {
  const { t } = useI18n();
  return (
    <>
      <SiteHeader />
      <main>
        <section className="bg-gradient-to-b from-brand-50 to-slate-50 dark:from-slate-900 dark:to-slate-950">
          <div className="mx-auto max-w-6xl px-4 py-24 text-center">
            <p className="mb-4 inline-block rounded-full bg-brand-100 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-brand-800 dark:bg-brand-900/50 dark:text-brand-300">
              {t('app.tagline')}
            </p>
            <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white md:text-5xl">
              {t('home.hero.title')}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600 dark:text-slate-300">
              {t('home.hero.subtitle')}
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Link href="/verify">
                <Button className="px-6 py-3 text-base">{t('home.cta.verify')}</Button>
              </Link>
              <Link href="/login">
                <Button variant="outline" className="px-6 py-3 text-base">
                  {t('home.cta.portal')}
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20">
          <h2 className="text-center text-2xl font-bold text-slate-900 dark:text-white">
            {t('home.pillars.title')}
          </h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {pillarIcons.map((Icon, i) => (
              <div
                key={i}
                className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900"
              >
                <Icon className="h-8 w-8 text-brand-600 dark:text-brand-400" aria-hidden />
                <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">
                  {t(`home.pillar${i + 1}.title` as Parameters<typeof t>[0])}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  {t(`home.pillar${i + 1}.body` as Parameters<typeof t>[0])}
                </p>
              </div>
            ))}
          </div>
        </section>

        <footer className="border-t border-slate-200 py-10 text-center text-sm text-slate-500 dark:border-slate-800">
          {t('home.footer')}
        </footer>
      </main>
    </>
  );
}
