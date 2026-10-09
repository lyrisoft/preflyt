import * as React from 'react'
import { ChevronsUpDown } from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { useOrganizations } from '@/features/access-control/organization-queries'

type TeamSwitcherProps = {
  teams: {
    name: string
    logo: React.ElementType
    plan: string
  }[]
}

export function TeamSwitcher({ teams }: TeamSwitcherProps) {
  const { isMobile } = useSidebar()
  const organizations = useOrganizations()
  const [error, setError] = React.useState('')
  const [switching, setSwitching] = React.useState(false)
  const activeOrganization = organizations.data?.organizations.find(
    (o) => o.id === organizations.data.activeOrganizationId
  )
  const activeTeam = {
    ...teams[0],
    plan: activeOrganization?.name ?? 'Select an organization',
  }
  async function activate(id: string) {
    setSwitching(true)
    setError('')
    try {
      const response = await fetch(
        `${API_BASE_URL}/organizations/${encodeURIComponent(id)}/activate`,
        { method: 'POST', credentials: 'include' }
      )
      if (!response.ok)
        throw new Error('Organization access changed. Try again.')
      // New document clears organization-bound client queries; permissions are never reused across scopes.
      window.location.assign('/')
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not switch organization.'
      )
      setSwitching(false)
    }
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size='lg'
              disabled={switching}
              className='data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground'
            >
              <div className='flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground'>
                <activeTeam.logo className='size-4' />
              </div>
              <div className='grid flex-1 text-start text-sm leading-tight'>
                <span className='truncate font-semibold'>
                  {activeTeam.name}
                </span>
                <span className='truncate text-xs'>{activeTeam.plan}</span>
              </div>
              <ChevronsUpDown className='ms-auto' />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className='w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg'
            align='start'
            side={isMobile ? 'bottom' : 'right'}
            sideOffset={4}
          >
            <DropdownMenuLabel className='text-xs text-muted-foreground'>
              Organizations
            </DropdownMenuLabel>
            {organizations.data?.organizations.map((organization) => (
              <DropdownMenuItem
                key={organization.id}
                onClick={() => void activate(organization.id)}
                className='gap-2 p-2'
              >
                <div className='flex size-6 items-center justify-center rounded-sm border'>
                  <activeTeam.logo className='size-4 shrink-0' />
                </div>
                <span className='truncate'>{organization.name}</span>
              </DropdownMenuItem>
            ))}
            {!organizations.data?.organizations.length && (
              <DropdownMenuLabel className='text-xs text-muted-foreground'>
                {organizations.isPending
                  ? 'Loading organizations…'
                  : 'No active organization memberships'}
              </DropdownMenuLabel>
            )}
            {(error || organizations.isError) && (
              <p role='alert' className='px-2 py-1 text-xs text-danger-text'>
                {error || 'Organization memberships are unavailable.'}
              </p>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
