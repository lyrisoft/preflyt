import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { TrendingUp } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { chartAnimation, chartTooltipAnimation } from '@/lib/chart-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import { governanceRequest } from './governance-api'

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
export function RulesetInsights({
  repositoryId,
  actorId,
  rulesetId,
}: {
  repositoryId: string
  actorId?: string
  rulesetId: number
}) {
  const [page, setPage] = useState(1),
    [period, setPeriod] = useState('week'),
    [source, setSource] = useState('live'),
    [result, setResult] = useState('all'),
    [ref, setRef] = useState(''),
    [actor, setActor] = useState(''),
    [filters, setFilters] = useState({ ref: '', actor: '' })
  const query = useQuery({
    queryKey: [
      'ruleset-insights',
      actorId,
      repositoryId,
      rulesetId,
      page,
      period,
      source,
      result,
      filters,
    ],
    queryFn: ({ signal }) =>
      governanceRequest<Insights>(
        `/github/repositories/${repositoryId}/rulesets/${rulesetId}/insights?${new URLSearchParams({ page: String(page), period, source, result, ...filters })}`,
        undefined,
        signal
      ),
    retry: false,
  })
  const data = query.isError ? undefined : query.data
  return (
    <div className='space-y-5'>
      <div className='space-y-2'>
        <Label htmlFor='insight-source'>History source</Label>
        <Select
          value={source}
          onValueChange={(value) => {
            setSource(value)
            setPage(1)
            if (value === 'live' && period === 'quarter') setPeriod('month')
          }}
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
      <div className='grid gap-3 sm:grid-cols-2'>
        <div className='space-y-2'>
          <Label htmlFor='insight-period'>Period</Label>
          <Select
            value={period}
            onValueChange={(value) => {
              setPeriod(value)
              setPage(1)
            }}
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
                ...(source === 'retained' ? [['quarter', 'Last 90 days']] : []),
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
            value={result}
            onValueChange={(value) => {
              setResult(value)
              setPage(1)
            }}
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
      </div>
      <form
        className='flex flex-wrap items-end gap-3'
        onSubmit={(event) => {
          event.preventDefault()
          setFilters({ ref: ref.trim(), actor: actor.trim() })
          setPage(1)
        }}
      >
        <div className='min-w-0 flex-1 space-y-2'>
          <Label htmlFor='insight-ref'>Branch ref</Label>
          <Input
            id='insight-ref'
            placeholder='refs/heads/main (optional)'
            value={ref}
            onChange={(event) => setRef(event.target.value)}
          />
        </div>
        <div className='min-w-0 flex-1 space-y-2'>
          <Label htmlFor='insight-actor'>GitHub username</Label>
          <Input
            id='insight-actor'
            placeholder='All users'
            value={actor}
            onChange={(event) => setActor(event.target.value)}
          />
        </div>
        <Button type='submit' variant='outline' disabled={query.isFetching}>
          Apply
        </Button>
      </form>
      {query.isPending && (
        <p role='status' className='text-sm'>
          Loading GitHub evaluations…
        </p>
      )}
      {query.isError && (
        <div role='alert' className='space-y-3'>
          <p className='text-sm text-destructive'>{query.error.message}</p>
          <Button variant='outline' onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      )}
      {data && (
        <>
          <div className='flex flex-wrap justify-between gap-2 text-xs text-muted-foreground'>
            <span>
              {data.collection
                ? 'Saved GitHub evaluations'
                : 'GitHub rule evaluations'}{' '}
              · This page
            </span>
            <span>
              {data.fetchedAt
                ? `Fetched ${new Date(data.fetchedAt).toLocaleString()}`
                : 'No history collected yet'}
            </span>
          </div>
          {data.collection && (
            <div
              role='status'
              className='rounded-xl border p-3 text-xs text-muted-foreground'
            >
              {!data.collection.enabled
                ? 'History collection is disabled. '
                : data.collection.error
                  ? 'The last collection failed. Saved results may be outdated. '
                  : 'Showing evaluations collected by Preflyt. '}
              {data.collection.lastSweepAt
                ? `Last collection sweep: ${new Date(data.collection.lastSweepAt).toLocaleString()}. `
                : 'The first collection sweep has not finished. '}
              Retention: {data.collection.retentionDays} days.
            </div>
          )}
          {data.trend && (
            <Card>
              <CardHeader className='flex-row items-center gap-3'>
                <SurfaceIcon icon={TrendingUp} tone='teal' />
                <div>
                  <CardTitle className='text-sm'>Saved rule history</CardTitle>
                  <p className='mt-1 text-xs text-muted-foreground'>
                    Selected period · UTC days · Collected evaluations only
                  </p>
                </div>
              </CardHeader>
              <CardContent className='space-y-4'>
                {(data.trend.truncated ||
                  data.trend.previousWindowLimitedByRetention) && (
                  <p role='status' className='text-xs text-warning'>
                    {data.trend.truncated &&
                      `Showing the newest ${data.trend.limit} saved suites. Earlier results may be omitted. `}
                    {data.trend.previousWindowLimitedByRetention &&
                      'Retention covers only part of the previous period.'}
                  </p>
                )}
                {data.trend.days.length ? (
                  <div
                    className='h-52'
                    role='img'
                    aria-label={data.trend.days
                      .map(
                        (day) =>
                          `${day.day}: ${day.activePass} active passes, ${day.activeFail} active failures, ${day.evaluateFail} evaluation-mode failures, ${day.attributedBypass} confirmed bypasses`
                      )
                      .join('; ')}
                  >
                    <ResponsiveContainer width='100%' height='100%'>
                      <BarChart data={data.trend.days} accessibilityLayer>
                        <CartesianGrid
                          vertical={false}
                          stroke='var(--border)'
                        />
                        <XAxis
                          dataKey='day'
                          tick={{
                            fontSize: 10,
                            fill: 'var(--muted-foreground)',
                          }}
                          tickFormatter={(day) => day.slice(5)}
                        />
                        <YAxis
                          allowDecimals={false}
                          width={28}
                          tick={{
                            fontSize: 10,
                            fill: 'var(--muted-foreground)',
                          }}
                        />
                        <Tooltip
                          {...chartTooltipAnimation}
                          contentStyle={{
                            background: 'var(--popover)',
                            borderColor: 'var(--border)',
                            borderRadius: 10,
                            color: 'var(--foreground)',
                          }}
                        />
                        <Bar
                          dataKey='activePass'
                          name='Active passed'
                          fill='var(--success)'
                          {...chartAnimation}
                        />
                        <Bar
                          dataKey='activeFail'
                          name='Active failed'
                          fill='var(--danger)'
                          {...chartAnimation}
                        />
                        <Bar
                          dataKey='evaluateFail'
                          name='Evaluate mode failed'
                          fill='var(--warning)'
                          {...chartAnimation}
                        />
                        <Bar
                          dataKey='attributedBypass'
                          name='Confirmed bypass'
                          fill='var(--info)'
                          {...chartAnimation}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className='text-sm text-muted-foreground'>
                    No saved evaluations match this period.
                  </p>
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rule result</TableHead>
                      <TableHead>Selected period</TableHead>
                      <TableHead>Previous period</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(
                      [
                        ['activePass', 'Active passed'],
                        ['activeFail', 'Active failed'],
                        ['evaluateFail', 'Evaluate mode failed'],
                        ['attributedBypass', 'Confirmed bypass'],
                      ] as const
                    ).map(([key, text]) => (
                      <TableRow key={key}>
                        <TableCell>{text}</TableCell>
                        <TableCell>{data.trend!.current[key]}</TableCell>
                        <TableCell>{data.trend!.previous[key]}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
          <div className='grid grid-cols-2 gap-3'>
            {[
              {
                name: 'Active rules passed',
                count: data.summary.activePass,
                tone: 'success' as const,
              },
              {
                name: 'Active rules failed',
                count: data.summary.activeFail,
                tone: 'error' as const,
              },
              {
                name: 'Evaluate mode failures',
                count: data.summary.evaluateFail,
                tone: 'warning' as const,
              },
              {
                name: 'Confirmed rule bypasses',
                count: data.summary.attributedBypass,
                tone: 'info' as const,
              },
            ].map((metric) => (
              <div
                key={metric.name}
                className='space-y-2 rounded-xl border p-4'
              >
                <p className='text-xs text-muted-foreground'>{metric.name}</p>
                <StatusBadge tone={metric.tone}>{metric.count}</StatusBadge>
              </div>
            ))}
          </div>
          {!!data.summary.failureTypes.length && (
            <section className='space-y-3 rounded-xl border p-4'>
              <h3 className='text-sm font-semibold'>
                Failed active rules · This page
              </h3>
              <div
                className='h-48'
                role='img'
                aria-label={data.summary.failureTypes
                  .map((item) => `${label(item.type)}: ${item.count}`)
                  .join(', ')}
              >
                <ResponsiveContainer width='100%' height='100%'>
                  <BarChart
                    data={data.summary.failureTypes.map((item) => ({
                      ...item,
                      name: label(item.type),
                    }))}
                    accessibilityLayer
                  >
                    <CartesianGrid vertical={false} stroke='var(--border)' />
                    <XAxis
                      dataKey='name'
                      tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                      width={28}
                    />
                    <Tooltip
                      {...chartTooltipAnimation}
                      contentStyle={{
                        background: 'var(--popover)',
                        borderColor: 'var(--border)',
                        borderRadius: 10,
                        color: 'var(--foreground)',
                      }}
                    />
                    <Bar
                      dataKey='count'
                      fill='var(--danger)'
                      radius={[4, 4, 0, 0]}
                      {...chartAnimation}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}
          <Table>
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
                          {new Date(assessment.createdAt).toLocaleDateString()}
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
            <p className='rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground'>
              No matching evaluations on this page.
            </p>
          )}
          <p className='text-xs text-muted-foreground'>
            Counts cover {data.summary.ruleEvaluations} matching rule results in{' '}
            {data.scannedSuites} GitHub suites on this page. Preflyt readiness
            checks are shown separately in the Merge review result tab.
          </p>
          <div className='flex items-center justify-between border-t pt-4'>
            <span className='text-xs text-muted-foreground'>Page {page}</span>
            <div className='flex gap-2'>
              <Button
                size='sm'
                variant='outline'
                disabled={page === 1 || query.isFetching}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <Button
                size='sm'
                variant='outline'
                disabled={!data.hasMore || page >= 1000 || query.isFetching}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
              <Button
                size='sm'
                variant='outline'
                disabled={query.isFetching}
                onClick={() => void query.refetch()}
              >
                Refresh
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
