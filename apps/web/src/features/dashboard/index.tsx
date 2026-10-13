import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, getRouteApi, useNavigate } from '@tanstack/react-router'
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  GitBranch,
  GitPullRequest,
  ListChecks,
  RefreshCw,
  ShieldCheck,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { AppHeader } from '@/components/layout/app-header'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { PageHelpDrawer } from '@/components/page-help-drawer'
import { RepositoryPicker } from '@/components/repository-picker'
import { ResultTimestamp } from '@/components/result-timestamp'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import { useHealthPortfolio } from '@/features/health/health-api'
import { healthPortfolioHelp } from '@/features/health/health-help-content'
import { RelativeTime } from '@/features/repositories/relative-time'
import { TechIcon } from '@/features/repositories/tech-icon'
import { useNavigationSession } from '@/features/workspace/navigation-session'
import { ActivityHeatmap } from './activity-heatmap'
import { DashboardHealth, DashboardHealthMetrics } from './dashboard-health'
import { DashboardMetrics } from './dashboard-metrics'
import type { DashboardData } from './dashboard-types'
import { FirstReport } from './first-report'
import { WorkspaceStart } from './workspace-start'

const route = getRouteApi('/_authenticated/overview')
const reasons: Record<string, string> = {
  CONTEXT_UNAVAILABLE: 'Context unavailable',
  AWAITING_SYNC: 'Awaiting GitHub sync',
  FORK_HEAD_UNSUPPORTED: 'Fork head unsupported',
  STANDARDS_NOT_ADOPTED: 'Standards not adopted',
  EXECUTION_NOT_VERIFIED: 'Execution not verified',
}

export function Dashboard() {
  const { days = '180', repository, tab = 'overview' } = route.useSearch()
  const [repositoryPage, setRepositoryPage] = useState(1)
  const navigate = useNavigate()
  const session = useNavigationSession()
  const query = useQuery({
    queryKey: [
      'engineering-dashboard',
      session.data?.organizationId,
      session.data?.identityId,
      days,
      repository ?? 'all',
    ],
    enabled: session.isSuccess && !!session.data.organizationId,
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
  const healthQuery = useHealthPortfolio({
    repository,
    enabled: tab === 'health',
  })
  const activeQuery = tab === 'health' ? healthQuery : query
  const data = query.data
  const filters = (next: {
    days?: '7' | '30' | '90' | '180'
    repository?: string
  }) => {
    setRepositoryPage(1)
    void navigate({
      to: '/overview',
      search: { days, repository, tab, ...next },
    })
  }
  const repositoryPages = Math.max(
    1,
    Math.ceil((data?.repositories.length ?? 0) / 10)
  )
  const currentRepositoryPage = Math.min(repositoryPage, repositoryPages)
  return (
    <>
      <AppHeader breadcrumbs={[{ label: 'Overview' }]} />
      <Main className='space-y-6'>
        <PageHeader
          title='Engineering Overview'
          section='Workspace'
          description='Review repository evidence, assessment activity, and changes requiring attention.'
          icon={LayoutDashboard}
          tone='blue'
          actions={
            <>
              <RepositoryPicker
                repositories={data?.choices ?? []}
                value={repository ?? 'all'}
                allowAll
                aria-label='Filter repositories'
                onValueChange={(value) =>
                  filters({ repository: value === 'all' ? undefined : value })
                }
              />
              {tab !== 'health' && (
                <Select
                  value={days}
                  onValueChange={(value) =>
                    filters({ days: value as '7' | '30' | '90' | '180' })
                  }
                >
                  <SelectTrigger
                    className='w-56'
                    aria-label='Assessment period'
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='7'>Last 7 days</SelectItem>
                    <SelectItem value='30'>Last 30 days</SelectItem>
                    <SelectItem value='90'>Last 90 days</SelectItem>
                    <SelectItem value='180'>
                      Last 6 months (180 days)
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
              <Button
                variant='outline'
                size='icon'
                aria-label={
                  tab === 'health'
                    ? 'Refresh repository health'
                    : 'Refresh overview'
                }
                disabled={activeQuery.isFetching}
                onClick={() => void activeQuery.refetch()}
              >
                <RefreshCw
                  className={activeQuery.isFetching ? 'animate-spin' : ''}
                />
              </Button>
              <PageHelpDrawer
                title='Engineering Overview'
                sections={
                  tab === 'health'
                    ? healthPortfolioHelp
                    : [
                        {
                          title: 'Summary metrics',
                          content:
                            'Repositories counts selected, available repositories in your authorized scope. PRs assessed counts distinct pull requests with a saved assessment in the selected period. Saved assessments count all saved assessments in that period. Standards adopted counts repositories with a saved standards selection; it is not verified check coverage.',
                        },
                        {
                          title: 'Assessment activity',
                          content:
                            'The calendar counts saved assessments per day, using UTC. Select a day to inspect its activity. A darker or brighter cell indicates assessment volume, not passing checks or merge readiness.',
                        },
                        {
                          title: 'Repository status',
                          content:
                            'The repository list shows the latest saved inspection, standards selection and assessment across all time. Partially inspected means some supported configuration could not be inspected and may be unknown. Inspection does not run tests or scanners.',
                        },
                        {
                          title: 'Pull requests',
                          content:
                            'This is a summary of up to 10 recently updated tracked open pull requests from the last GitHub sync, not a complete PR list. Open Assessments for the full repository view. The date filter changes assessment counts and calendar activity; it does not limit repository status or tracked open PRs.',
                        },
                        {
                          title: 'Data sources and limits',
                          content:
                            'This page reads saved Preflyt data from repositories you can access. Refresh reloads local data; it does not start a GitHub sync. A saved assessment or successful CI result alone does not prove a change is ready to merge. Readiness and missing evidence must be reviewed at the exact PR revision.',
                        },
                      ]
                }
              />
            </>
          }
        />
        {session.isError ? (
          <Card>
            <CardHeader>
              <CardTitle>Session unavailable</CardTitle>
            </CardHeader>
            <CardContent>
              <Button variant='outline' onClick={() => void session.refetch()}>
                Try again
              </Button>
            </CardContent>
          </Card>
        ) : session.isSuccess && !session.data.organizationId ? (
          <WorkspaceStart platformAdmin={!!session.data.platformAdmin} />
        ) : query.isPending ? (
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
              {data.metrics.repositories === 0 && tab !== 'health' ? (
                <FirstReport
                  repositories={data.repositories}
                  session={session.data}
                />
              ) : (
                <>
                  {tab !== 'health' && (
                    <FirstReport
                      repositories={data.repositories}
                      session={session.data}
                    />
                  )}
                  {tab === 'health' ? (
                    <DashboardHealthMetrics
                      data={healthQuery.isError ? undefined : healthQuery.data}
                    />
                  ) : (
                    <DashboardMetrics metrics={data.metrics} />
                  )}
                  <Tabs
                    value={tab}
                    onValueChange={(value) =>
                      void navigate({
                        to: '/overview',
                        search: {
                          days,
                          repository,
                          tab: value as
                            | 'overview'
                            | 'repositories'
                            | 'pull-requests'
                            | 'health',
                        },
                      })
                    }
                    className='space-y-4'
                  >
                    <TabsList
                      aria-label='Engineering overview sections'
                      className='max-w-full'
                    >
                      <TabsTrigger value='overview'>
                        <LayoutDashboard className='size-4' />
                        Overview
                      </TabsTrigger>
                      <TabsTrigger value='repositories'>
                        <GitBranch className='size-4' />
                        Repositories
                      </TabsTrigger>
                      <TabsTrigger value='pull-requests'>
                        <GitPullRequest className='size-4' />
                        Pull requests
                      </TabsTrigger>
                      <TabsTrigger value='health'>
                        <ShieldCheck className='size-4' />
                        Health
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value='health'>
                      <DashboardHealth
                        data={healthQuery.data}
                        pending={healthQuery.isPending}
                        error={healthQuery.error}
                        retry={() => void healthQuery.refetch()}
                      />
                    </TabsContent>
                    <TabsContent value='overview'>
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
                          <CardHeader className='flex flex-row items-center gap-3'>
                            <SurfaceIcon icon={ListChecks} tone='violet' />
                            <div>
                              <CardTitle>Evidence overview</CardTitle>
                              <CardDescription>
                                Repository assessments across all time
                              </CardDescription>
                            </div>
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
                              Open Assessments or Findings for detailed results.
                              A successful CI result alone does not mean a
                              change is ready to merge.
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
                    </TabsContent>
                    <TabsContent value='pull-requests'>
                      <Card>
                        <CardHeader className='flex flex-row flex-wrap items-start justify-between gap-3'>
                          <div className='flex min-w-0 items-center gap-3'>
                            <SurfaceIcon icon={GitPullRequest} tone='blue' />
                            <div>
                              <CardTitle>
                                Pull requests requiring attention
                              </CardTitle>
                              <CardDescription>
                                Tracked open PRs from the last GitHub sync. Gate
                                status remains unevaluated.
                              </CardDescription>
                            </div>
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
                                  <TableRow
                                    key={`${pr.repositoryId}-${pr.number}`}
                                  >
                                    <TableCell>
                                      <Link
                                        className='font-medium underline-offset-4 hover:underline'
                                        to='/repositories/$repositoryId'
                                        params={{
                                          repositoryId: pr.repositoryId,
                                        }}
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
                                        {reasons[pr.reason] ??
                                          'Review required'}
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
                              No tracked open pull requests. Signed webhooks and
                              the sync worker populate this view.
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
                    </TabsContent>
                    <TabsContent value='repositories'>
                      <Card>
                        <CardHeader className='flex flex-row flex-wrap items-start justify-between gap-3'>
                          <div className='flex min-w-0 items-center gap-3'>
                            <SurfaceIcon icon={GitBranch} tone='teal' />
                            <div>
                              <CardTitle>Repository status</CardTitle>
                              <CardDescription>
                                Latest recorded profile, standards selection,
                                and assessment
                              </CardDescription>
                            </div>
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
                                <TableHead>Profile status</TableHead>
                                <TableHead>Policy profile</TableHead>
                                <TableHead>Last assessment</TableHead>
                                <TableHead>Merge review result</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {data.repositories
                                .slice(
                                  (currentRepositoryPage - 1) * 10,
                                  currentRepositoryPage * 10
                                )
                                .map((repo) => (
                                  <TableRow key={repo.githubId}>
                                    <TableCell>
                                      <Link
                                        className='font-medium underline-offset-4 hover:underline'
                                        to='/repositories/$repositoryId'
                                        params={{ repositoryId: repo.githubId }}
                                      >
                                        {repo.fullName}
                                      </Link>
                                      {repo.profileBranch && (
                                        <p className='mt-1 text-xs text-muted-foreground'>
                                          Inspected: {repo.profileBranch}
                                        </p>
                                      )}
                                    </TableCell>
                                    <TableCell className='max-w-60 whitespace-normal text-muted-foreground'>
                                      {repo.technologies.length ? (
                                        <div className='flex flex-wrap items-center gap-1.5'>
                                          {[...new Set(repo.technologies)].map(
                                            (name) => (
                                              <TechIcon
                                                key={name}
                                                name={name}
                                                compact
                                              />
                                            )
                                          )}
                                        </div>
                                      ) : repo.profileComplete === null ? (
                                        'Not inspected'
                                      ) : repo.profileComplete === false ? (
                                        'Unknown'
                                      ) : (
                                        'Not detected'
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span
                                            tabIndex={0}
                                            className='inline-flex rounded-md focus-visible:outline-2 focus-visible:outline-ring'
                                          >
                                            <StatusBadge
                                              tone={
                                                repo.profileComplete === false
                                                  ? 'warning'
                                                  : repo.profileComplete ===
                                                      true
                                                    ? 'info'
                                                    : 'neutral'
                                              }
                                            >
                                              {repo.profileComplete === false
                                                ? 'Partially inspected'
                                                : repo.profileComplete === true
                                                  ? 'Inspected'
                                                  : 'Not inspected'}
                                            </StatusBadge>
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent className='max-w-72'>
                                          {repo.profileComplete === false
                                            ? 'Preflyt could not complete the repository inspection. Some configuration may be unknown.'
                                            : repo.profileComplete === true
                                              ? 'Preflyt completed its supported file inspection. Tests and scanners were not run.'
                                              : 'No repository inspection has been saved yet.'}
                                        </TooltipContent>
                                      </Tooltip>
                                    </TableCell>
                                    <TableCell>
                                      <StatusBadge
                                        tone={repo.policy ? 'info' : 'warning'}
                                      >
                                        {repo.policy
                                          ? repo.policy.charAt(0) +
                                            repo.policy.slice(1).toLowerCase()
                                          : 'Not adopted'}
                                      </StatusBadge>
                                    </TableCell>
                                    <TableCell>
                                      {repo.latestAssessment ? (
                                        <Link
                                          to='/assessments'
                                          search={{ repository: repo.githubId }}
                                          className='underline-offset-4 hover:underline'
                                        >
                                          <ResultTimestamp
                                            value={
                                              repo.latestAssessment.createdAt
                                            }
                                            stacked
                                          />
                                        </Link>
                                      ) : (
                                        <StatusBadge tone='neutral'>
                                          Not assessed
                                        </StatusBadge>
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      <StatusBadge tone='neutral'>
                                        Not evaluated
                                      </StatusBadge>
                                    </TableCell>
                                  </TableRow>
                                ))}
                            </TableBody>
                          </Table>
                          <div className='mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4'>
                            <p className='text-xs text-muted-foreground'>
                              Page {currentRepositoryPage} of {repositoryPages}{' '}
                              · {data.repositories.length} repositories
                            </p>
                            <div className='flex gap-2'>
                              <Button
                                size='sm'
                                variant='outline'
                                disabled={currentRepositoryPage === 1}
                                onClick={() =>
                                  setRepositoryPage(currentRepositoryPage - 1)
                                }
                              >
                                <ChevronLeft className='size-4' />
                                Previous
                              </Button>
                              <Button
                                size='sm'
                                variant='outline'
                                disabled={
                                  currentRepositoryPage >= repositoryPages
                                }
                                onClick={() =>
                                  setRepositoryPage(currentRepositoryPage + 1)
                                }
                              >
                                Next
                                <ChevronRight className='size-4' />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>
                  </Tabs>
                </>
              )}
              <p className='text-xs text-muted-foreground'>
                {tab === 'health' ? (
                  <>
                    Latest saved health reports ·{' '}
                    {healthQuery.dataUpdatedAt ? (
                      <>
                        updated{' '}
                        <RelativeTime
                          value={new Date(
                            healthQuery.dataUpdatedAt
                          ).toISOString()}
                        />
                      </>
                    ) : (
                      'not loaded'
                    )}
                  </>
                ) : (
                  <>
                    Local data · updated{' '}
                    <RelativeTime value={data.generatedAt} />
                  </>
                )}
              </p>
            </>
          )
        )}
      </Main>
    </>
  )
}
