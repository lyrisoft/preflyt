import { useId, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ListFilter, ChartNoAxesCombined } from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { chartAnimation, chartTooltipAnimation } from '@/lib/chart-motion'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import { governanceRequest } from './governance-api'
import { workflowRefreshInterval } from './workflow-refresh-polling'
import { WorkflowRequestError } from './workflow-request-error'

type Suite = {
  id: number
  actor: string
  ref: string
  sourceSha: string
  pushedAt: string
  suiteResult: string
  assessments?: { id: string; createdAt: string }[]
  moreAssessments?: boolean
  rules: {
    type: string
    result: string
    enforcement: string
    details: string | null
  }[]
}
type Insights = {
  suites: Suite[]
  hasMore: boolean
  fetchedAt: string | null
  collection?: {
    enabled: boolean
    error: boolean
    lastSweepAt: string | null
    retentionDays: number
  }
  scannedSuites: number
  repositoryName: string
  trend?: {
    truncated: boolean
    previousWindowLimitedByRetention: boolean
    scannedSuites: number
    limit: number
    current: {
      activePass: number
      activeFail: number
      evaluateFail: number
      attributedBypass: number
    }
    previous: {
      activePass: number
      activeFail: number
      evaluateFail: number
      attributedBypass: number
    }
    days: {
      day: string
      activePass: number
      activeFail: number
      evaluateFail: number
      attributedBypass: number
    }[]
  }
  summary: {
    ruleEvaluations: number
    activePass: number
    activeFail: number
    evaluateFail: number
    attributedBypass: number
    suiteBypassUnattributed: number
    failureTypes: { type: string; count: number }[]
  }
}
const label = (text: string) =>
  text.replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase())
const trendSeries = [
  { key: 'passed', name: 'Active passed', color: 'var(--success)' },
  { key: 'failed', name: 'Active failed', color: 'var(--danger)' },
  { key: 'evaluateFailed', name: 'Evaluate failures', color: 'var(--warning)' },
  { key: 'bypassed', name: 'Rule bypasses', color: 'var(--info)' },
] as const
const periodLabels: Record<string, string> = {
  hour: 'Last hour',
  day: 'Last day',
  week: 'Last week',
  month: 'Last month',
  quarter: 'Last 90 days',
}
function evaluationTrend(suites: Suite[], hourly: boolean) {
  const buckets = new Map<
    string,
    {
      time: string
      passed: number
      failed: number
      evaluateFailed: number
      bypassed: number
    }
  >()
  for (const suite of suites) {
    const time = suite.pushedAt.slice(0, hourly ? 13 : 10)
    const bucket = buckets.get(time) ?? {
      time,
      passed: 0,
      failed: 0,
      evaluateFailed: 0,
      bypassed: 0,
    }
    for (const rule of suite.rules) {
      if (rule.result === 'bypass') bucket.bypassed++
      else if (rule.enforcement === 'active' && rule.result === 'pass')
        bucket.passed++
      else if (rule.enforcement === 'active' && rule.result === 'fail')
        bucket.failed++
      else if (rule.enforcement === 'evaluate' && rule.result === 'fail')
        bucket.evaluateFailed++
    }
    buckets.set(time, bucket)
  }
  return [...buckets.values()].sort((a, b) => a.time.localeCompare(b.time))
}
export function RulesetInsights({
  repositoryId,
  actorId,
  rulesetId,
  configuration,
}: {
  repositoryId: string
  actorId?: string
  rulesetId: number
  configuration: ReactNode
}) {
  const gradientId = useId()
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({
    period: 'week',
    source: 'live',
    result: 'all',
    ref: '',
    actor: '',
  })
  const [draft, setDraft] = useState(filters)
  const [filterOpen, setFilterOpen] = useState(false)
  const { period, source, result } = filters
  const query = useQuery({
    queryKey: [
      'ruleset-insights',
      actorId,
      repositoryId,
      rulesetId,
      page,
      pageSize,
      period,
      source,
      result,
      filters,
    ],
    queryFn: ({ signal }) =>
      governanceRequest<Insights>(
        `/github/repositories/${repositoryId}/rulesets/${rulesetId}/insights?${new URLSearchParams({ page: String(page), pageSize: String(pageSize), ...filters })}`,
        undefined,
        signal
      ),
    retry: false,
    refetchInterval: (query) => workflowRefreshInterval(query.state.error),
  })
  const data = query.isError ? undefined : query.data
  const hourly = period === 'hour' || period === 'day'
  const trend = data?.trend
    ? data.trend.days.map((day) => ({
        time: day.day,
        passed: day.activePass,
        failed: day.activeFail,
        evaluateFailed: day.evaluateFail,
        bypassed: day.attributedBypass,
      }))
    : evaluationTrend(data?.suites ?? [], hourly)
  return (
    <div className='space-y-5'>
      <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
        <DialogContent className='max-h-[90dvh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>Filter insights</DialogTitle>
            <DialogDescription>
              Choose the history and evaluations to show.
            </DialogDescription>
          </DialogHeader>
          <form
            className='space-y-4'
            onSubmit={(event) => {
              event.preventDefault()
              setFilters({
                ...draft,
                ref: draft.ref.trim(),
                actor: draft.actor.trim(),
              })
              setPage(1)
              setFilterOpen(false)
            }}
          >
            <div className='space-y-2'>
              <Label htmlFor='insight-source'>History source</Label>
              <Select
                value={draft.source}
                onValueChange={(source) =>
                  setDraft({
                    ...draft,
                    source,
                    period:
                      source === 'live' && draft.period === 'quarter'
                        ? 'month'
                        : draft.period,
                  })
                }
              >
                <SelectTrigger id='insight-source' className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='live'>Current GitHub history</SelectItem>
                  <SelectItem value='retained'>Saved GitHub history</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className='grid gap-4 sm:grid-cols-2'>
              <div className='space-y-2'>
                <Label htmlFor='insight-period'>Period</Label>
                <Select
                  value={draft.period}
                  onValueChange={(period) => setDraft({ ...draft, period })}
                >
                  <SelectTrigger id='insight-period' className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      ['hour', 'Last hour'],
                      ['day', 'Last day'],
                      ['week', 'Last week'],
                      ['month', 'Last month'],
                      ...(draft.source === 'retained'
                        ? [['quarter', 'Last 90 days']]
                        : []),
                    ].map(([value, text]) => (
                      <SelectItem key={value} value={value}>
                        {text}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className='space-y-2'>
                <Label htmlFor='insight-result'>Rule result</Label>
                <Select
                  value={draft.result}
                  onValueChange={(result) => setDraft({ ...draft, result })}
                >
                  <SelectTrigger id='insight-result' className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['all', 'pass', 'fail', 'bypass'].map((value) => (
                      <SelectItem key={value} value={value}>
                        {label(value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className='space-y-2'>
                <Label htmlFor='insight-ref'>Branch ref</Label>
                <Input
                  id='insight-ref'
                  placeholder='refs/heads/main (optional)'
                  value={draft.ref}
                  onChange={(event) =>
                    setDraft({ ...draft, ref: event.target.value })
                  }
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='insight-actor'>GitHub username</Label>
                <Input
                  id='insight-actor'
                  placeholder='All users'
                  value={draft.actor}
                  onChange={(event) =>
                    setDraft({ ...draft, actor: event.target.value })
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setFilterOpen(false)}
              >
                Cancel
              </Button>
              <Button type='submit'>Apply filters</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <div className='grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]'>
        <Card className='min-w-0'>
          <CardHeader className='flex flex-wrap items-center justify-between gap-3'>
            <div className='flex min-w-0 items-center gap-3'>
              <SurfaceIcon icon={ChartNoAxesCombined} tone='blue' />
              <div>
                <CardTitle>
                  {data?.trend ? 'Saved rule history' : 'Ruleset insights'}
                </CardTitle>
                <p className='mt-1 text-xs text-muted-foreground'>
                  {periodLabels[period]} · UTC ·{' '}
                  {data?.trend ? 'Selected period' : `Page ${page}`}
                </p>
              </div>
            </div>
            <div className='shrink-0'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => {
                  setDraft(filters)
                  setFilterOpen(true)
                }}
              >
                <ListFilter className='size-4' />
                Filter
              </Button>
            </div>
          </CardHeader>
          <CardContent className='space-y-4'>
            {query.isPending && <Skeleton className='h-72' />}
            {query.isError && (
              <div className='flex flex-wrap items-start gap-3'>
                <WorkflowRequestError
                  error={query.error}
                  retry={() => void query.refetch()}
                  automatic
                  checking={query.isFetching}
                />
              </div>
            )}
            {data && (
              <>
                {data.trend && (
                  <div className='space-y-2 text-xs text-muted-foreground'>
                    <p>Selected period compared with the previous period.</p>
                    {(data.trend.truncated ||
                      data.trend.previousWindowLimitedByRetention) && (
                      <p role='status'>
                        {data.trend.truncated &&
                          `Showing the newest ${data.trend.limit} saved suites. `}
                        {data.trend.previousWindowLimitedByRetention &&
                          'Retention covers only part of the previous period.'}
                      </p>
                    )}
                    <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
                      {(
                        [
                          ['activePass', 'Active passed'],
                          ['activeFail', 'Active failed'],
                          ['evaluateFail', 'Evaluate failures'],
                          ['attributedBypass', 'Rule bypasses'],
                        ] as const
                      ).map(([key, title]) => (
                        <p key={key}>
                          {title}: {data.trend!.current[key]} · Previous period{' '}
                          {data.trend!.previous[key]}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
                {trend.length ? (
                  <div
                    className='h-64 sm:h-72'
                    role='img'
                    aria-label={`GitHub rule evaluations ${data.trend ? 'in selected period' : `on page ${page}`}: ${data.trend?.current.activePass ?? data.summary.activePass} active passed, ${data.trend?.current.activeFail ?? data.summary.activeFail} active failed, ${data.trend?.current.evaluateFail ?? data.summary.evaluateFail} evaluate failures, ${data.trend?.current.attributedBypass ?? data.summary.attributedBypass} rule bypasses.`}
                  >
                    <ResponsiveContainer width='100%' height='100%'>
                      <AreaChart
                        data={trend}
                        accessibilityLayer
                        margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
                      >
                        <defs>
                          {trendSeries.map((series) => (
                            <linearGradient
                              key={series.key}
                              id={`${gradientId}-${series.key}`}
                              x1='0'
                              y1='0'
                              x2='0'
                              y2='1'
                            >
                              <stop
                                offset='0%'
                                stopColor={series.color}
                                stopOpacity={0.22}
                              />
                              <stop
                                offset='100%'
                                stopColor={series.color}
                                stopOpacity={0.015}
                              />
                            </linearGradient>
                          ))}
                        </defs>
                        <CartesianGrid
                          vertical={false}
                          stroke='var(--border)'
                          strokeOpacity={0.5}
                        />
                        <XAxis
                          dataKey='time'
                          tickFormatter={(value: string) =>
                            hourly
                              ? `${value.slice(5, 10)} ${value.slice(11)}:00`
                              : new Date(
                                  `${value}T00:00:00Z`
                                ).toLocaleDateString('en-GB', {
                                  day: '2-digit',
                                  month: 'short',
                                  timeZone: 'UTC',
                                })
                          }
                          tick={{
                            fontSize: '0.75rem',
                            fill: 'var(--muted-foreground)',
                          }}
                          tickLine={false}
                          axisLine={false}
                          minTickGap={32}
                        />
                        <YAxis
                          allowDecimals={false}
                          tick={{
                            fontSize: '0.75rem',
                            fill: 'var(--muted-foreground)',
                          }}
                          tickLine={false}
                          axisLine={false}
                          width={28}
                        />
                        <Tooltip
                          {...chartTooltipAnimation}
                          cursor={{
                            stroke: 'var(--muted-foreground)',
                            strokeOpacity: 0.3,
                            strokeDasharray: '4 4',
                          }}
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null
                            return (
                              <div className='min-w-44 rounded-xl border bg-popover p-3 text-xs text-popover-foreground shadow-md'>
                                <p className='mb-2 font-medium'>
                                  {String(label).replace('T', ' ')}
                                  {hourly ? ':00' : ''} UTC
                                </p>
                                <div className='space-y-2'>
                                  {payload.map((item) => (
                                    <div
                                      key={String(item.dataKey)}
                                      className='flex items-center justify-between gap-4'
                                    >
                                      <span className='flex items-center gap-2 text-muted-foreground'>
                                        <span
                                          className='size-2 rounded-full'
                                          style={{ background: item.color }}
                                        />
                                        {item.name}
                                      </span>
                                      <span className='font-semibold tabular-nums'>
                                        {item.value}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )
                          }}
                        />
                        {trendSeries.map((series) => (
                          <Area
                            key={series.key}
                            dataKey={series.key}
                            name={series.name}
                            type='monotoneX'
                            stroke={series.color}
                            strokeWidth={3}
                            strokeLinecap='round'
                            strokeLinejoin='round'
                            fill={`url(#${gradientId}-${series.key})`}
                            dot={
                              trend.length === 1
                                ? { r: 4, strokeWidth: 2, fill: 'var(--card)' }
                                : false
                            }
                            activeDot={{
                              r: 5,
                              stroke: 'var(--card)',
                              strokeWidth: 2,
                            }}
                            {...chartAnimation}
                          />
                        ))}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className='flex h-48 items-center justify-center rounded-lg border border-dashed px-4 text-center text-sm text-muted-foreground'>
                    {data.trend
                      ? 'No saved evaluations match this period.'
                      : 'No evaluations match these filters.'}
                  </p>
                )}
                <div className='flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground'>
                  {trendSeries.map((series) => (
                    <span
                      key={series.key}
                      className='flex items-center gap-1.5'
                    >
                      <span
                        className='size-2.5 rounded-full'
                        style={{ background: series.color }}
                      />
                      {series.name}
                    </span>
                  ))}
                </div>
                <div className='grid grid-cols-2 gap-2 xl:grid-cols-4'>
                  {[
                    {
                      name: 'Active passed',
                      count:
                        data.trend?.current.activePass ??
                        data.summary.activePass,
                      tone: 'success' as const,
                    },
                    {
                      name: 'Active failed',
                      count:
                        data.trend?.current.activeFail ??
                        data.summary.activeFail,
                      tone: 'error' as const,
                    },
                    {
                      name: 'Evaluate failures',
                      count:
                        data.trend?.current.evaluateFail ??
                        data.summary.evaluateFail,
                      tone: 'warning' as const,
                    },
                    {
                      name: 'Rule bypasses',
                      count:
                        data.trend?.current.attributedBypass ??
                        data.summary.attributedBypass,
                      tone: 'info' as const,
                    },
                  ].map((metric) => (
                    <div
                      key={metric.name}
                      className='space-y-2 rounded-lg border p-3'
                    >
                      <p className='text-xs text-muted-foreground'>
                        {metric.name}
                      </p>
                      <StatusBadge tone={metric.tone}>
                        {metric.count}
                      </StatusBadge>
                    </div>
                  ))}
                </div>
                <p className='text-xs text-muted-foreground'>
                  {data.summary.ruleEvaluations} matching rule results ·{' '}
                  {data.scannedSuites} GitHub suites scanned on this page
                  {data.hasMore ? ' · More evaluations on the next page' : ''}
                </p>
                {data.collection &&
                  (!data.collection.enabled ||
                    data.collection.error ||
                    !data.collection.lastSweepAt) && (
                    <p
                      role='status'
                      className='rounded-lg border p-3 text-xs text-muted-foreground'
                    >
                      {!data.collection.enabled
                        ? 'History collection is disabled.'
                        : data.collection.error
                          ? 'The last history collection failed. Saved results may be outdated.'
                          : 'The first history collection has not finished.'}
                    </p>
                  )}
              </>
            )}
          </CardContent>
        </Card>
        {configuration}
      </div>
      {data && (
        <Card>
          <CardHeader className='flex flex-wrap items-center justify-between gap-2'>
            <div>
              <CardTitle>History</CardTitle>
              <p className='mt-1 text-xs text-muted-foreground'>
                {data.collection
                  ? 'Saved GitHub history'
                  : 'Current GitHub history'}{' '}
                · Page {page}
              </p>
            </div>
            <p className='text-xs text-muted-foreground'>
              {data.fetchedAt
                ? `Fetched ${new Date(data.fetchedAt).toLocaleString()}`
                : 'No history collected yet'}
            </p>
          </CardHeader>
          <CardContent className='space-y-3'>
            <Table
              pagination={{
                page,
                pageSize,
                hasNext: data?.hasMore,
                onPageChange: setPage,
                onPageSizeChange: (size) => {
                  setPageSize(size)
                  setPage(1)
                },
              }}
            >
              <TableHeader>
                <TableRow>
                  <TableHead>Evaluation</TableHead>
                  <TableHead>Rule results</TableHead>
                  <TableHead>Evidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.suites.map((suite) => (
                  <TableRow key={suite.id}>
                    <TableCell>
                      <p className='text-sm font-medium'>{suite.actor}</p>
                      <p className='text-xs break-all text-muted-foreground'>
                        {suite.ref}
                      </p>
                      <p className='text-xs text-muted-foreground'>
                        {new Date(suite.pushedAt).toLocaleString()}
                      </p>
                      {suite.suiteResult === 'bypass' && (
                        <p className='mt-1 text-xs text-warning'>
                          Suite bypass reported
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className='space-y-3'>
                        {suite.rules.map((rule, index) => (
                          <div key={index} className='space-y-1'>
                            <div className='flex flex-wrap gap-2'>
                              <StatusBadge
                                tone={
                                  rule.result === 'pass'
                                    ? 'success'
                                    : rule.result === 'fail'
                                      ? 'error'
                                      : 'info'
                                }
                              >
                                {label(rule.result)}
                              </StatusBadge>
                              <span className='text-xs'>
                                {label(rule.type)} · {label(rule.enforcement)}
                              </span>
                            </div>
                            {rule.details && (
                              <p className='max-w-xs text-xs break-words text-muted-foreground'>
                                {rule.details}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button variant='ghost' size='sm' asChild>
                        <a
                          href={`https://github.com/${data.repositoryName}/commit/${suite.sourceSha}`}
                          target='_blank'
                          rel='noreferrer'
                        >
                          Commit {suite.sourceSha.slice(0, 7)}
                        </a>
                      </Button>
                      <code className='block text-xs text-muted-foreground'>
                        Suite {suite.id}
                      </code>
                      {suite.assessments?.map((assessment) => (
                        <Button
                          key={assessment.id}
                          variant='outline'
                          size='sm'
                          className='mt-2'
                          asChild
                        >
                          <Link
                            to='/repositories/$repositoryId'
                            params={{ repositoryId }}
                            search={{
                              tab: 'assessments',
                              assessment: assessment.id,
                            }}
                          >
                            Assessment ·{' '}
                            {new Date(
                              assessment.createdAt
                            ).toLocaleDateString()}
                          </Link>
                        </Button>
                      ))}
                      {suite.assessments && !suite.assessments.length && (
                        <p className='mt-2 text-xs text-muted-foreground'>
                          No saved assessment for this commit.
                        </p>
                      )}
                      {suite.moreAssessments && (
                        <p className='mt-2 text-xs text-muted-foreground'>
                          Showing the five latest assessments for this commit.
                        </p>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!data.suites.length && (
              <p className='rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground'>
                No matching evaluations on this page.
              </p>
            )}
            <>
              <Button
                size='sm'
                variant='outline'
                disabled={query.isFetching}
                onClick={() => void query.refetch()}
              >
                Refresh
              </Button>
            </>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
