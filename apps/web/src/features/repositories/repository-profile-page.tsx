import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, getRouteApi } from '@tanstack/react-router'
import { ArrowLeft, LoaderCircle, RefreshCw } from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
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
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { RepositoryCiEvidence } from './repository-ci-evidence'
import { RepositoryEvents } from './repository-events'

const route = getRouteApi('/_authenticated/repositories/$repositoryId')
type Signal = {
  id: string
  label: string
  state: 'detected' | 'not_detected' | 'unknown'
  observations: string[]
  evidence: { path: string; blobSha: string; reason: string }[]
}
type Profile = {
  id: string
  sourceSha: string
  treeSha: string
  branch: string
  fullName: string
  createdAt: string
  complete: boolean
  report: {
    inspectedFileCount: number
    signals: Signal[]
    warnings: string[]
    limitations: string[]
  }
}
type Result = {
  repository: {
    githubId: string
    fullName: string
    defaultBranch: string | null
  }
  profile: Profile | null
}
const stateLabels = {
  detected: 'Detected hint',
  not_detected: 'Not detected',
  unknown: 'Unknown',
}
const controlIds = new Set([
  'ci',
  'tests',
  'lockfiles',
  'ownership',
  'semgrep',
  'trivy',
  'gitleaks',
  'checkov',
])

class ProfileRequestError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}

export function RepositoryProfilePage() {
  const { repositoryId } = route.useParams()
  const queryClient = useQueryClient()
  const profileQuery = useQuery({
    queryKey: ['repository-profile', repositoryId],
    retry: false,
    staleTime: 0,
    queryFn: async ({ signal }): Promise<Result> => {
      const response = await fetch(
        `${API_BASE_URL}/github/repositories/${encodeURIComponent(repositoryId)}/profile`,
        { credentials: 'include', signal }
      )
      if (!response.ok)
        throw new ProfileRequestError(
          response.status,
          response.status === 403
            ? 'This repository is not selected or GitHub access is unavailable.'
            : 'Could not load the repository profile. Check API and GitHub access, then retry.'
        )
      return response.json() as Promise<Result>
    },
  })
  const sessionQuery = useQuery({
    queryKey: ['profile-view-session'],
    retry: false,
    staleTime: 0,
    queryFn: async ({ signal }): Promise<{ role?: string }> => {
      const response = await fetch(`${API_BASE_URL}/auth/session`, {
        credentials: 'include',
        signal,
      })
      if (!response.ok) throw new Error('Could not check account permissions')
      return response.json() as Promise<{ role?: string }>
    },
  })
  const discovery = useMutation({
    mutationFn: async (id: string): Promise<Result> => {
      const response = await fetch(
        `${API_BASE_URL}/github/repositories/${encodeURIComponent(id)}/profile`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        }
      )
      if (!response.ok)
        throw new ProfileRequestError(
          response.status,
          response.status === 403
            ? 'Repository selection, permissions, or GitHub access changed. Reload the page to check access.'
            : response.status === 429
              ? 'Discovery is already running or busy. Try again shortly.'
              : 'Discovery failed. The previous profile was preserved; check GitHub access and retry.'
        )
      return response.json() as Promise<Result>
    },
    onSuccess: (value, id) => {
      queryClient.setQueryData(['repository-profile', id], value)
    },
  })
  const loading = profileQuery.isPending || profileQuery.isFetching
  const discovering =
    discovery.isPending && discovery.variables === repositoryId
  const mutationError =
    discovery.variables === repositoryId ? discovery.error : null
  const accessDenied =
    mutationError instanceof ProfileRequestError && mutationError.status === 403
  const result =
    loading || profileQuery.isError || accessDenied
      ? undefined
      : profileQuery.data
  const error = mutationError?.message ?? profileQuery.error?.message ?? ''
  const canDiscover = ['OWNER', 'ADMIN', 'SUPER_ADMIN'].includes(
    sessionQuery.data?.role ?? ''
  )
  function discover() {
    discovery.mutate(repositoryId)
  }
  const profile = result?.profile
  const gaps =
    profile?.report.signals.filter(
      (signal) => controlIds.has(signal.id) && signal.state !== 'detected'
    ) ?? []
  return (
    <>
      <Header>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ConfigDrawer />
        <ProfileDropdown />
      </Header>
      <Main>
        <Button asChild variant='ghost' className='-ms-3 mb-4'>
          <Link to='/apps'>
            <ArrowLeft aria-hidden='true' />
            Repositories
          </Link>
        </Button>
        <div className='mb-6 flex flex-wrap items-start justify-between gap-4'>
          <div className='min-w-0'>
            <h1 className='text-2xl font-bold tracking-tight break-words'>
              {result?.repository.fullName ?? 'Repository profile'}
            </h1>
            <p className='mt-1 text-muted-foreground'>
              Engineering configuration and source hints from a saved repository
              snapshot.
            </p>
          </div>
          {canDiscover && result && (
            <Button
              disabled={loading || discovering}
              onClick={() => void discover()}
            >
              {discovering ? (
                <LoaderCircle className='animate-spin' />
              ) : (
                <RefreshCw />
              )}
              {discovering
                ? 'Discovering…'
                : profile
                  ? 'Refresh profile'
                  : 'Discover profile'}
            </Button>
          )}
        </div>
        {result && <RepositoryEvents repositoryId={repositoryId} />}
        {result && (
          <RepositoryCiEvidence
            key={repositoryId}
            repositoryId={repositoryId}
          />
        )}
        {error && (
          <div
            role='alert'
            className='mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm'
          >
            <p>{error}</p>
            <Button
              size='sm'
              variant='outline'
              disabled={discovering}
              className='mt-3'
              onClick={() => {
                discovery.reset()
                void profileQuery.refetch()
              }}
            >
              Reload profile
            </Button>
          </div>
        )}
        {loading ? (
          <p
            role='status'
            className='flex items-center gap-2 text-muted-foreground'
          >
            <LoaderCircle className='size-4 animate-spin' />
            Loading repository profile…
          </p>
        ) : result && !profile ? (
          <Card>
            <CardHeader>
              <CardTitle>No profile discovered yet</CardTitle>
              <CardDescription>
                {canDiscover
                  ? 'Discover the default branch to save its languages, tooling, and engineering control hints.'
                  : 'Ask an Owner or Admin to discover this repository profile.'}
              </CardDescription>
            </CardHeader>
            <CardContent className='text-sm text-muted-foreground'>
              Discovery reads GitHub metadata and selected manifests. Repository
              commands and code are not executed.
            </CardContent>
          </Card>
        ) : (
          profile && (
            <>
              <Card className='mb-4'>
                <CardHeader>
                  <div className='flex flex-wrap items-center justify-between gap-2'>
                    <CardTitle>Inspected snapshot</CardTitle>
                    <Badge variant='outline'>
                      {profile.complete
                        ? 'Inspection complete'
                        : 'Partial inspection'}
                    </Badge>
                  </div>
                  <CardDescription>
                    Captured {new Date(profile.createdAt).toLocaleString()}.
                    Refresh to inspect the latest default-branch revision. This
                    snapshot is not a validation result.
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-2 text-sm'>
                  <p>
                    Branch:{' '}
                    <span className='font-medium'>{profile.branch}</span>
                  </p>
                  <p className='break-all'>
                    Commit: <code>{profile.sourceSha}</code>
                  </p>
                  <p className='break-all'>
                    Git tree: <code>{profile.treeSha}</code>
                  </p>
                  <p>
                    {profile.report.inspectedFileCount} source/configuration
                    file paths inspected.
                  </p>
                </CardContent>
              </Card>
              {profile.report.warnings.length > 0 && (
                <div
                  role='status'
                  className='mb-4 rounded-md border p-4 text-sm'
                >
                  <p className='font-medium'>Inspection limits</p>
                  <ul className='mt-2 list-disc space-y-1 ps-5'>
                    {profile.report.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
              <Card className='mb-4'>
                <CardHeader>
                  <CardTitle>Controls to review</CardTitle>
                  <CardDescription>
                    Missing hints and unknown coverage need review. No
                    engineering policy or execution result is inferred.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {gaps.length ? (
                    <ul className='space-y-2'>
                      {gaps.map((signal) => (
                        <li
                          key={signal.id}
                          className='flex flex-wrap items-center justify-between gap-2 text-sm'
                        >
                          <span>{signal.label}</span>
                          <Badge variant='outline'>
                            {stateLabels[signal.state]}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className='text-sm text-muted-foreground'>
                      Configuration hints were detected for all listed controls.
                      Their execution and effectiveness remain unverified.
                    </p>
                  )}
                </CardContent>
              </Card>
              <div className='grid gap-4 md:grid-cols-2'>
                {profile.report.signals.map((signal) => (
                  <Card key={signal.id}>
                    <CardHeader>
                      <div className='flex flex-wrap items-center justify-between gap-2'>
                        <CardTitle className='text-base'>
                          {signal.label}
                        </CardTitle>
                        <Badge variant='outline'>
                          {stateLabels[signal.state]}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className='space-y-3 text-sm'>
                      {signal.observations.map((observation) => (
                        <p key={observation} className='text-muted-foreground'>
                          {observation}
                        </p>
                      ))}
                      {signal.evidence.length ? (
                        <details>
                          <summary className='cursor-pointer font-medium'>
                            File evidence ({signal.evidence.length})
                          </summary>
                          <ul className='mt-3 space-y-3'>
                            {signal.evidence.map((file) => (
                              <li
                                key={`${file.path}-${file.blobSha}`}
                                className='break-all'
                              >
                                <a
                                  className='underline underline-offset-4'
                                  href={`https://github.com/${profile.fullName.split('/').map(encodeURIComponent).join('/')}/blob/${profile.sourceSha}/${file.path.split('/').map(encodeURIComponent).join('/')}`}
                                  target='_blank'
                                  rel='noreferrer'
                                >
                                  {file.path}
                                </a>
                                <p className='mt-1 text-xs text-muted-foreground'>
                                  Blob: {file.blobSha}
                                </p>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : (
                        <p className='text-muted-foreground'>
                          {signal.state === 'unknown'
                            ? 'Coverage could not be established from the inspected files.'
                            : 'No supported configuration or source hint was detected.'}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Card className='mt-4'>
                <CardHeader>
                  <CardTitle>Interpretation</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className='list-disc space-y-2 ps-5 text-sm text-muted-foreground'>
                    {profile.report.limitations.map((limitation) => (
                      <li key={limitation}>{limitation}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </>
          )
        )}
      </Main>
    </>
  )
}
