import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Layers,
  ShieldCheck,
} from 'lucide-react'
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
} from 'recharts'
import { chartTooltipAnimation } from '@/lib/chart-motion'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { CompactPagination } from '@/components/compact-pagination'
import { ResultTimestamp } from '@/components/result-timestamp'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import {
  healthLabel,
  healthTone,
  type HealthPortfolioData,
} from '@/features/health/health-api'
import {
  healthDistribution,
  repositoryHealthGroup,
  type HealthGroup,
} from './health-distribution'

export function DashboardHealthMetrics({
  data,
}: {
  data?: HealthPortfolioData
}) {
  const segments = data ? healthDistribution(data) : []
  const count = (key: HealthGroup) =>
    segments.find((s) => s.key === key)?.value ?? 0
  const ready = data && data.items.length === data.summary.repositories
  const stats = [
    {
      label: 'Healthy repositories',
      value: `${count('HEALTHY')} / ${data?.summary.repositories ?? 0}`,
      icon: ShieldCheck,
      tone: 'teal' as const,
    },
    {
      label: 'Need attention',
      value: count('UNHEALTHY') + count('NEEDS_ATTENTION'),
      icon: AlertTriangle,
      tone: 'amber' as const,
    },
    {
      label: 'Incomplete or not assessed',
      value: count('INCOMPLETE') + count('NOT_ASSESSED'),
      icon: Layers,
      tone: 'violet' as const,
    },
    {
      label: 'Queued or running',
      value: count('ACTIVE'),
      icon: Activity,
      tone: 'blue' as const,
    },
  ]
  return (
    <div
      className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'
      aria-label='Repository health metrics'
    >
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium'>{stat.label}</CardTitle>
            <SurfaceIcon icon={stat.icon} tone={stat.tone} />
          </CardHeader>
          <CardContent>
            {data ? (
              <p className='text-3xl font-semibold tracking-tight tabular-nums'>
                {ready ? stat.value : 'Unavailable'}
              </p>
            ) : (
              <Skeleton className='h-9 w-20' />
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function DashboardHealth({
  data,
  pending,
  error,
  retry,
}: {
  data?: HealthPortfolioData
  pending: boolean
  error: Error | null
  retry: () => void
}) {
  const [selected, setSelected] = useState<HealthGroup | 'attention' | 'all'>(
    'attention'
  )
  const [requestedPage, setPage] = useState(1)
  if (pending)
    return (
      <p role='status' className='text-sm text-muted-foreground'>
        Loading repository health…
      </p>
    )
  if (error)
    return (
      <Card>
        <CardHeader>
          <CardTitle>Health unavailable</CardTitle>
        </CardHeader>
        <CardContent className='space-y-3'>
          <p role='alert' className='text-sm text-muted-foreground'>
            {error.message}
          </p>
          <Button variant='outline' onClick={retry}>
            Retry health summary
          </Button>
        </CardContent>
      </Card>
    )
  if (!data) return null
  if (!data.summary.repositories)
    return (
      <Card>
        <CardHeader>
          <CardTitle>Start with a repository</CardTitle>
          <CardDescription>
            Select a repository to get its first health assessment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant='outline' asChild>
            <Link to='/repositories'>
              View repositories <ArrowUpRight />
            </Link>
          </Button>
        </CardContent>
      </Card>
    )
  const segments = healthDistribution(data)
  const chartData = segments.filter((s) => s.value > 0)
  const filtered = data.items
    .filter(
      (item) =>
        selected === 'all' ||
        (selected === 'attention'
          ? [
              'UNHEALTHY',
              'NEEDS_ATTENTION',
              'INCOMPLETE',
              'NOT_ASSESSED',
            ].includes(repositoryHealthGroup(item))
          : repositoryHealthGroup(item) === selected)
    )
    .sort(
      (a, b) =>
        [
          'UNHEALTHY',
          'NEEDS_ATTENTION',
          'INCOMPLETE',
          'NOT_ASSESSED',
          'ACTIVE',
          'HEALTHY',
        ].indexOf(repositoryHealthGroup(a)) -
          [
            'UNHEALTHY',
            'NEEDS_ATTENTION',
            'INCOMPLETE',
            'NOT_ASSESSED',
            'ACTIVE',
            'HEALTHY',
          ].indexOf(repositoryHealthGroup(b)) || a.name.localeCompare(b.name)
    )
  const pages = Math.max(1, Math.ceil(filtered.length / 3))
  const page = Math.min(requestedPage, pages)
  const select = (key: HealthGroup | 'attention' | 'all') => {
    setSelected(key)
    setPage(1)
  }
  const title =
    selected === 'attention'
      ? 'Repositories needing attention'
      : selected === 'all'
        ? 'All repositories'
        : `${segments.find((s) => s.key === selected)?.label} repositories`
  return (
    <div className='space-y-4'>
      {data.items.length !== data.summary.repositories && (
        <p role='alert' className='text-sm text-warning'>
          Repository health is only partially loaded. Counts below cover{' '}
          {data.items.length} of {data.summary.repositories} repositories.
        </p>
      )}
      <div className='grid gap-4 xl:grid-cols-2'>
        <Card className='min-w-0'>
          <CardHeader className='flex flex-row items-center gap-3'>
            <SurfaceIcon icon={ShieldCheck} tone='teal' />
            <div>
              <CardTitle>Repository health distribution</CardTitle>
              <CardDescription>
                Latest saved health on each selected branch
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className='flex flex-col items-center gap-5 sm:flex-row'>
              <div
                className='relative h-56 w-56 shrink-0'
                role='img'
                aria-label={`Health of ${data.items.length} repositories: ${segments.map((s) => `${s.value} ${s.label.toLowerCase()}`).join(', ')}`}
              >
                <ResponsiveContainer width='100%' height='100%'>
                  <PieChart className='chart-motion' accessibilityLayer>
                    <Pie
                      data={chartData}
                      dataKey='value'
                      nameKey='label'
                      innerRadius='67%'
                      outerRadius='91%'
                      startAngle={90}
                      endAngle={-270}
                      paddingAngle={chartData.length > 1 ? 3 : 0}
                      cornerRadius={4}
                      stroke='var(--card)'
                      strokeWidth={2}
                      isAnimationActive={false}
                      onClick={(_, index) => {
                        if (chartData[index]) select(chartData[index].key)
                      }}
                      className='cursor-pointer'
                    >
                      {chartData.map((s) => (
                        <Cell
                          key={s.key}
                          fill={s.color}
                          opacity={
                            selected === 'attention' ||
                            selected === 'all' ||
                            selected === s.key
                              ? 1
                              : 0.35
                          }
                        />
                      ))}
                    </Pie>
                    <ChartTooltip
                      {...chartTooltipAnimation}
                      formatter={(value, name) => [
                        `${value} repositories`,
                        name,
                      ]}
                      contentStyle={{
                        background: 'var(--popover)',
                        borderColor: 'var(--border)',
                        borderRadius: 10,
                        color: 'var(--foreground)',
                      }}
                      itemStyle={{ color: 'var(--foreground)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className='pointer-events-none absolute inset-0 flex flex-col items-center justify-center'>
                  <span className='text-4xl font-semibold tracking-tight tabular-nums'>
                    {data.items.length}
                  </span>
                  <span className='mt-1 text-xs text-muted-foreground'>
                    repositories
                  </span>
                </div>
              </div>
              <div
                className='w-full min-w-0 flex-1 space-y-1'
                aria-label='Filter repositories by health'
              >
                {segments.map((s) => (
                  <button
                    key={s.key}
                    type='button'
                    aria-pressed={selected === s.key}
                    onClick={() => select(s.key)}
                    className='flex min-h-10 w-full items-center justify-between gap-3 rounded-md px-2 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-muted'
                  >
                    <span className='flex items-center gap-2'>
                      <span
                        aria-hidden
                        className={`size-2 shrink-0 rounded-full ${s.fill}`}
                      />
                      {s.label}
                    </span>
                    <span className='font-semibold tabular-nums'>
                      {s.value}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <p className='mt-5 border-t pt-3 text-xs text-muted-foreground'>
              Completed assessments can still report unhealthy repositories.
              Freshness is shown separately.
            </p>
          </CardContent>
        </Card>
        <Card className='min-w-0'>
          <CardHeader className='flex flex-row items-center gap-3'>
            <SurfaceIcon icon={AlertTriangle} tone='amber' />
            <div>
              <CardTitle>{title}</CardTitle>
              <CardDescription>
                {filtered.length}{' '}
                {filtered.length === 1 ? 'repository' : 'repositories'} · select
                a status to explore
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div
              role='group'
              aria-label='Repository view'
              className='mb-2 inline-flex items-center gap-0.5 rounded-md bg-muted/60 p-0.5'
            >
              {(
                [
                  { key: 'attention', label: 'Needs review' },
                  { key: 'all', label: 'All' },
                ] as const
              ).map((item) => (
                <button
                  key={item.key}
                  type='button'
                  aria-pressed={selected === item.key}
                  onClick={() => select(item.key)}
                  className='min-h-8 rounded px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-xs'
                >
                  {item.label}
                </button>
              ))}
            </div>
            {filtered.length ? (
              <ul className='divide-y'>
                {filtered.slice((page - 1) * 3, page * 3).map((item) => (
                  <li key={item.repositoryId} className='space-y-1.5 py-3'>
                    <div className='flex flex-wrap items-start justify-between gap-x-3 gap-y-1'>
                      <Link
                        to='/repositories/$repositoryId'
                        params={{ repositoryId: item.repositoryId }}
                        search={{
                          tab: 'health',
                          ...(item.id ? { health: item.id } : {}),
                        }}
                        className='group inline-flex min-h-7 min-w-0 items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline focus-visible:underline'
                      >
                        <span className='wrap-anywhere'>{item.name}</span>
                        <ArrowUpRight
                          aria-hidden
                          className='size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100'
                        />
                      </Link>
                      <StatusBadge
                        compact
                        tone={healthTone(
                          item.overallHealth?.status ??
                            repositoryHealthGroup(item)
                        )}
                      >
                        {healthLabel(
                          item.overallHealth?.status ??
                            (repositoryHealthGroup(item) === 'ACTIVE'
                              ? item.state
                              : repositoryHealthGroup(item))
                        )}
                      </StatusBadge>
                    </div>
                    <div className='flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground'>
                      <span className='wrap-anywhere'>
                        {item.branch ?? 'Branch not selected'}
                      </span>
                      <span aria-hidden>·</span>
                      <span>
                        Assessed <ResultTimestamp value={item.finishedAt} />
                      </span>
                      {item.id && (
                        <>
                          <span aria-hidden>·</span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                tabIndex={0}
                                className={`cursor-help rounded-sm focus-visible:outline-2 focus-visible:outline-ring ${item.freshness === 'STALE' ? 'text-warning-text' : ''}`}
                              >
                                {item.freshness === 'UNVERIFIED'
                                  ? 'Head not verified'
                                  : healthLabel(item.freshness)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className='max-w-64'>
                              {item.freshness === 'STALE'
                                ? 'The branch has advanced since this assessment.'
                                : item.freshness === 'CURRENT'
                                  ? 'The assessed commit matches the recently verified branch head.'
                                  : 'The branch head has not been recently verified. This status describes the saved report.'}
                            </TooltipContent>
                          </Tooltip>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p role='status' className='py-8 text-sm text-muted-foreground'>
                {selected === 'attention'
                  ? 'No repositories need attention in the loaded health results.'
                  : 'No repositories have this health status.'}
              </p>
            )}
            <CompactPagination
              page={page}
              pageSize={3}
              total={filtered.length}
              onPageChange={setPage}
              label='health repositories'
            />
          </CardContent>
        </Card>
      </div>
      {data.bounded && (
        <p className='text-xs text-muted-foreground'>
          Summary limited to 1,000 accessible repositories.
        </p>
      )}
    </div>
  )
}
