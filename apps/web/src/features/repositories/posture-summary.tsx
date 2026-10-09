import {
  ArrowUpRight,
  FileCode2,
  GitPullRequest,
  ListChecks,
  ShieldCheck,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { chartAnimation, chartTooltipAnimation } from '@/lib/chart-motion'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { controlSummary } from './control-summary'
import {
  useAssessmentList,
  useCiEvidence,
  useStandards,
  type Profile,
} from './repository-queries'

export type ControlFilter = 'all' | 'review' | 'found'
export type RepositoryTab =
  'overview' | 'standards' | 'assessments' | 'activity'
const states = [
  {
    key: 'HINT_DETECTED',
    label: 'Config found',
    color: 'var(--chart-2)',
    filter: 'found' as const,
  },
  {
    key: 'UNKNOWN',
    label: 'Unknown',
    color: 'var(--neutral-mark)',
    filter: 'review' as const,
  },
  {
    key: 'MISSING',
    label: 'Not found',
    color: 'var(--warning)',
    filter: 'review' as const,
  },
]
const tooltip = {
  backgroundColor: 'var(--popover)',
  color: 'var(--popover-foreground)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 12,
}

export function PostureSummary({
  repositoryId,
  profile,
  filter,
  onFilter,
  onOpenTab,
}: {
  repositoryId: string
  profile: Profile | null | undefined
  filter: ControlFilter
  onFilter: (filter: ControlFilter) => void
  onOpenTab: (tab: RepositoryTab) => void
}) {
  const standards = useStandards(repositoryId)
  const ci = useCiEvidence(repositoryId)
  const assessments = useAssessmentList(repositoryId)
  const selectionValid = standards.data?.selectionIntegrity !== false
  const controls = standards.data?.controls ?? []
  const summary = controlSummary(controls)
  const found = summary.distribution[0].value
  const distribution = summary.distribution.map((entry, index) => ({
    ...entry,
    name: states[index].label,
    color: states[index].color,
  }))
  const stats = [
    {
      label: 'Controls in scope',
      value: standards.isPending
        ? '—'
        : standards.isError || !selectionValid
          ? 'Unavailable'
          : controls.length,
      description: !selectionValid
        ? 'Saved definitions need review'
        : standards.data?.selection
          ? 'Saved policy selection'
          : 'Recommended preview',
      icon: ShieldCheck,
      color: 'text-chart-1 bg-chart-1/10',
      tab: 'standards' as const,
    },
    {
      label: 'Configuration hints',
      value:
        standards.isPending || standards.isError || !selectionValid
          ? '—'
          : `${found} / ${controls.length}`,
      description: 'Files observed · not executed',
      icon: FileCode2,
      color: 'text-chart-2 bg-chart-2/10',
      tab: 'overview' as const,
    },
    {
      label: 'Recent CI results',
      value:
        ci.isPending || ci.isError
          ? '—'
          : ci.data?.enabled
            ? ci.data.observations.length
            : 'Off',
      description: ci.isPending
        ? 'Loading recorded results'
        : ci.isError
          ? 'Recorded results unavailable'
          : ci.data?.enabled
            ? 'Latest reported results, up to 50'
            : 'Event collection not configured',
      icon: GitPullRequest,
      color: 'text-chart-4 bg-chart-4/10',
      tab: 'activity' as const,
    },
    {
      label: 'Recent snapshots',
      value:
        assessments.isPending || assessments.isError
          ? '—'
          : (assessments.data?.assessments.length ?? 0),
      description: 'Latest recorded assessments, up to 50',
      icon: ListChecks,
      color: 'text-chart-3 bg-chart-3/10',
      tab: 'assessments' as const,
    },
  ]
  return (
    <div className='space-y-5'>
      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        {stats.map((stat) => (
          <Card key={stat.label} className='gap-3 py-4'>
            <CardContent className='px-4'>
              <div className='mb-3 flex items-center justify-between'>
                <span
                  className={`flex size-9 items-center justify-center rounded-lg ${stat.color}`}
                >
                  <stat.icon className='size-4' aria-hidden='true' />
                </span>
                <Button
                  variant='ghost'
                  size='icon'
                  className='size-7 text-muted-foreground'
                  aria-label={`Open ${stat.label}`}
                  onClick={() => onOpenTab(stat.tab)}
                >
                  <ArrowUpRight className='size-4' />
                </Button>
              </div>
              <p className='text-xs font-medium text-muted-foreground'>
                {stat.label}
              </p>
              <p className='mt-1 text-2xl font-semibold tracking-tight tabular-nums'>
                {stat.value}
              </p>
              <p className='mt-1 text-xs text-muted-foreground'>
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Control posture</CardTitle>
          <CardDescription>
            Configuration observed at{' '}
            {(
              standards.data?.profileSnapshot?.sourceSha ?? profile?.sourceSha
            )?.slice(0, 7) ?? 'the current profile'}{' '}
            · no execution or gate evaluation
          </CardDescription>
        </CardHeader>
        <CardContent>
          {standards.isPending ? (
            <Skeleton className='h-52' />
          ) : standards.isError ? (
            <p role='alert' className='text-sm text-destructive'>
              {standards.error.message}
            </p>
          ) : !selectionValid ? (
            <div
              role='alert'
              className='flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4'
            >
              <p className='text-sm text-warning-text'>
                Saved standards no longer match the installed catalogue. Review
                the selection before interpreting control counts.
              </p>
              <Button
                size='sm'
                variant='outline'
                onClick={() => onOpenTab('standards')}
              >
                Review standards
              </Button>
            </div>
          ) : controls.length === 0 ? (
            <p className='py-10 text-center text-sm text-muted-foreground'>
              Choose engineering standards to establish this repository's
              control scope.
            </p>
          ) : (
            <div className='grid gap-6 md:grid-cols-2'>
              <div className='flex flex-wrap items-center justify-center gap-6'>
                <div
                  className='relative size-44'
                  role='img'
                  aria-label={distribution
                    .map((s) => `${s.name}: ${s.value}`)
                    .join(', ')}
                >
                  <ResponsiveContainer width='100%' height='100%'>
                    <PieChart className='chart-motion'>
                      <Pie
                        data={distribution}
                        dataKey='value'
                        nameKey='name'
                        innerRadius={56}
                        outerRadius={78}
                        paddingAngle={2}
                        stroke='var(--card)'
                        {...chartAnimation}
                      >
                        {distribution.map((s) => (
                          <Cell key={s.key} fill={s.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        {...chartTooltipAnimation}
                        contentStyle={tooltip}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className='pointer-events-none absolute inset-0 flex flex-col items-center justify-center'>
                    <span className='text-3xl font-semibold tabular-nums'>
                      {controls.length}
                    </span>
                    <span className='text-xs text-muted-foreground'>
                      controls
                    </span>
                  </div>
                </div>
                <div className='space-y-2'>
                  {distribution.map((s, index) => (
                    <button
                      key={s.key}
                      type='button'
                      onClick={() => onFilter(states[index].filter)}
                      aria-pressed={filter === states[index].filter}
                      className='flex min-h-8 w-40 items-center gap-2 rounded-md px-2 text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring'
                    >
                      <span
                        className='size-2 rounded-full'
                        style={{ background: s.color }}
                      />
                      <span className='flex-1 text-start text-muted-foreground'>
                        {s.name}
                      </span>
                      <span className='font-semibold tabular-nums'>
                        {s.value}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className='mb-2 text-xs font-medium text-muted-foreground'>
                  Required and advisory controls
                </p>
                <div
                  className='h-44'
                  role='img'
                  aria-label={summary.requirements
                    .map(
                      (s) =>
                        `${s.name}: ${s.found} found, ${s.unknown} unknown, ${s.missing} not found`
                    )
                    .join('; ')}
                >
                  <ResponsiveContainer width='100%' height='100%'>
                    <BarChart
                      className='chart-motion'
                      data={summary.requirements}
                      layout='vertical'
                      margin={{ left: 0, right: 12, top: 12, bottom: 0 }}
                      accessibilityLayer
                    >
                      <CartesianGrid
                        horizontal={false}
                        stroke='var(--border)'
                        strokeDasharray='3 3'
                      />
                      <XAxis
                        type='number'
                        allowDecimals={false}
                        tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        type='category'
                        dataKey='name'
                        width={70}
                        tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        {...chartTooltipAnimation}
                        contentStyle={tooltip}
                        cursor={{ fill: 'var(--muted)', opacity: 0.3 }}
                      />
                      <Bar
                        dataKey='found'
                        name='Config found'
                        stackId='config'
                        fill='var(--chart-2)'
                        barSize={22}
                        {...chartAnimation}
                      />
                      <Bar
                        dataKey='unknown'
                        name='Unknown'
                        stackId='config'
                        fill='var(--neutral-mark)'
                        {...chartAnimation}
                      />
                      <Bar
                        dataKey='missing'
                        name='Not found'
                        stackId='config'
                        fill='var(--warning)'
                        radius={[0, 4, 4, 0]}
                        {...chartAnimation}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
