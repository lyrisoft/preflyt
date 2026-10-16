import type { ReactNode } from 'react'
import { useLocation } from '@tanstack/react-router'
import { Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { AppHeader } from '@/components/layout/app-header'
import { sidebarData } from '@/components/layout/data/sidebar-data'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { WorkspaceStart } from '@/features/dashboard/workspace-start'
import { primaryDestination } from './navigation-policy'
import { useNavigationSession } from './navigation-session'

/** Do not mount organization-scoped pages until a workspace is selected. */
export function OrganizationBoundary({ children }: { children: ReactNode }) {
  const pathname = useLocation({ select: (location) => location.pathname })
  const search = useLocation({ select: (location) => location.searchStr ?? '' })
  const session = useNavigationSession()
  const destination = primaryDestination(pathname)
  // Keep identity settings and deployment/workspace recovery available before setup.
  const independent =
    ['/settings', '/organization-settings', '/notifications'].includes(
      destination
    ) ||
    (destination === '/access-control' && session.data?.platformAdmin)

  if (independent || (session.isSuccess && session.data.organizationId))
    return children

  const title =
    sidebarData.navGroups
      .flatMap((group) => group.items)
      .find((item) => item.url === destination)?.title ?? 'Workspace'

  return (
    <>
      <AppHeader breadcrumbs={[{ label: title }]} />
      <Main className='space-y-6'>
        <PageHeader
          title={title}
          section='Workspace'
          description='Select or connect an organization to use this page.'
          icon={Building2}
        />
        {session.isPending ? (
          <div role='status' aria-label='Checking organization access'>
            <Skeleton className='h-48 rounded-xl' />
            <span className='sr-only'>Checking organization access…</span>
          </div>
        ) : session.isError ? (
          <section className='space-y-3' aria-label='Session unavailable'>
            <p role='alert' className='text-sm text-muted-foreground'>
              Could not check your organization access. Try again.
            </p>
            <Button variant='outline' onClick={() => void session.refetch()}>
              Try again
            </Button>
          </section>
        ) : (
          <>
            {new URLSearchParams(search).get('github') === 'error' && (
              <div
                role='alert'
                className='rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive'
              >
                GitHub connection did not complete. Your Preflyt account was not
                changed. Retry connection with a GitHub organization owner in
                this browser, or check the GitHub App settings.
              </div>
            )}
            <WorkspaceStart platformAdmin={!!session.data?.platformAdmin} />
          </>
        )}
      </Main>
    </>
  )
}
