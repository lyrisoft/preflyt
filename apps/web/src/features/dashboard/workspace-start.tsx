import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRight, GitBranch, Settings2 } from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { SurfaceIcon } from '@/components/surface-icon'

export function WorkspaceStart({ platformAdmin }: { platformAdmin: boolean }) {
  const methods = useQuery({
    queryKey: ['setup-sign-in-methods'],
    retry: false,
    queryFn: async ({
      signal,
    }): Promise<{ github?: boolean; oidc?: boolean }> => {
      const response = await fetch(`${API_BASE_URL}/auth/methods`, {
        credentials: 'include',
        signal,
      })
      if (!response.ok)
        throw new Error('Could not check sign-in configuration. Try again.')
      return response.json()
    },
  })
  return (
    <Card>
      <CardHeader className='gap-4 sm:flex-row'>
        <SurfaceIcon icon={GitBranch} tone='teal' />
        <div className='space-y-2'>
          <CardTitle>Connect your organization</CardTitle>
          <CardDescription>
            Bring your repositories, checks and standards into one workspace.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className='space-y-5'>
        {methods.isPending ? (
          <p role='status' className='text-sm text-muted-foreground'>
            Checking connection options…
          </p>
        ) : methods.isError ? (
          <div className='space-y-3'>
            <p role='alert' className='text-sm'>
              {methods.error.message}
            </p>
            <Button variant='outline' onClick={() => void methods.refetch()}>
              Try again
            </Button>
          </div>
        ) : methods.data.github ? (
          <>
            <p className='max-w-2xl text-sm leading-relaxed text-muted-foreground'>
              Continue with GitHub as an organization owner to connect your
              organization. If your team already uses Preflyt, ask its admin to
              grant you access.
            </p>
            <Button asChild>
              <a href={`${API_BASE_URL}/auth/github/login`}>
                Continue with GitHub
                <ArrowRight aria-hidden='true' />
              </a>
            </Button>
          </>
        ) : platformAdmin ? (
          <>
            <p className='max-w-2xl text-sm leading-relaxed text-muted-foreground'>
              Configure the GitHub connection in Settings first. Then sign in
              with GitHub as an organization owner and select your repositories.
            </p>
            <Button asChild>
              <Link
                to='/organization-settings'
                search={{ tab: 'configuration' }}
              >
                <Settings2 aria-hidden='true' />
                Configure GitHub
              </Link>
            </Button>
            {methods.data.oidc && (
              <p className='text-sm text-muted-foreground'>
                Using SSO?{' '}
                <Link
                  to='/access-control'
                  search={{ tab: 'people' }}
                  className='underline underline-offset-4'
                >
                  Manage workspaces in Access Control
                </Link>
                .
              </p>
            )}
          </>
        ) : (
          <p className='text-sm text-muted-foreground'>
            Ask your Preflyt administrator to connect your organization and
            grant you access.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
