import { Link } from '@tanstack/react-router'
import { Activity, ArrowRight, GitBranch, Workflow } from 'lucide-react'
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
import { ciResultOrder, summarizeCiActivity } from './ci-activity-model'
import type { CiObservation } from './repository-queries'
import { ciResultStatus, type CiResult } from './repository-vocabulary'

const colors: Record<CiResult, string> = {
  SUCCEEDED: 'var(--success)',
  FAILED: 'var(--danger)',
  PENDING: 'var(--info)',
  NOT_EXECUTED: 'var(--neutral-mark)',
  UNKNOWN: 'var(--muted-foreground)',
}

export function CiActivityCharts({
  observations,
}: {
  observations: CiObservation[]
}) {
  const summary = summarizeCiActivity(observations)
  const resultData = ciResultOrder
    .filter((result) => summary.results[result] > 0)
    .map((result) => ({
      key: result,
      name: ciResultStatus[result].label,
      value: summary.results[result],
      color: colors[result],
    }))
  return (
    <div className='mx-6 grid overflow-hidden rounded-xl border bg-muted/10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]'>
      <section className='p-5 lg:border-e'>
        <div className='mb-4 flex items-center justify-between gap-3'>
          <h3 className='text-sm font-semibold'>Provider results</h3>
          <span className='text-xs text-muted-foreground'>
            Latest {observations.length} deliveries
          </span>
        </div>
        <div className='flex flex-wrap items-center justify-center gap-6 sm:flex-nowrap sm:justify-start'>
          <div
            className='relative h-44 w-full max-w-44 shrink-0'
            role='img'
            aria-label={ciResultOrder
              .map(
                (result) =>
                  `${summary.results[result]} ${ciResultStatus[result].label.toLowerCase()}`
              )
              .join(', ')}
          >
            <ResponsiveContainer width='100%' height='100%'>
              <PieChart className='chart-motion' accessibilityLayer>
                <Pie
                  data={resultData}
                  dataKey='value'
                  nameKey='name'
                  innerRadius='62%'
                  outerRadius='90%'
                  startAngle={90}
                  endAngle={-270}
                  paddingAngle={resultData.length > 1 ? 3 : 0}
                  cornerRadius={4}
                  stroke='var(--card)'
                  strokeWidth={2}
                  {...chartAnimation}
                >
                  {resultData.map((result) => (
                    <Cell key={result.key} fill={result.color} />
                  ))}
                </Pie>
                <Tooltip
                  {...chartTooltipAnimation}
                  formatter={(value, name) => [
                    `${value} results · ${observations.length ? Math.round((Number(value) / observations.length) * 100) : 0}%`,
                    name,
                  ]}
                  contentStyle={{
                    background: 'var(--popover)',
                    borderColor: 'var(--border)',
                    borderRadius: 10,
                    fontSize: 12,
                    color: 'var(--foreground)',
                  }}
                  itemStyle={{ color: 'var(--foreground)' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className='pointer-events-none absolute inset-0 flex flex-col items-center justify-center'>
              <span className='text-3xl font-semibold tracking-tight tabular-nums'>
                {observations.length}
              </span>
              <span className='text-[11px] text-muted-foreground'>
                Results received
              </span>
            </div>
          </div>
          <ul className='grid flex-1 gap-2 text-xs'>
            {ciResultOrder.map((result) => (
              <li
                key={result}
                className='flex items-center justify-between gap-6'
              >
                <span className='flex items-center gap-2 text-muted-foreground'>
                  <span
                    className='size-2 rounded-full'
                    style={{ background: colors[result] }}
                    aria-hidden='true'
                  />
                  {ciResultStatus[result].label}
                </span>
                <span className='font-semibold tabular-nums'>
                  {summary.results[result]}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className='mt-4 flex items-center gap-5 border-t pt-3 text-xs text-muted-foreground'>
          <span className='flex items-center gap-1.5'>
            <GitBranch className='size-3.5' />
            <strong className='font-semibold text-foreground tabular-nums'>
              {summary.commits}
            </strong>{' '}
            commits
          </span>
          <span>
            <strong className='font-semibold text-foreground tabular-nums'>
              {summary.reports}
            </strong>{' '}
            reports received
          </span>
        </div>
      </section>
      <section className='min-w-0 border-t p-5 lg:border-t-0'>
        <div className='mb-3 flex items-center justify-between gap-3'>
          <h3 className='text-sm font-semibold'>Delivery activity</h3>
          <span className='text-xs text-muted-foreground'>Daily · UTC</span>
        </div>
        <div
          className='h-40'
          role='img'
          aria-label={`Daily counts in the returned results: ${summary.days.map((day) => `${day.day}: ${ciResultOrder.reduce((total, result) => total + day[result], 0)}`).join('; ')}`}
        >
          <ResponsiveContainer width='100%' height='100%'>
            <BarChart
              className='chart-motion'
              data={summary.days}
              margin={{ top: 5, right: 0, left: -25, bottom: 0 }}
              accessibilityLayer
            >
              <CartesianGrid
                vertical={false}
                stroke='var(--border)'
                strokeDasharray='3 3'
              />
              <XAxis
                dataKey='day'
                tickFormatter={(day: string) =>
                  new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    timeZone: 'UTC',
                  })
                }
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                minTickGap={22}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
              />
              <Tooltip
                {...chartTooltipAnimation}
                cursor={{ fill: 'var(--muted)', opacity: 0.3 }}
                contentStyle={{
                  background: 'var(--popover)',
                  borderColor: 'var(--border)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: 'var(--foreground)' }}
              />
              {ciResultOrder.map((result) => (
                <Bar
                  key={result}
                  dataKey={result}
                  name={ciResultStatus[result].label}
                  stackId='results'
                  fill={colors[result]}
                  maxBarSize={28}
                  {...chartAnimation}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className='mt-2 text-[11px] text-muted-foreground'>
          Up to 14 days of the latest 50 deliveries. Provider results are not
          verified merge review results.
        </p>
      </section>
    </div>
  )
}

export function CiActivityEmpty({
  enabled,
  filtered,
  canConfigure,
  showIntegrationLink = true,
}: {
  enabled: boolean
  filtered: boolean
  canConfigure: boolean
  showIntegrationLink?: boolean
}) {
  return (
    <div className='mx-6 overflow-hidden rounded-xl border bg-muted/10'>
      <div className='flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center'>
        <span className='flex size-12 shrink-0 items-center justify-center rounded-xl border bg-background text-info'>
          <Activity className='size-6' />
        </span>
        <div className='flex-1'>
          <h3 className='text-sm font-semibold'>
            {filtered
              ? 'No results at this revision'
              : enabled
                ? 'Ready for the first CI result'
                : 'Connect repository activity'}
          </h3>
          <p className='mt-1 max-w-xl text-sm text-muted-foreground'>
            {filtered
              ? 'Clear the commit filter to see other received results.'
              : enabled
                ? 'New signed check and workflow events will populate this view after processing.'
                : 'Enable signed GitHub webhooks and the event worker to collect CI results.'}
          </p>
        </div>
        {!enabled && !filtered && canConfigure && showIntegrationLink && (
          <Button asChild variant='outline' size='sm'>
            <Link to='/integrations'>
              Integration settings
              <ArrowRight className='size-3.5' />
            </Link>
          </Button>
        )}
      </div>
      {!filtered && (
        <ol className='grid gap-4 border-t bg-background/40 px-6 py-4 text-xs sm:grid-cols-3'>
          {[
            'Connect signed webhooks',
            'Receive a check or workflow',
            'Review results and reports',
          ].map((step, index) => (
            <li
              key={step}
              className='flex items-center gap-2 text-muted-foreground'
            >
              <span className='flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium'>
                {index + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      )}
      <div className='flex items-center gap-2 border-t px-6 py-3 text-[11px] text-muted-foreground'>
        <Workflow className='size-3.5' />
        {filtered
          ? 'No CI results recorded for this revision.'
          : 'No CI results recorded for this repository yet.'}
      </div>
    </div>
  )
}
