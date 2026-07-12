'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { I18nProvider } from '@/lib/i18n';

/**
 * Theme (dark mode) + i18n providers. Theme preference is persisted and
 * applied as a class on <html> before paint via the inline script in layout.
 */
export function Providers({ children }: { children: ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>;
}

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('emc_theme', next ? 'dark' : 'light');
  };

  return (
    <button
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
    >
      {dark ? '☀️' : '🌙'}
    </button>
  );
}

export function LocaleToggle() {
  // Re-exported here to keep header imports tidy
  return null;
}
