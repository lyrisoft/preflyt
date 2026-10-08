import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfigDrawer } from '@/components/config-drawer'
import { AppBreadcrumbs } from '@/components/layout/app-breadcrumbs'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { RepositoryAssessments } from '@/features/repositories/repository-assessments'
import { RepositoryBindings } from '@/features/repositories/repository-bindings'
import { RepositoryCiEvidence } from '@/features/repositories/repository-ci-evidence'
import { RepositoryPullRequests } from '@/features/repositories/repository-pull-requests'
import { RepositoryStandards } from '@/features/repositories/repository-standards'
import { canAdminister, useNavigationSession } from './navigation-session'

type Module = 'assessments' | 'standards' | 'policies' | 'integrations'
const modules = {
  assessments: {
    title: 'Assessments',
    description:
      'Review pull requests, exact-commit assessment history, and validation evidence.',
  },
  standards: {
    title: 'Engineering Standards',
    description:
      'Browse versioned engineering standards and recommendations for a repository.',
  },
  policies: {
    title: 'Policies',
    description:
      'Review repository policy selections and approved CI source bindings.',
  },
  integrations: {
    title: 'Integrations',
    description:
      'Review GitHub installations and repository CI evidence. Manage repository access from Repositories.',
  },
}
type Repository = { githubId: string; fullName: string; selected: boolean }
type Inventory = {
  repositories: Repository[]
  installations: { id: string; accountLogin: string; active: boolean }[]
}

async function read<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    signal,
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('Could not load workspace data. Try again.')
  return response.json() as Promise<T>
}

export function WorkspaceModule({ module }: { module: Module }) {
  const config = modules[module]
  const search = useSearch({ strict: false }) as { repository?: string }
  const navigate = useNavigate()
  const inventory = useQuery({
    queryKey: ['workspace-repositories'],
    queryFn: ({ signal }) => read<Inventory>('/github/repositories', signal),
    staleTime: 30_000,
    retry: false,
  })
  const session = useNavigationSession()
  const repositories =
    inventory.data?.repositories.filter((repo) => repo.selected) ?? []
  // An inaccessible URL selection must never fall through to another repository.
  const repository = search.repository
    ? repositories.find((repo) => repo.githubId === search.repository)
    : repositories[0]
  const canManage = canAdminister(session.data?.role)
  return (
    <>
      <Header fixed>
        <AppBreadcrumbs
          className='me-auto hidden sm:block'
          items={[{ label: config.title }]}
        />
        <Search />
        <ThemeSwitch />
        <ConfigDrawer />
        <ProfileDropdown />
      </Header>
      <Main>
        <div className='mb-6 flex flex-wrap items-start justify-between gap-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>
              {config.title}
            </h1>
            <p className='mt-1 text-muted-foreground'>{config.description}</p>
          </div>
          <Button variant='outline' asChild>
            <Link to='/apps'>Manage repositories</Link>
          </Button>
        </div>
        {inventory.isPending ? (
          <p role='status'>Loading repositories…</p>
        ) : inventory.isError ? (
          <div role='alert' className='space-y-3'>
            <p>{inventory.error.message}</p>
            <Button variant='outline' onClick={() => void inventory.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <div className='space-y-6'>
            {module === 'integrations' && (
              <Card>
                <CardHeader>
                  <CardTitle>GitHub installations</CardTitle>
                </CardHeader>
                <CardContent className='space-y-3'>
                  {inventory.data.installations.length === 0 ? (
                    <p className='text-sm text-muted-foreground'>
                      No GitHub installation connected.
                    </p>
                  ) : (
                    inventory.data.installations.map((installation) => (
                      <div
                        key={installation.id}
                        className='flex justify-between gap-4 text-sm'
                      >
                        <span>{installation.accountLogin}</span>
                        <span>
                          {installation.active ? 'Active' : 'Unavailable'}
                        </span>
                      </div>
                    ))
                  )}
                  {canManage && (
                    <Button asChild>
                      <a href={`${API_BASE_URL}/github/install`}>
                        Connect GitHub App
                      </a>
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
            {repositories.length === 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Select a repository to get started</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className='text-sm text-muted-foreground'>
                    Connect GitHub and select repositories before reviewing{' '}
                    {config.title.toLowerCase()}.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className='flex flex-wrap items-center gap-3'>
                  <label
                    id='workspace-repository-label'
                    className='text-sm font-medium'
                  >
                    Repository
                  </label>
                  <Select
                    value={repository?.githubId ?? ''}
                    onValueChange={(value) =>
                      void navigate({
                        to: `/${module}`,
                        search: { repository: value },
                      })
                    }
                  >
                    <SelectTrigger
                      aria-labelledby='workspace-repository-label'
                      className='w-full sm:w-80'
                    >
                      <SelectValue placeholder='Select a repository' />
                    </SelectTrigger>
                    <SelectContent>
                      {repositories.map((repo) => (
                        <SelectItem key={repo.githubId} value={repo.githubId}>
                          {repo.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {repository && (
                    <Button variant='ghost' asChild>
                      <Link
                        to='/repositories/$repositoryId'
                        params={{ repositoryId: repository.githubId }}
                      >
                        Open repository
                      </Link>
                    </Button>
                  )}
                </div>
                {repository ? (
                  <div
                    key={`${module}-${repository.githubId}`}
                    className='space-y-5'
                  >
                    {module === 'assessments' && (
                      <>
                        <RepositoryPullRequests
                          repositoryId={repository.githubId}
                        />
                        <RepositoryAssessments
                          repositoryId={repository.githubId}
                          canCreate={canManage}
                          initialSha=''
                        />
                      </>
                    )}
                    {module === 'standards' && (
                      <RepositoryStandards
                        repositoryId={repository.githubId}
                        canManage={false}
                      />
                    )}
                    {module === 'policies' && (
                      <>
                        <RepositoryStandards
                          repositoryId={repository.githubId}
                          canManage={canManage}
                        />
                        <RepositoryBindings
                          repositoryId={repository.githubId}
                          canManage={canManage}
                        />
                      </>
                    )}
                    {module === 'integrations' && (
                      <RepositoryCiEvidence
                        repositoryId={repository.githubId}
                        canImport={canManage}
                      />
                    )}
                  </div>
                ) : (
                  <p role='alert'>
                    This repository is no longer selected or accessible. Choose
                    another repository.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </Main>
    </>
  )
}
