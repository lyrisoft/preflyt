import { SidebarMenu, SidebarMenuItem } from '@/components/ui/sidebar'
import { PreflytMark } from '@/components/preflyt-brand'
import { useOrganizations } from '@/features/access-control/organization-queries'

/** Organization identity only; the single-organization app has no switcher. */
export function TeamSwitcher() {
  const organizations = useOrganizations()
  const activeOrganization = organizations.data?.organizations.find(
    (organization) =>
      organization.id === organizations.data.activeOrganizationId
  )
  const name =
    activeOrganization?.name ??
    (organizations.isPending
      ? 'Loading organization…'
      : organizations.isError
        ? 'Organization unavailable'
        : 'Organization setup')
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div
          role='group'
          aria-label='Current organization'
          className='flex h-12 w-full items-center gap-2 overflow-hidden p-2 text-sm group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-0'
        >
          <PreflytMark className='size-10 shrink-0 group-data-[collapsible=icon]:size-8' />
          <div className='grid min-w-0 flex-1 text-start leading-tight group-data-[collapsible=icon]:sr-only'>
            <span className='truncate font-semibold'>{name}</span>
            <span className='truncate text-xs'>
              {activeOrganization?.githubLogin
                ? 'GitHub organization'
                : 'Organization setup'}
            </span>
          </div>
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
