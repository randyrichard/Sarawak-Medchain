'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/** English / Bahasa Malaysia dictionary. Keys are grouped by screen. */
const dict = {
  en: {
    'app.name': 'MedChain e-MC',
    'app.tagline': 'National Digital Medical Certificate Platform',
    'nav.verify': 'Verify an MC',
    'nav.login': 'Log in',
    'nav.register': 'Register',
    'nav.logout': 'Log out',
    'nav.dashboard': 'Dashboard',
    'home.hero.title': 'Every medical certificate. Cryptographically verifiable.',
    'home.hero.subtitle':
      'Digitally signed by the issuing doctor, fingerprinted on a public blockchain, and verifiable by any employer in seconds. Fake MCs become mathematically impossible.',
    'home.cta.verify': 'Verify a certificate',
    'home.cta.portal': 'Access your portal',
    'verify.title': 'Verify a Medical Certificate',
    'verify.subtitle': 'Scan the QR code on the MC with any phone camera, or paste the certificate hash below.',
    'verify.placeholder': 'Certificate hash (0x…)',
    'verify.button': 'Verify now',
    'verify.result.VALID': 'VALID',
    'verify.result.INVALID': 'INVALID',
    'verify.result.REVOKED': 'REVOKED',
    'verify.result.EXPIRED': 'EXPIRED',
    'verify.result.TAMPERED': 'TAMPERED — SECURITY ALERT',
    'login.title': 'Sign in to your portal',
    'login.email': 'Email address',
    'login.password': 'Password',
    'login.submit': 'Sign in',
    'login.2fa': 'Enter the 6-digit code from your authenticator app',
    'dash.issue': 'Issue MC',
    'dash.myMcs': 'My certificates',
    'common.loading': 'Loading…',
    'common.download': 'Download PDF',
    'common.share': 'Share',
    'common.status': 'Status',
    'common.actions': 'Actions',
  },
  ms: {
    'app.name': 'MedChain e-MC',
    'app.tagline': 'Platform Sijil Cuti Sakit Digital Kebangsaan',
    'nav.verify': 'Sahkan MC',
    'nav.login': 'Log masuk',
    'nav.register': 'Daftar',
    'nav.logout': 'Log keluar',
    'nav.dashboard': 'Papan Pemuka',
    'home.hero.title': 'Setiap sijil cuti sakit. Boleh disahkan secara kriptografi.',
    'home.hero.subtitle':
      'Ditandatangani secara digital oleh doktor, dicap jari pada blockchain awam, dan boleh disahkan oleh mana-mana majikan dalam beberapa saat. MC palsu menjadi mustahil secara matematik.',
    'home.cta.verify': 'Sahkan sijil',
    'home.cta.portal': 'Akses portal anda',
    'verify.title': 'Sahkan Sijil Cuti Sakit',
    'verify.subtitle': 'Imbas kod QR pada MC dengan kamera telefon, atau tampal hash sijil di bawah.',
    'verify.placeholder': 'Hash sijil (0x…)',
    'verify.button': 'Sahkan sekarang',
    'verify.result.VALID': 'SAH',
    'verify.result.INVALID': 'TIDAK SAH',
    'verify.result.REVOKED': 'DIBATALKAN',
    'verify.result.EXPIRED': 'TAMAT TEMPOH',
    'verify.result.TAMPERED': 'DIUBAH SUAI — AMARAN KESELAMATAN',
    'login.title': 'Log masuk ke portal anda',
    'login.email': 'Alamat e-mel',
    'login.password': 'Kata laluan',
    'login.submit': 'Log masuk',
    'login.2fa': 'Masukkan kod 6 digit daripada aplikasi pengesah anda',
    'dash.issue': 'Keluarkan MC',
    'dash.myMcs': 'Sijil saya',
    'common.loading': 'Memuatkan…',
    'common.download': 'Muat turun PDF',
    'common.share': 'Kongsi',
    'common.status': 'Status',
    'common.actions': 'Tindakan',
  },
} as const;

export type Locale = keyof typeof dict;
type Key = keyof (typeof dict)['en'];

const I18nContext = createContext<{
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: Key) => string;
}>({ locale: 'en', setLocale: () => {}, t: (k) => k });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    const saved = localStorage.getItem('emc_locale');
    if (saved === 'ms' || saved === 'en') setLocaleState(saved);
  }, []);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    localStorage.setItem('emc_locale', l);
  };

  const t = (key: Key) => dict[locale][key] ?? dict.en[key] ?? key;
  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
