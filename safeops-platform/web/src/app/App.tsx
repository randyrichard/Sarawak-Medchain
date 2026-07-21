import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from './theme'
import { AuthProvider } from '@/features/auth/AuthContext'
import { OrgProvider } from '@/features/org/OrgContext'
import { RequireAnonymous, RequireAuth, RequireCapability } from '@/features/auth/guards'
import AppShell from '@/components/layout/AppShell'
import { LoginPage } from '@/features/auth/pages/LoginPage'
import { ForgotPasswordPage } from '@/features/auth/pages/ForgotPasswordPage'
import { ResetPasswordPage } from '@/features/auth/pages/ResetPasswordPage'
import { ActionsPage } from '@/features/actions/ActionsPage'
import { AssetsPage } from '@/features/assets/AssetsPage'
import { AuditsPage } from '@/features/audits/AuditsPage'
import { TrainingPage } from '@/features/training/TrainingPage'
import { AdminPage } from '@/features/admin/AdminPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { IncidentsListPage } from '@/features/incidents/IncidentsListPage'
import { ReportIncidentPage } from '@/features/incidents/ReportIncidentPage'
import { IncidentDetailPage } from '@/features/incidents/IncidentDetailPage'
import { NotificationsPage } from '@/features/notifications/NotificationsPage'
import { OrganizationPage } from '@/features/org/OrganizationPage'
import { AccountPage } from '@/features/account/AccountPage'
import { StyleguidePage } from '@/features/styleguide/StyleguidePage'
import { NotFoundPage } from './pages/NotFoundPage'

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
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
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
