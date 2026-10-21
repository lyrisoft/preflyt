import { GitHubStarLink } from '@/components/github-star-link'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { SettingsLink } from '@/components/settings-link'
import { ThemeSwitch } from '@/components/theme-switch'
import { NotificationBell } from '@/features/notifications/inbox'
import { AppBreadcrumbs, type Crumb } from './app-breadcrumbs'
import { Header } from './header'

/**
 * The app bar every workspace page uses: sticky, with location breadcrumbs
 * and the same global controls, so no page can ship a partial header.
 */
export function AppHeader({ breadcrumbs }: { breadcrumbs: Crumb[] }) {
  return (
    <Header fixed>
      <AppBreadcrumbs className='me-auto hidden sm:block' items={breadcrumbs} />
      <Search />
      <GitHubStarLink />
      <NotificationBell />
      <ThemeSwitch />
      <SettingsLink />
      <ProfileDropdown />
    </Header>
  )
}
