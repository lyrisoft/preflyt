import { Link } from '@tanstack/react-router'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Layers,
  ShieldCheck,
  ListChecks,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ResultTimestamp } from '@/components/result-timestamp'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import {
  healthLabel,
  healthTone,
  type HealthPortfolioData,
} from '@/features/health/health-api'

export function DashboardHealthMetrics({
  data,
}: {
  data?: HealthPortfolioData
}) {
  return (
    <div
      className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'
      aria-label='Repository health metrics'
    >
      {[
        {
          label: 'Repositories assessed',
          value: data
            ? `${data.summary.assessed} / ${data.summary.repositories}`
            : null,
          icon: Layers,
          tone: 'blue' as const,
        },
        {
          label: 'Queued or running',
          value: data?.summary.active,
          icon: Activity,
          tone: 'blue' as const,
        },
        {
          label: 'High and critical findings',
          value: data
            ? data.summary.analyzed
              ? data.summary.high
              : 'Unavailable'
            : null,
          icon: ShieldCheck,
          tone: 'amber' as const,
        },
        {
          label: 'Incomplete or failed',
          value: data?.summary.incomplete,
          icon: AlertTriangle,
          tone: 'amber' as const,
        },
      ].map((stat) => (
        <Card key={stat.label}>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium'>{stat.label}</CardTitle>
            <SurfaceIcon icon={stat.icon} tone={stat.tone} />
          </CardHeader>
          <CardContent>
            {data ? (
              <p className='text-3xl font-semibold tracking-tight tabular-nums'>
                {stat.value}
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
  const statuses = [
    {
      label: 'Complete reports',
      count: data.statuses.complete,
      state: 'COMPLETE',
    },
    {
      label: 'Partial reports',
      count: data.statuses.partial,
      state: 'PARTIAL',
    },
    {
      label: 'Failed assessments',
      count: data.statuses.failed,
      state: 'FAILED',
    },
    {
      label: 'Queued or running',
      count: data.summary.active,
      state: 'RUNNING',
    },
    {
      label: 'Not assessed',
      count: data.summary.notAssessed,
      state: 'NOT_ASSESSED',
    },
    { label: 'Cancelled', count: data.statuses.cancelled, state: 'CANCELLED' },
  ]
  return (
    <div className='space-y-4'>
      <div className='grid gap-4 xl:grid-cols-3'>
        <Card className='min-w-0'>
          <CardHeader className='flex flex-row items-center gap-3'>
            <SurfaceIcon icon={ListChecks} tone='violet' />
            <div>
              <CardTitle>Assessment status</CardTitle>
              <CardDescription>Latest report per repository</CardDescription>
            </div>
          </CardHeader>
          <CardContent className='flex flex-1 flex-col gap-4'>
            <dl className='space-y-3 text-sm'>
              {statuses
                .filter((s) => s.count > 0 || s.state === 'COMPLETE')
                .map((s) => (
                  <div
                    key={s.state}
                    className='flex items-center justify-between gap-3'
                  >
                    <dt className='text-muted-foreground'>{s.label}</dt>
                    <dd className='font-medium tabular-nums'>{s.count}</dd>
                  </div>
                ))}
            </dl>
            {data.summary.incomplete > 0 && (
              <p className='border-t pt-3 text-sm text-muted-foreground'>
                Some assessments could not finish all analyses. Open a
                repository’s Health tab to see what is missing.
              </p>
            )}
            <div className='mt-auto pt-1'>
              <Button size='sm' variant='outline' asChild>
                <Link to='/repositories'>
                  View repositories <ArrowUpRight />
                </Link>
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
            {data.priorityFindings.length ? (
              <ul className='divide-y'>
                {data.priorityFindings.map((f) => (
                  <li
                    key={`${f.assessmentId}-${f.fingerprint}`}
                    className='py-3 first:pt-0 last:pb-0'
                  >
                    <Link
                      to='/repositories/$repositoryId'
                      params={{ repositoryId: f.repositoryId }}
                      search={{ tab: 'health', health: f.assessmentId }}
                      className='group flex min-w-0 items-start justify-between gap-3 rounded-sm focus-visible:outline-2 focus-visible:outline-ring'
                    >
                      <div className='min-w-0 space-y-1.5'>
                        <div className='flex flex-wrap items-center gap-2'>
                          <StatusBadge tone={healthTone(f.severity)}>
                            {healthLabel(f.severity)}
                          </StatusBadge>
                          <span className='text-sm font-medium wrap-anywhere group-hover:underline'>
                            {f.title}
                          </span>
                        </div>
                        <p className='text-xs wrap-anywhere text-muted-foreground'>
                          {f.repositoryName} · {f.branch}
                          {f.path
                            ? ` · ${f.path}${f.line ? `:${f.line}` : ''}`
                            : ''}
                        </p>
                        <p className='text-xs text-muted-foreground'>
                          Assessed <ResultTimestamp value={f.assessedAt} />
                        </p>
                      </div>
                      <ArrowUpRight className='mt-1 size-4 shrink-0 text-muted-foreground' />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className='flex flex-1 flex-col justify-center gap-2 py-6'>
                <p className='text-sm font-medium'>
                  {data.summary.analyzed
                    ? 'No high or critical findings reported'
                    : 'Findings are not available yet'}
                </p>
                <p className='max-w-prose text-sm text-muted-foreground'>
                  {data.summary.analyzed
                    ? 'This covers repositories with validated analyzer output. Partial and unassessed repositories may still have issues.'
                    : 'No validated analyzer output is available. Open a repository’s Health tab to review its assessment and analysis requirements.'}
                </p>
              </div>
            )}
            {!!data.summary.analyzed && (
              <p className='mt-4 border-t pt-3 text-xs text-muted-foreground'>
                {data.summary.analyzed} of {data.summary.repositories}{' '}
                repositories have analyzer results. Up to five priority findings
                are shown; open a report for all retained findings.
              </p>
            )}
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
