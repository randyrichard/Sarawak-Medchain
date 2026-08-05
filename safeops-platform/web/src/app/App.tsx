import { lazy } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from './theme'
import { AuthProvider } from '@/features/auth/AuthContext'
import { OrgProvider } from '@/features/org/OrgContext'
import { RequireAnonymous, RequireAuth, RequireCapability } from '@/features/auth/guards'
import AppShell from '@/components/layout/AppShell'
// Auth surface is the entry point — keep it eager so the login screen paints without a chunk fetch.
import { LoginPage } from '@/features/auth/pages/LoginPage'
import { ResetPasswordPage } from '@/features/auth/pages/ResetPasswordPage'
import { NotFoundPage } from './pages/NotFoundPage'

// Each business module is code-split into its own chunk, loaded on first visit.
// The <Suspense> boundary lives in AppShell so the sidebar/topbar stay put while a page loads.
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const IncidentsListPage = lazy(() => import('@/features/incidents/IncidentsListPage').then((m) => ({ default: m.IncidentsListPage })))
const ReportNearMissPage = lazy(() => import('@/features/incidents/ReportNearMissPage').then((m) => ({ default: m.ReportNearMissPage })))
const ReportIncidentPage = lazy(() => import('@/features/incidents/ReportIncidentPage').then((m) => ({ default: m.ReportIncidentPage })))
const IncidentDetailPage = lazy(() => import('@/features/incidents/IncidentDetailPage').then((m) => ({ default: m.IncidentDetailPage })))
const ActionsPage = lazy(() => import('@/features/actions/ActionsPage').then((m) => ({ default: m.ActionsPage })))
const AssetsPage = lazy(() => import('@/features/assets/AssetsPage').then((m) => ({ default: m.AssetsPage })))
const AuditsPage = lazy(() => import('@/features/audits/AuditsPage').then((m) => ({ default: m.AuditsPage })))
const TrainingPage = lazy(() => import('@/features/training/TrainingPage').then((m) => ({ default: m.TrainingPage })))
const PermitsPage = lazy(() => import('@/features/permits/PermitsPage').then((m) => ({ default: m.PermitsPage })))
const AdminPage = lazy(() => import('@/features/admin/AdminPage').then((m) => ({ default: m.AdminPage })))
const NotificationsPage = lazy(() => import('@/features/notifications/NotificationsPage').then((m) => ({ default: m.NotificationsPage })))
const EmployeesPage = lazy(() => import('@/features/employees/EmployeesPage').then((m) => ({ default: m.EmployeesPage })))
const OrganizationPage = lazy(() => import('@/features/org/OrganizationPage').then((m) => ({ default: m.OrganizationPage })))
const AccountPage = lazy(() => import('@/features/account/AccountPage').then((m) => ({ default: m.AccountPage })))
const StyleguidePage = lazy(() => import('@/features/styleguide/StyleguidePage').then((m) => ({ default: m.StyleguidePage })))

// Path routing (not hash): every view is a deep-linkable URL per the PRD.

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public auth surface */}
            <Route element={<RequireAnonymous />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
            </Route>

            {/* Authenticated app */}
            <Route element={<RequireAuth />}>
              <Route
                element={
                  <OrgProvider>
                    <AppShell />
                  </OrgProvider>
                }
              >
                <Route path="/" element={<DashboardPage />} />
                <Route
                  path="/incidents"
                  element={
                    <RequireCapability capability="incidents:manage">
                      <IncidentsListPage />
                    </RequireCapability>
                  }
                />
                <Route
                  path="/near-miss"
                  element={
                    <RequireCapability capability="reports:submit">
                      <ReportNearMissPage />
                    </RequireCapability>
                  }
                />
                <Route
                  path="/incidents/new"
                  element={
                    <RequireCapability capability="reports:submit">
                      <ReportIncidentPage />
                    </RequireCapability>
                  }
                />
                <Route
                  path="/incidents/:id"
                  element={
                    <RequireCapability capability="incidents:manage">
                      <IncidentDetailPage />
                    </RequireCapability>
                  }
                />
                <Route
                  path="/actions"
                  element={
                    <RequireCapability capability="dashboard:view">
                      <ActionsPage />
                    </RequireCapability>
                  }
                />
                <Route
                  path="/assets"
                  element={
                    <RequireCapability capability="dashboard:view">
                      <AssetsPage />
                    </RequireCapability>
                  }
                />
                <Route
                  path="/audits"
                  element={
                    <RequireCapability capability="dashboard:view">
                      <AuditsPage />
                    </RequireCapability>
                  }
                />
                <Route
                  path="/training"
                  element={
                    <RequireCapability capability="dashboard:view">
                      <TrainingPage />
                    </RequireCapability>
                  }
                />
                <Route
                  path="/permits"
                  element={
                    <RequireCapability capability="dashboard:view">
                      <PermitsPage />
                    </RequireCapability>
                  }
                />
                <Route
                  path="/employees"
                  element={
                    <RequireCapability capability="dashboard:view">
                      <EmployeesPage />
                    </RequireCapability>
                  }
                />
                <Route
                  path="/admin"
                  element={
                    <RequireCapability capability="settings:manage">
                      <AdminPage />
                    </RequireCapability>
                  }
                />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route
                  path="/organization"
                  element={
                    <RequireCapability capability="org:view">
                      <OrganizationPage />
                    </RequireCapability>
                  }
                />
                <Route path="/account" element={<AccountPage />} />
                <Route path="/design" element={<StyleguidePage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
