import { ConfigDrawer } from '@/components/config-drawer'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
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
      <ThemeSwitch />
      <ConfigDrawer />
      <ProfileDropdown />
    </Header>
  )
}
