import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { AlertTriangle, GitBranch, RefreshCw, ShieldCheck } from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { TopNav } from '@/components/layout/top-nav'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'

type Repository = {
  githubId: string
  name: string
  fullName: string
  defaultBranch: string | null
  isPrivate: boolean
  selected: boolean
  installation: { accountLogin: string }
}

type RepositoryResponse = {
  repositories: Repository[]
  installations: Array<{ id: string; accountLogin: string; active: boolean }>
}

export function Dashboard() {
  const [result, setResult] = useState<RepositoryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setLoading(true)
      setError('')
      try {
        const response = await fetch(
          `${API_BASE_URL}/github/repositories/overview`,
          { credentials: 'include', signal: controller.signal }
        )
        if (!response.ok) throw new Error('Could not load GitHub repositories.')
        setResult((await response.json()) as RepositoryResponse)
      } catch (cause) {
        if (controller.signal.aborted) return
        setError(
          cause instanceof Error
            ? cause.message
            : 'Could not load GitHub repositories.'
        )
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [refresh])

  const repositories = result?.repositories ?? []
  const selected = repositories.filter((repository) => repository.selected)
  const unavailable =
    result?.installations.filter((installation) => !installation.active) ?? []

  return (
    <>
      <Header>
        <TopNav links={topNav} className='me-auto' />
        <Search />
        <ThemeSwitch />
        <ConfigDrawer />
        <ProfileDropdown />
      </Header>
      <Main>
        <div className='mb-6 flex flex-wrap items-start justify-between gap-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>
              Repository overview
            </h1>
            <p className='mt-1 text-muted-foreground'>
              Review the last synced repository state and selections for
              Preflyt.
            </p>
          </div>
          <Button asChild>
            <Link to='/apps'>
              <GitBranch aria-hidden='true' /> Manage repositories
            </Link>
          </Button>
        </div>

        {error && (
          <div
            role='alert'
            className='mb-5 flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm'
          >
            <AlertTriangle className='mt-0.5 size-4 shrink-0 text-destructive' />
            <div>
              <p className='font-medium'>Repository data is unavailable</p>
              <p className='mt-1 text-muted-foreground'>{error}</p>
            </div>
            <Button
              variant='outline'
              size='sm'
              className='ms-auto shrink-0'
              onClick={() => setRefresh((value) => value + 1)}
            >
              <RefreshCw aria-hidden='true' /> Retry
            </Button>
          </div>
        )}

        {unavailable.length > 0 && (
          <div
            role='status'
            className='mb-5 rounded-md border border-amber-600/30 bg-amber-600/5 p-4 text-sm'
          >
            {unavailable.length} GitHub installation
            {unavailable.length === 1 ? ' is' : 's are'} unavailable. Repository
            access may have been revoked or suspended. Review the connection on
            the repositories page.
          </div>
        )}

        <div className='grid gap-4 sm:grid-cols-2'>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Available repositories
              </CardTitle>
              <GitBranch className='size-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>
                {loading ? '—' : repositories.length}
              </div>
              <p className='text-xs text-muted-foreground'>
                Repositories from the last successful GitHub sync
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Selected repositories
              </CardTitle>
              <ShieldCheck className='size-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>
                {loading ? '—' : selected.length}
              </div>
              <p className='text-xs text-muted-foreground'>
                Repositories explicitly selected for Preflyt
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className='mt-4'>
          <CardHeader>
            <CardTitle>Selected repositories</CardTitle>
            <CardDescription>
              GitHub repositories currently selected in this Preflyt deployment.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className='text-sm text-muted-foreground' role='status'>
                Loading repository access…
              </p>
            ) : error ? (
              <p className='text-sm text-muted-foreground'>
                Repository data could not be loaded. Retry after checking the
                API connection.
              </p>
            ) : selected.length > 0 ? (
              <ul className='divide-y'>
                {selected.map((repository) => (
                  <li
                    key={repository.githubId}
                    className='flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0'
                  >
                    <div>
                      <Link
                        className='font-medium underline underline-offset-4'
                        to='/repositories/$repositoryId'
                        params={{ repositoryId: repository.githubId }}
                      >
                        {repository.fullName}
                      </Link>
                      <p className='text-sm text-muted-foreground'>
                        {repository.installation.accountLogin}
                        {repository.defaultBranch
                          ? ` · default branch ${repository.defaultBranch}`
                          : ''}
                      </p>
                    </div>
                    <span className='text-xs text-muted-foreground'>
                      {repository.isPrivate ? 'Private' : 'Public'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className='rounded-md border border-dashed p-6 text-center'>
                <GitBranch className='mx-auto mb-3 size-6 text-muted-foreground' />
                <p className='font-medium'>No repositories selected</p>
                <p className='mt-1 text-sm text-muted-foreground'>
                  {repositories.length === 0
                    ? 'Connect a GitHub App installation and select repositories for Preflyt.'
                    : 'Select repositories for Preflyt on the repositories page.'}
                </p>
                <Button asChild variant='outline' className='mt-4'>
                  <Link to='/apps'>Open repositories</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </Main>
    </>
  )
}

const topNav = [
  {
    title: 'Overview',
    href: '/',
    isActive: true,
    disabled: false,
  },
  {
    title: 'Repositories',
    href: '/apps',
    isActive: false,
    disabled: false,
  },
]
