'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/api';

const roleHome: Record<string, string> = {
  SUPER_ADMIN: '/dashboard/admin',
  STATE_ADMIN: '/dashboard/admin',
  HOSPITAL_ADMIN: '/dashboard/facility',
  CLINIC_ADMIN: '/dashboard/facility',
  DOCTOR: '/dashboard/doctor',
  EMPLOYER: '/dashboard/employer',
  PATIENT: '/dashboard/patient',
};

export default function DashboardRouter() {
  const router = useRouter();
  useEffect(() => {
    const session = getSession();
    router.replace(session ? (roleHome[session.user.role] ?? '/login') : '/login');
  }, [router]);
  return null;
}
