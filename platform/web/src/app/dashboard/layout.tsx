'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Bell, KeyRound, ShieldCheck } from 'lucide-react';
import { getSession, setSession, api, type Session } from '@/lib/api';
import { Button } from '@/components/ui';
import { ThemeToggle } from '@/components/providers';

const roleLabels: Record<string, string> = {
  SUPER_ADMIN: 'KKM National Administration',
  STATE_ADMIN: 'State Health Administration',
  HOSPITAL_ADMIN: 'Hospital Administration',
  CLINIC_ADMIN: 'Clinic Administration',
  DOCTOR: 'Doctor Portal',
  EMPLOYER: 'Employer Verification Portal',
  PATIENT: 'Patient Portal',
};

interface Notification {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [session, setLocal] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace('/login');
      return;
    }
    setLocal(s);
    setReady(true);
    const loadNotifications = () =>
      api<Notification[]>('/api/v1/notifications').then(setNotifications).catch(() => {});
    loadNotifications();
    // Poll so newly issued/revoked MCs surface without a manual refresh
    const timer = setInterval(loadNotifications, 60_000);
    return () => clearInterval(timer);
  }, [router]);

  const markAllRead = () => {
    api('/api/v1/notifications/read-all', { method: 'POST' }).catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
  };

  if (!ready || !session) return null;

  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-brand-700 dark:text-brand-400">
            <ShieldCheck className="h-6 w-6" aria-hidden />
            <span className="hidden sm:inline">Sarawak MedChain</span>
          </Link>
          <div className="text-center">
            <p className="text-sm font-semibold">{roleLabels[session.user.role]}</p>
            <p className="text-xs text-slate-400">{session.user.fullName}</p>
          </div>
          <div className="flex items-center gap-1">
            <div className="relative">
              <button
                onClick={() => setShowNotifications((v) => !v)}
                className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label={`Notifications (${unread} unread)`}
              >
                <Bell className="h-5 w-5" />
                {unread > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">
                    {unread}
                  </span>
                )}
              </button>
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex items-center justify-between px-2 py-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Notifications</span>
                    {unread > 0 && (
                      <button
                        onClick={markAllRead}
                        className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-400"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  {notifications.length === 0 && (
                    <p className="p-4 text-center text-sm text-slate-400">No notifications</p>
                  )}
                  {notifications.slice(0, 8).map((n) => (
                    <button
                      key={n.id}
                      className="block w-full rounded-lg p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                      onClick={() => {
                        api(`/api/v1/notifications/${n.id}/read`, { method: 'POST' }).catch(() => {});
                        setNotifications((prev) =>
                          prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x))
                        );
                      }}
                    >
                      <p className={`text-sm ${n.readAt ? 'text-slate-500' : 'font-semibold'}`}>{n.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">{n.body}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Link
              href="/dashboard/security"
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              aria-label="Security settings"
              title="Security settings (2FA)"
            >
              <KeyRound className="h-5 w-5" />
            </Link>
            <ThemeToggle />
            <Button
              variant="ghost"
              onClick={async () => {
                try {
                  await api('/api/v1/auth/logout', { method: 'POST', body: JSON.stringify({}) });
                } catch {
                  /* session cleanup proceeds regardless */
                }
                setSession(null);
                router.push('/');
              }}
            >
              Log out
            </Button>
          </div>
        </div>
      </header>
      {session.user.mustChangePassword && (
        <div className="border-b border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40" role="alert">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2.5 text-sm text-amber-800 dark:text-amber-300">
            <span>
              Your account is using an initial password set by your administrator. Please change it now to secure your account.
            </span>
            <Link
              href="/dashboard/security"
              className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
            >
              Change password
            </Link>
          </div>
        </div>
      )}
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
