import { useQuery } from '@tanstack/react-query'
import { Link, getRouteApi, useNavigate } from '@tanstack/react-router'
import {
  ArrowUpRight,
  BookOpen,
  GitBranch,
  GitPullRequest,
  ListChecks,
  RefreshCw,
} from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ConfigDrawer } from '@/components/config-drawer'
import { AppBreadcrumbs } from '@/components/layout/app-breadcrumbs'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { RelativeTime } from '@/features/repositories/relative-time'
import { ActivityHeatmap } from './activity-heatmap'
import type { DashboardData } from './dashboard-types'

const route = getRouteApi('/_authenticated/')
const reasons: Record<string, string> = {
  CONTEXT_UNAVAILABLE: 'Context unavailable',
  AWAITING_SYNC: 'Awaiting GitHub sync',
  FORK_HEAD_UNSUPPORTED: 'Fork head unsupported',
  STANDARDS_NOT_ADOPTED: 'Standards not adopted',
  EXECUTION_NOT_VERIFIED: 'Execution not verified',
}

export function Dashboard() {
  const { days = '90', repository } = route.useSearch()
  const navigate = useNavigate()
  const query = useQuery({
    queryKey: ['engineering-dashboard', days, repository ?? 'all'],
    staleTime: 15_000,
    retry: false,
    queryFn: async ({ signal }): Promise<DashboardData> => {
      const params = new URLSearchParams({ days })
      if (repository) params.set('repository', repository)
      const response = await fetch(
        `${API_BASE_URL}/github/dashboard?${params}`,
        { credentials: 'include', cache: 'no-store', signal }
      )
      if (!response.ok)
        throw new Error(
          response.status === 403
            ? 'This repository is no longer selected or accessible. Choose all repositories to continue.'
            : 'The engineering overview could not be loaded. Check the API and try again.'
        )
      return response.json() as Promise<DashboardData>
    },
  })
  const data = query.data
  const filters = (next: { days?: '7' | '30' | '90'; repository?: string }) =>
    void navigate({ to: '/', search: { days, repository, ...next } })
  const stats = data
    ? [
        {
          label: 'Repositories',
          value: data.metrics.repositories.toLocaleString(),
          detail: 'Selected and available',
          icon: GitBranch,
        },
        {
          label: 'PRs assessed',
          value: data.metrics.prsAssessed.toLocaleString(),
          detail: 'Distinct PRs with snapshots in period',
          icon: GitPullRequest,
        },
        {
          label: 'Assessment snapshots',
          value: data.metrics.snapshots.toLocaleString(),
          detail: 'Recorded in the selected period',
          icon: ListChecks,
        },
        {
          label: 'Standards adopted',
          value: `${data.metrics.standardsAdopted} / ${data.metrics.repositories}`,
          detail: 'Repository adoption, not verified coverage',
          icon: BookOpen,
        },
      ]
    : []
  return (
    <>
      <Header fixed>
        <AppBreadcrumbs
          className='me-auto hidden sm:block'
          items={[{ label: 'Overview' }]}
        />
        <Search />
        <ThemeSwitch />
        <ConfigDrawer />
        <ProfileDropdown />
      </Header>
      <Main className='space-y-6'>
        <div className='flex flex-wrap items-start justify-between gap-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>
              Engineering Overview
            </h1>
            <p className='mt-1 text-sm text-muted-foreground'>
              Review repository evidence, assessment activity, and changes
              requiring attention.
            </p>
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <Select
              value={repository ?? 'all'}
              onValueChange={(value) =>
                filters({ repository: value === 'all' ? undefined : value })
              }
            >
              <SelectTrigger className='w-52' aria-label='Filter repositories'>
                <SelectValue placeholder='Repository' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All repositories</SelectItem>
                {data?.choices.map((repo) => (
                  <SelectItem key={repo.githubId} value={repo.githubId}>
                    {repo.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={days}
              onValueChange={(value) =>
                filters({ days: value as '7' | '30' | '90' })
              }
            >
              <SelectTrigger className='w-36' aria-label='Assessment period'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='7'>Last 7 days</SelectItem>
                <SelectItem value='30'>Last 30 days</SelectItem>
                <SelectItem value='90'>Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant='outline'
              size='icon'
              aria-label='Refresh overview'
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              <RefreshCw className={query.isFetching ? 'animate-spin' : ''} />
            </Button>
          </div>
        </div>
        {query.isPending ? (
          <div
            role='status'
            aria-label='Loading engineering overview'
            className='space-y-6'
          >
            <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
              {[0, 1, 2, 3].map((key) => (
                <Skeleton key={key} className='h-28 rounded-lg' />
              ))}
            </div>
            <Skeleton className='h-64 rounded-lg' />
          </div>
        ) : query.isError ? (
          <Card>
            <CardHeader>
              <CardTitle>Overview unavailable</CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <p role='alert' className='text-sm text-muted-foreground'>
                {query.error.message}
              </p>
              <div className='flex gap-2'>
                <Button variant='outline' onClick={() => void query.refetch()}>
                  Try again
                </Button>
                {repository && (
                  <Button
                    variant='outline'
                    onClick={() => filters({ repository: undefined })}
                  >
                    All repositories
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          data && (
            <>
              {data.metrics.repositories === 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Connect your first repository</CardTitle>
                    <CardDescription>
                      Start with GitHub access, then adopt engineering standards
                      and collect CI evidence.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button asChild>
                      <Link to='/apps'>
                        Connect and select repositories
                        <ArrowUpRight />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
                    {stats.map((stat) => (
                      <Card key={stat.label}>
                        <CardHeader className='flex flex-row items-center justify-between pb-2'>
                          <CardTitle className='text-sm font-medium'>
                            {stat.label}
                          </CardTitle>
                          <stat.icon
                            aria-hidden='true'
                            className='size-4 text-muted-foreground'
                          />
                        </CardHeader>
                        <CardContent>
                          <p className='text-3xl font-semibold tracking-tight tabular-nums'>
                            {stat.value}
                          </p>
                          <p className='mt-1 text-xs text-muted-foreground'>
                            {stat.detail}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  <div className='grid gap-4 xl:grid-cols-3'>
                    <div className='min-w-0 xl:col-span-2'>
                      <ActivityHeatmap
                        key={`${days}-${repository}`}
                        from={data.period.from}
                        to={data.period.to}
                        activity={data.activity}
                      />
                    </div>
                    <Card>
                      <CardHeader>
                        <CardTitle>Evidence overview</CardTitle>
                        <CardDescription>
                          Repository snapshots across all time
                        </CardDescription>
                      </CardHeader>
                      <CardContent className='space-y-4'>
                        <div className='space-y-3 text-sm'>
                          <div className='flex justify-between'>
                            <span className='text-muted-foreground'>
                              Snapshot recorded
                            </span>
                            <span className='font-medium tabular-nums'>
                              {data.metrics.repositoriesWithSnapshots}
                            </span>
                          </div>
                          <div className='flex justify-between'>
                            <span className='text-muted-foreground'>
                              No assessment yet
                            </span>
                            <span className='font-medium tabular-nums'>
                              {data.metrics.repositories -
                                data.metrics.repositoriesWithSnapshots}
                            </span>
                          </div>
                          <div className='flex justify-between'>
                            <span className='text-muted-foreground'>
                              Standards not adopted
                            </span>
                            <span className='font-medium tabular-nums'>
                              {data.metrics.repositories -
                                data.metrics.standardsAdopted}
                            </span>
                          </div>
                        </div>
                        <p className='border-t pt-4 text-xs text-muted-foreground'>
                          Verified gates and findings are not available yet.
                          Imported CI success does not establish readiness.
                        </p>
                        <Button variant='outline' size='sm' asChild>
                          <Link to='/policies' search={{ repository }}>
                            Review policies
                            <ArrowUpRight />
                          </Link>
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                  <Card>
                    <CardHeader className='flex flex-row flex-wrap items-start justify-between gap-3'>
                      <div>
                        <CardTitle>Pull requests requiring attention</CardTitle>
                        <CardDescription>
                          Tracked open PRs from the last GitHub sync. Gate
                          status remains unevaluated.
                        </CardDescription>
                      </div>
                      <Button variant='ghost' size='sm' asChild>
                        <Link to='/assessments' search={{ repository }}>
                          View assessments
                          <ArrowUpRight />
                        </Link>
                      </Button>
                    </CardHeader>
                    <CardContent>
                      {data.attention.length ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Pull request</TableHead>
                              <TableHead>Repository</TableHead>
                              <TableHead>Needs review</TableHead>
                              <TableHead>Updated</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.attention.map((pr) => (
                              <TableRow key={`${pr.repositoryId}-${pr.number}`}>
                                <TableCell>
                                  <Link
                                    className='font-medium underline-offset-4 hover:underline'
                                    to='/repositories/$repositoryId'
                                    params={{ repositoryId: pr.repositoryId }}
                                    search={{ tab: 'assessments' }}
                                  >
                                    #{pr.number}
                                    {pr.draft ? ' · Draft' : ''}
                                  </Link>
                                  <p
                                    className='mt-1 max-w-64 truncate text-xs text-muted-foreground'
                                    title={pr.headRef ?? undefined}
                                  >
                                    {pr.headRef ?? 'Unknown head'}
                                    {pr.headSha
                                      ? ` · ${pr.headSha.slice(0, 7)}`
                                      : ''}
                                  </p>
                                </TableCell>
                                <TableCell className='text-muted-foreground'>
                                  {pr.repository}
                                </TableCell>
                                <TableCell>
                                  <span className='text-xs font-medium'>
                                    {reasons[pr.reason] ?? 'Review required'}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  {pr.updatedAt ? (
                                    <RelativeTime value={pr.updatedAt} />
                                  ) : (
                                    'Unknown'
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <p className='py-6 text-center text-sm text-muted-foreground'>
                          No tracked open pull requests. Signed webhooks and the
                          sync worker populate this view.
                        </p>
                      )}
                      {data.attentionTruncated && (
                        <p className='mt-3 text-xs text-muted-foreground'>
                          Showing the 10 most recently updated PRs. Open
                          Assessments to review a repository's tracked PRs.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className='flex flex-row flex-wrap items-start justify-between gap-3'>
                      <div>
                        <CardTitle>Repository posture</CardTitle>
                        <CardDescription>
                          Latest recorded profile, standards selection, and
                          assessment
                        </CardDescription>
                      </div>
                      <Button variant='ghost' size='sm' asChild>
                        <Link to='/apps'>
                          View repositories
                          <ArrowUpRight />
                        </Link>
                      </Button>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Repository</TableHead>
                            <TableHead>Language / framework</TableHead>
                            <TableHead>Policy profile</TableHead>
                            <TableHead>Last assessment</TableHead>
                            <TableHead>Readiness</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.repositories.slice(0, 10).map((repo) => (
                            <TableRow key={repo.githubId}>
                              <TableCell>
                                <Link
                                  className='font-medium underline-offset-4 hover:underline'
                                  to='/repositories/$repositoryId'
                                  params={{ repositoryId: repo.githubId }}
                                >
                                  {repo.fullName}
                                </Link>
                              </TableCell>
                              <TableCell className='max-w-60 whitespace-normal text-muted-foreground'>
                                {repo.technologies.length
                                  ? repo.technologies.join(', ')
                                  : 'Not profiled'}
                                {repo.profileComplete === false && (
                                  <p className='mt-1 text-xs'>
                                    Partial profile
                                  </p>
                                )}
                              </TableCell>
                              <TableCell>
                                {repo.policy
                                  ? repo.policy.charAt(0) +
                                    repo.policy.slice(1).toLowerCase()
                                  : 'Not adopted'}
                              </TableCell>
                              <TableCell>
                                {repo.latestAssessment ? (
                                  <Link
                                    to='/assessments'
                                    search={{ repository: repo.githubId }}
                                    className='underline-offset-4 hover:underline'
                                  >
                                    <RelativeTime
                                      value={repo.latestAssessment.createdAt}
                                    />
                                  </Link>
                                ) : (
                                  <span className='text-muted-foreground'>
                                    Not assessed
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className='text-muted-foreground'>
                                Not evaluated
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {data.repositories.length > 10 && (
                        <p className='mt-3 text-xs text-muted-foreground'>
                          Showing 10 of {data.repositories.length} selected
                          repositories. Use the repository filter or open
                          Repositories.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
              <p className='text-xs text-muted-foreground'>
                Local data · updated <RelativeTime value={data.generatedAt} /> ·
                activity dates use UTC. Repository posture and tracked PRs are
                current recorded state; activity and PRs assessed use the
                selected period.
              </p>
            </>
          )
        )}
      </Main>
    </>
  )
}
