import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Moon, Sun, LogOut, UserRound, Settings, ShieldQuestion } from 'lucide-react'
import { useTheme } from '@/app/theme'
import { useAuth } from '@/features/auth/AuthContext'
import { useOrg } from '@/features/org/OrgContext'
import { ROLE_LABEL } from '@/api/types'
import { Avatar, Dropdown, DropdownItem, DropdownLabel, DropdownSeparator } from '@/components/ui'
import { CompanySwitcher, SiteSwitcher } from './Switchers'
import { NotificationMenu } from './NotificationMenu'
import { GlobalSearch } from './GlobalSearch'

export function Topbar({ menuButton }: { menuButton: ReactNode }) {
  const { theme, toggle } = useTheme()
  const { user, logout } = useAuth()
  const { role } = useOrg()
  const navigate = useNavigate()

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-surface px-4 md:px-5">
      {menuButton}

      {/*
        Scope switchers — company sets permissions, site narrows data.

        `flex-1` is what actually bounds this row. `min-w-0` on the children lets them
        shrink, but nothing was asking them to: without flex-1 this container sizes to its
        content, so on a 375px phone the two switchers wanted 380px together and the second
        one hung 5px off the edge, giving every page a horizontal scroll.

        An earlier fix added min-w-0 to the buttons and I checked only the first switcher,
        which was comfortably inside the viewport, and called it fixed. The one that
        overflowed was the one I did not measure.
      */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {/*
          The company switcher is hidden on a phone, and this is a space decision rather
          than a preference. A 375px header carries the menu button, three icon controls
          and their gaps, which leaves about 150px for switchers. Two of them in 150px
          means roughly 75px each, and at that width neither shows a usable label - the
          company read "B..." and the site switcher rendered as a bare globe with no text.
          A site switcher that cannot tell you which site you are scoped to is worse than
          no site switcher, because scope decides which incidents you are looking at.

          So one of them goes. It is the company: switching company is rare and only
          affects people who belong to more than one, while site scope is changed
          constantly and changes what every screen shows. Nothing is lost - the drawer
          carries the company switcher on exactly the breakpoints this hides it.
        */}
        <div className="hidden min-w-0 md:block">
          <CompanySwitcher />
        </div>
        <span className="hidden text-muted md:inline">/</span>
        <SiteSwitcher />
      </div>

      <div className="ml-auto flex items-center gap-1.5 md:gap-2">
        <GlobalSearch />

        <NotificationMenu />

        <button onClick={toggle} className="rounded-lg border p-2 text-ink-2 hover:bg-accent-soft coarse:min-h-11 coarse:min-w-11 coarse:justify-center" aria-label="Toggle theme">
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
          <DropdownItem icon={<Settings size={15} />} onSelect={() => navigate('/account#preferences')}>
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
