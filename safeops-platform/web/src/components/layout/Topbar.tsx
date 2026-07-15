import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Moon, Sun, Search, LogOut, UserRound, Settings, ShieldQuestion } from 'lucide-react'
import { useTheme } from '@/app/theme'
import { useAuth } from '@/features/auth/AuthContext'
import { useOrg } from '@/features/org/OrgContext'
import { ROLE_LABEL } from '@/api/types'
import { Avatar, Dropdown, DropdownItem, DropdownLabel, DropdownSeparator } from '@/components/ui'
import { CompanySwitcher, SiteSwitcher } from './Switchers'
import { NotificationMenu } from './NotificationMenu'

export function Topbar({ onMenu, menuButton }: { onMenu: () => void; menuButton: ReactNode }) {
  const { theme, toggle } = useTheme()
  const { user, logout } = useAuth()
  const { role } = useOrg()
  const navigate = useNavigate()

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-surface px-4 md:px-5">
      {menuButton}

      {/* Scope switchers — company sets permissions, site narrows data */}
      <div className="flex min-w-0 items-center gap-1.5">
        <CompanySwitcher />
        <span className="hidden text-muted md:inline">/</span>
        <SiteSwitcher />
      </div>

      <div className="ml-auto flex items-center gap-1.5 md:gap-2">
        <div className="hidden items-center gap-2 rounded-lg border bg-page px-3 py-1.5 xl:flex">
          <Search size={14} className="text-muted" />
          <input
            placeholder="Search…  (coming with data modules)"
            disabled
            className="w-52 cursor-not-allowed bg-transparent text-sm text-ink outline-none placeholder:text-muted"
          />
          <kbd className="rounded border px-1.5 text-2xs text-muted">⌘K</kbd>
        </div>

        <NotificationMenu />

        <button onClick={toggle} className="rounded-lg border p-2 text-ink-2 hover:bg-accent-soft" aria-label="Toggle theme">
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        {/* User menu */}
        <Dropdown
          width="w-72"
          trigger={() => (
            <button className="flex items-center rounded-full" aria-label="Account menu">
              <Avatar name={user?.name ?? '?'} size={32} />
            </button>
          )}
        >
          <div className="flex items-center gap-3 px-2.5 py-2">
            <Avatar name={user?.name ?? '?'} size={36} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{user?.name}</p>
              <p className="truncate text-2xs text-muted">{user?.email}</p>
            </div>
          </div>
          <div className="px-2.5 pb-2">
            <span className="inline-flex rounded-md bg-accent-soft px-2 py-0.5 text-2xs font-semibold text-ink">
              {role ? ROLE_LABEL[role] : '—'} · {user?.title}
            </span>
          </div>
          <DropdownSeparator />
          <DropdownItem icon={<UserRound size={15} />} onSelect={() => navigate('/account')}>
            My account
          </DropdownItem>
          <DropdownItem icon={<Settings size={15} />} onSelect={() => navigate('/account')}>
            Preferences
          </DropdownItem>
          <DropdownItem icon={<ShieldQuestion size={15} />} onSelect={() => navigate('/design')}>
            About this build
          </DropdownItem>
          <DropdownSeparator />
          <DropdownLabel>Session</DropdownLabel>
          <DropdownItem danger icon={<LogOut size={15} />} onSelect={() => void logout()}>
            Sign out
          </DropdownItem>
        </Dropdown>
      </div>
    </header>
  )
}
