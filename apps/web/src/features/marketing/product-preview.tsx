import { useState } from 'react'
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  GitPullRequest,
  LayoutDashboard,
  ListChecks,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { useClientReady } from '@/hooks/use-client-ready'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { PageHeader } from '@/components/page-header'
import { PageHelpDrawer } from '@/components/page-help-drawer'
import { RepositoryPicker } from '@/components/repository-picker'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import { ActivityHeatmap } from '@/features/dashboard/activity-heatmap'
import { DashboardHealthMetrics } from '@/features/dashboard/dashboard-health'
import { DashboardMetrics } from '@/features/dashboard/dashboard-metrics'
import { RelativeTime } from '@/features/repositories/relative-time'
import { TechIcon } from '@/features/repositories/tech-icon'
import {
  demoActivity,
  demoHealthPortfolio,
  demoPullRequests,
  demoRepositories,
  demoRepositoryActivity,
} from './demo-workspace'

type Section = 'overview' | 'repositories' | 'pull-requests' | 'health'
const reasons: Record<string, string> = {
  CONTEXT_UNAVAILABLE: 'Context unavailable',
  AWAITING_SYNC: 'Awaiting GitHub sync',
  STANDARDS_NOT_ADOPTED: 'Standards not adopted',
  EXECUTION_NOT_VERIFIED: 'Execution not verified',
}
const dateLabel = (date: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(date))

export function ProductPreview() {
  const clientReady = useClientReady()
  const [updatedAt, setUpdatedAt] = useState('2026-10-11T15:00:00Z')
  const [days, setDays] = useState('180')
  const [repository, setRepository] = useState('all')
  const [tab, setTab] = useState<Section>('overview')
  const [calendarRevision, setCalendarRevision] = useState(0)
  const [repositoryPage, setRepositoryPage] = useState(1)
  const repositories = demoRepositories.filter(
    (item) => repository === 'all' || item.githubId === repository
  )
  const scopeIds = new Set(repositories.map((item) => item.githubId))
  const activity = (
    repository === 'all' ? demoActivity : demoRepositoryActivity[repository]
  ).slice(-Number(days))
  const from = activity[0].date
  const to = activity[activity.length - 1].date
  const prs = demoPullRequests.filter((pr) => scopeIds.has(pr.repositoryId))
  const metrics = {
    repositories: repositories.length,
    snapshots: activity.reduce((total, day) => total + day.count, 0),
    prsAssessed: prs.filter(
      (pr) => pr.assessedAt >= from && pr.assessedAt <= to
    ).length,
    standardsAdopted: repositories.filter((item) => item.policy).length,
    repositoriesWithSnapshots: repositories.filter(
      (item) => item.latestAssessment
    ).length,
  }
  const attention = prs
    .filter((pr) => pr.state === 'open')
    .sort((a, b) => b.number - a.number)
  const healthItems = demoHealthPortfolio.items.filter((item) =>
    scopeIds.has(item.repositoryId)
  )
  const priorityFindings = demoHealthPortfolio.priorityFindings.filter((item) =>
    scopeIds.has(item.repositoryId)
  )
  const health = {
    ...demoHealthPortfolio,
    total: repositories.length,
    items: healthItems,
    priorityFindings,
    statuses: {
      complete: repositories.length,
      partial: 0,
      failed: 0,
      cancelled: 0,
    },
    summary: {
      ...demoHealthPortfolio.summary,
      repositories: repositories.length,
      analyzed: repositories.length,
      assessed: repositories.length,
      high: priorityFindings.length,
    },
  }
  const changeRepository = (value: string) => {
    setRepository(value)
    setRepositoryPage(1)
  }
  const repositoryPages = Math.max(1, Math.ceil(repositories.length / 10))
  const currentRepositoryPage = Math.min(repositoryPage, repositoryPages)
  const exploreHealth = (repositoryId: string) => {
    changeRepository(repositoryId)
    setTab('health')
  }
  return (
    <TooltipProvider>
      <div
        className='engineering-overview-preview product-preview space-y-6 px-4 py-6 @7xl/content:mx-auto @7xl/content:w-full @7xl/content:max-w-7xl'
        aria-label='Engineering Overview'
      >
        <PageHeader
          headingLevel={2}
          title='Engineering Overview'
          section='Workspace'
          description='Review repository evidence, assessment activity, and changes requiring attention.'
          icon={LayoutDashboard}
          tone='blue'
          actions={
            <>
              <RepositoryPicker
                repositories={demoRepositories}
                value={repository}
                allowAll
                aria-label='Filter repositories'
                onValueChange={changeRepository}
              />
              {tab !== 'health' && (
                <Select
                  value={days}
                  onValueChange={(value) => {
                    setDays(value)
                    setRepositoryPage(1)
                  }}
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
                onClick={() => {
                  setCalendarRevision((value) => value + 1)
                  setUpdatedAt(new Date().toISOString())
                  toast.success(
                    tab === 'health'
                      ? 'Repository health refreshed.'
                      : 'Overview refreshed.'
                  )
                }}
              >
                <RefreshCw aria-hidden='true' />
              </Button>
              <PageHelpDrawer
                title='Engineering Overview'
                sections={[
                  {
                    title: 'Summary metrics',
                    content:
                      'Repositories counts the selected scope. PRs assessed and saved assessments use the selected period. Standards adopted counts saved selections; it does not prove the checks passed.',
                  },
                  {
                    title: 'Assessment activity',
                    content:
                      'The calendar counts saved assessments per day using UTC. Select a day to inspect it. Brighter cells show assessment volume, not passing checks or merge readiness.',
                  },
                  {
                    title: 'Repository and pull request details',
                    content:
                      'Repository status and tracked open PRs use the latest recorded data across all time. Changing the period updates the summary counts and activity calendar. Select a PR to inspect its saved check results; current merge readiness remains separate.',
                  },
                  {
                    title: 'Repository health',
                    content:
                      'Health summarizes the latest analysis per repository. A complete report may still contain findings. Repository health does not supply CI evidence or determine GitHub merge permission.',
                  },
                ]}
              />
            </>
          }
        />
        {tab === 'health' ? (
          <DashboardHealthMetrics data={health} />
        ) : (
          <DashboardMetrics metrics={metrics} />
        )}
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as Section)}
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
          <TabsContent value='overview'>
            <div className='engineering-overview-grid grid gap-4 xl:grid-cols-3'>
              <div className='min-w-0 xl:col-span-2'>
                <ActivityHeatmap
                  key={`${days}-${repository}-${calendarRevision}`}
                  locale='en-GB'
                  from={from}
                  to={to}
                  activity={activity}
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
                        {metrics.repositoriesWithSnapshots}
                      </span>
                    </div>
                    <div className='flex justify-between'>
                      <span className='text-muted-foreground'>
                        No assessment yet
                      </span>
                      <span className='font-medium tabular-nums'>
                        {metrics.repositories -
                          metrics.repositoriesWithSnapshots}
                      </span>
                    </div>
                    <div className='flex justify-between'>
                      <span className='text-muted-foreground'>
                        Standards not adopted
                      </span>
                      <span className='font-medium tabular-nums'>
                        {metrics.repositories - metrics.standardsAdopted}
                      </span>
                    </div>
                  </div>
                  <p className='border-t pt-4 text-xs text-muted-foreground'>
                    Open Assessments or Findings for detailed results. A
                    successful CI result alone does not mean a change is ready
                    to merge.
                  </p>
                  <Button variant='outline' size='sm' asChild>
                    <a href='/product/standards-and-evidence'>
                      Review policies
                      <ArrowUpRight />
                    </a>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          <TabsContent value='repositories'>
            <Card>
              <CardHeader className='flex flex-row flex-wrap items-start justify-between gap-3'>
                <div className='flex min-w-0 items-center gap-3'>
                  <SurfaceIcon icon={GitBranch} tone='teal' />
                  <div>
                    <CardTitle>Repository status</CardTitle>
                    <CardDescription>
                      Latest recorded profile, standards selection, and
                      assessment
                    </CardDescription>
                  </div>
                </div>
                <Button variant='ghost' size='sm' asChild>
                  <a href='/product/repository-health'>
                    View repositories
                    <ArrowUpRight />
                  </a>
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
                    {repositories
                      .slice(
                        (currentRepositoryPage - 1) * 10,
                        currentRepositoryPage * 10
                      )
                      .map((item) => (
                        <TableRow key={item.githubId}>
                          <TableCell>
                            <button
                              type='button'
                              onClick={() => exploreHealth(item.githubId)}
                              className='font-medium underline-offset-4 hover:underline'
                            >
                              {item.fullName}
                            </button>
                            <p className='mt-1 text-xs text-muted-foreground'>
                              Inspected: {item.profileBranch}
                            </p>
                          </TableCell>
                          <TableCell className='max-w-60 whitespace-normal text-muted-foreground'>
                            <div className='flex flex-wrap items-center gap-1.5'>
                              {item.technologies.map((name) => (
                                <TechIcon key={name} name={name} compact />
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  tabIndex={0}
                                  className='inline-flex rounded-md focus-visible:outline-2 focus-visible:outline-ring'
                                >
                                  <StatusBadge tone='info'>
                                    Inspected
                                  </StatusBadge>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className='max-w-72'>
                                Preflyt completed its supported file inspection.
                                Tests and scanners were not run.
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell>
                            <StatusBadge
                              tone={item.policy ? 'info' : 'warning'}
                            >
                              {item.policy
                                ? item.policy.charAt(0) +
                                  item.policy.slice(1).toLowerCase()
                                : 'Not adopted'}
                            </StatusBadge>
                          </TableCell>
                          <TableCell>
                            <button
                              type='button'
                              onClick={() => exploreHealth(item.githubId)}
                              className='underline-offset-4 hover:underline'
                            >
                              {clientReady ? (
                                <RelativeTime
                                  value={item.latestAssessment!.createdAt}
                                />
                              ) : (
                                <time
                                  dateTime={item.latestAssessment!.createdAt}
                                >
                                  {dateLabel(item.latestAssessment!.createdAt)}
                                </time>
                              )}
                            </button>
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
                    Page {currentRepositoryPage} of {repositoryPages} ·{' '}
                    {repositories.length} repositories
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
                      <ChevronLeft />
                      Previous
                    </Button>
                    <Button
                      size='sm'
                      variant='outline'
                      disabled={currentRepositoryPage >= repositoryPages}
                      onClick={() =>
                        setRepositoryPage(currentRepositoryPage + 1)
                      }
                    >
                      Next
                      <ChevronRight />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value='pull-requests'>
            <Card>
              <CardHeader className='flex flex-row flex-wrap items-start justify-between gap-3'>
                <div className='flex min-w-0 items-center gap-3'>
                  <SurfaceIcon icon={GitPullRequest} tone='blue' />
                  <div>
                    <CardTitle>Pull requests requiring attention</CardTitle>
                    <CardDescription>
                      Tracked open PRs from the last GitHub sync. Gate status
                      remains unevaluated.
                    </CardDescription>
                  </div>
                </div>
                <Button variant='ghost' size='sm' asChild>
                  <a href='/product/standards-and-evidence'>
                    View assessments
                    <ArrowUpRight />
                  </a>
                </Button>
              </CardHeader>
              <CardContent>
                {attention.length ? (
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
                      {attention.map((pr) => (
                        <TableRow key={`${pr.repositoryId}-${pr.number}`}>
                          <TableCell>
                            <button
                              type='button'
                              aria-label={`#${pr.number} · ${pr.title}`}
                              className='font-medium underline-offset-4 hover:underline'
                              onClick={() => {
                                changeRepository(pr.repositoryId)
                                setTab('repositories')
                              }}
                            >
                              #{pr.number}
                              {pr.draft ? ' · Draft' : ''}
                            </button>
                            <p
                              className='mt-1 max-w-64 truncate text-xs text-muted-foreground'
                              title={pr.headRef}
                            >
                              {pr.headRef} · {pr.headSha.slice(0, 7)}
                            </p>
                          </TableCell>
                          <TableCell className='text-muted-foreground'>
                            {pr.repository}
                          </TableCell>
                          <TableCell>
                            <span className='text-xs font-medium'>
                              {reasons[pr.reason]}
                            </span>
                          </TableCell>
                          <TableCell>
                            {clientReady ? (
                              <RelativeTime value={pr.updatedAt} />
                            ) : (
                              <time dateTime={pr.updatedAt}>
                                {dateLabel(pr.updatedAt)}
                              </time>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className='py-6 text-center text-sm text-muted-foreground'>
                    No tracked open pull requests.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value='health'>
            <div className='space-y-4'>
              <div className='grid gap-4 xl:grid-cols-3'>
                <Card className='min-w-0'>
                  <CardHeader className='flex flex-row items-center gap-3'>
                    <SurfaceIcon icon={ListChecks} tone='violet' />
                    <div>
                      <CardTitle>Assessment status</CardTitle>
                      <CardDescription>
                        Latest report per repository
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className='flex flex-1 flex-col gap-4'>
                    <dl className='space-y-3 text-sm'>
                      {[
                        {
                          label: 'Complete reports',
                          count: health.statuses.complete,
                          state: 'COMPLETE',
                        },
                        {
                          label: 'Partial reports',
                          count: health.statuses.partial,
                          state: 'PARTIAL',
                        },
                        {
                          label: 'Failed assessments',
                          count: health.statuses.failed,
                          state: 'FAILED',
                        },
                        {
                          label: 'Queued or running',
                          count: health.summary.active,
                          state: 'RUNNING',
                        },
                        {
                          label: 'Not assessed',
                          count: health.summary.notAssessed,
                          state: 'NOT_ASSESSED',
                        },
                        {
                          label: 'Cancelled',
                          count: health.statuses.cancelled,
                          state: 'CANCELLED',
                        },
                      ]
                        .filter(
                          (status) =>
                            status.count > 0 || status.state === 'COMPLETE'
                        )
                        .map((status) => (
                          <div
                            key={status.state}
                            className='flex items-center justify-between gap-3'
                          >
                            <dt className='text-muted-foreground'>
                              {status.label}
                            </dt>
                            <dd className='font-medium tabular-nums'>
                              {status.count}
                            </dd>
                          </div>
                        ))}
                    </dl>
                    <div className='mt-auto pt-1'>
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() => setTab('repositories')}
                      >
                        View repositories
                        <ArrowUpRight />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
                <Card className='min-w-0 xl:col-span-2'>
                  <CardHeader className='flex flex-row items-center gap-3'>
                    <SurfaceIcon icon={ShieldCheck} tone='amber' />
                    <div>
                      <CardTitle>Priority findings</CardTitle>
                      <CardDescription>
                        High and critical issues from the latest reports
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className='flex flex-1 flex-col'>
                    {priorityFindings.length ? (
                      <ul className='divide-y'>
                        {priorityFindings.map((finding) => (
                          <li
                            key={`${finding.assessmentId}-${finding.fingerprint}`}
                            className='py-3 first:pt-0 last:pb-0'
                          >
                            <button
                              type='button'
                              onClick={() =>
                                exploreHealth(finding.repositoryId)
                              }
                              className='group flex min-w-0 items-start justify-between gap-3 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-ring'
                            >
                              <div className='min-w-0 space-y-1.5'>
                                <div className='flex flex-wrap items-center gap-2'>
                                  <StatusBadge tone='error'>High</StatusBadge>
                                  <span className='text-sm font-medium wrap-anywhere group-hover:underline'>
                                    {finding.title}
                                  </span>
                                </div>
                                <p className='text-xs wrap-anywhere text-muted-foreground'>
                                  {finding.repositoryName} · {finding.branch}
                                  {finding.path
                                    ? ` · ${finding.path}${finding.line ? `:${finding.line}` : ''}`
                                    : ''}
                                </p>
                              </div>
                              <ArrowUpRight className='mt-1 size-4 shrink-0 text-muted-foreground' />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className='flex flex-1 flex-col justify-center gap-2 py-6'>
                        <p className='text-sm font-medium'>
                          No high or critical findings reported
                        </p>
                        <p className='max-w-prose text-sm text-muted-foreground'>
                          This covers repositories with validated analyzer
                          output. Partial and unassessed repositories may still
                          have issues.
                        </p>
                      </div>
                    )}
                    <p className='mt-4 border-t pt-3 text-xs text-muted-foreground'>
                      {health.summary.analyzed} of {health.summary.repositories}{' '}
                      repositories have analyzer results. Up to five priority
                      findings are shown; open a report for all retained
                      findings.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
        <p className='text-xs text-muted-foreground'>
          {tab === 'health' ? 'Latest saved health reports' : 'Local data'} ·
          updated{' '}
          {clientReady ? (
            <RelativeTime value={updatedAt} />
          ) : (
            <time dateTime={updatedAt}>{dateLabel(updatedAt)}</time>
          )}
        </p>
      </div>
    </TooltipProvider>
  )
}
