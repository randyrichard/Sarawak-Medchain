'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Bell, ShieldCheck } from 'lucide-react';
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
    api<Notification[]>('/api/v1/notifications').then(setNotifications).catch(() => {});
  }, [router]);

  if (!ready || !session) return null;

  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-brand-700 dark:text-brand-400">
            <ShieldCheck className="h-6 w-6" aria-hidden />
            <span className="hidden sm:inline">MedChain e-MC</span>
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
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
