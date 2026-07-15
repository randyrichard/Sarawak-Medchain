import { useState } from 'react'
import { KeyRound, Monitor } from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import { useOrg } from '@/features/org/OrgContext'
import { ROLE_LABEL } from '@/api/types'
import {
  Alert, Avatar, Badge, Button, Card, CardBody, CardHeader, Dialog, Input, PageHeader,
} from '@/components/ui'
import { loadSession } from '@/features/auth/session'

export function AccountPage() {
  const { user, logout } = useAuth()
  const { membership, company } = useOrg()
  const [pwOpen, setPwOpen] = useState(false)
  const session = loadSession()

  if (!user) return null

  return (
    <>
      <PageHeader title="My account" subtitle="Profile, memberships and session security" />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Profile" />
          <CardBody className="flex items-center gap-4">
            <Avatar name={user.name} size={56} />
            <div className="min-w-0">
              <p className="text-lg font-semibold text-ink">{user.name}</p>
              <p className="text-sm text-ink-2">{user.title}</p>
              <p className="text-xs text-muted">{user.email}</p>
            </div>
          </CardBody>
          <CardBody className="border-t">
            <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted">Memberships</p>
            <ul className="space-y-2">
              {user.memberships.map((m) => (
                <li key={m.companyId} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-ink">{m.companyId === company?.id ? `${company.name} (active)` : m.companyId.toUpperCase()}</span>
                  <Badge tone={m.companyId === company?.id ? 'accent' : 'neutral'}>{ROLE_LABEL[m.role]}</Badge>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Security" subtitle="Password and two-factor authentication" />
            <CardBody className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-ink">Password</p>
                  <p className="text-2xs text-muted">Minimum 10 characters, checked against breach lists</p>
                </div>
                <Button variant="secondary" size="sm" icon={<KeyRound size={13} />} onClick={() => setPwOpen(true)}>
                  Change
                </Button>
              </div>
              <div className="flex items-center justify-between gap-3 border-t pt-3">
                <div>
                  <p className="text-sm font-medium text-ink">Two-factor authentication</p>
                  <p className="text-2xs text-muted">TOTP app support arrives with the real auth service</p>
                </div>
                <Badge tone="neutral">Sprint 2</Badge>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Active session" />
            <CardBody className="space-y-3">
              <div className="flex items-start gap-3 text-sm">
                <Monitor size={16} className="mt-0.5 text-muted" />
                <div>
                  <p className="font-medium text-ink">This browser</p>
                  <p className="text-2xs text-muted">
                    {session ? `Signed in · expires ${new Date(session.expiresAt).toLocaleString()}` : 'Session state unavailable'}
                  </p>
                </div>
              </div>
              <Alert tone="info">
                Sessions expire automatically after 8 hours. Sign out on shared site-office computers.
              </Alert>
              <Button variant="danger" size="sm" onClick={() => void logout()}>
                Sign out of this session
              </Button>
            </CardBody>
          </Card>
        </div>
      </div>

      <ChangePasswordDialog open={pwOpen} onClose={() => setPwOpen(false)} email={user.email} />
    </>
  )
}

function ChangePasswordDialog({ open, onClose, email }: { open: boolean; onClose: () => void; email: string }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Change password"
      description="In Sprint 1 the demo directory is read-only — use the reset flow instead."
      footer={<Button onClick={onClose}>Got it</Button>}
    >
      <Alert tone="info">
        Go to <span className="font-semibold">Forgot password</span> from the sign-in screen and request a
        reset link for <span className="font-semibold">{email}</span>. The full in-session change ships with
        the auth service.
      </Alert>
      <div className="mt-3 space-y-3 opacity-50">
        <Input label="Current password" type="password" disabled placeholder="••••••••••" />
        <Input label="New password" type="password" disabled placeholder="••••••••••" />
      </div>
    </Dialog>
  )
}
