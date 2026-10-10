import { useId, useState } from 'react'
import { Activity, BarChart3, CalendarDays, TrendingUp } from 'lucide-react'
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
import type { ActivityDay } from '../dashboard/activity-calendar'
import { activityTrend } from './activity-trend-model'

const labelDate = (date: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))

export function ActivityTrendChart({
  from,
  to,
  activity,
  days,
  onDays,
}: {
  from: string
  to: string
  activity: ActivityDay[]
  days: string
  onDays: (days: string) => void
}) {
  const [granularity, setGranularity] = useState<'day' | 'week'>('day')
  const gradientId = `activity-${useId().replace(/:/g, '')}`
  const summary = activityTrend(from, to, activity, granularity)
  return (
    <Card className='min-w-0 gap-4 overflow-hidden'>
      <CardHeader className='flex flex-wrap items-start justify-between gap-4 sm:flex-row'>
        <div className='flex gap-3'>
          <span className='flex size-10 shrink-0 items-center justify-center rounded-xl bg-chart-1/10 text-chart-1'>
            <TrendingUp className='size-5' aria-hidden='true' />
          </span>
          <div>
            <CardTitle className='text-base'>Assessment activity</CardTitle>
            <CardDescription className='mt-1'>
              Saved assessments · {labelDate(from)}–{labelDate(to)} · UTC
            </CardDescription>
          </div>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <div
            className='flex rounded-lg border bg-muted/30 p-1'
            aria-label='Chart grouping'
          >
            {(['day', 'week'] as const).map((value) => (
              <Button
                key={value}
                type='button'
                size='sm'
                variant={granularity === value ? 'secondary' : 'ghost'}
                className='h-7 px-3 text-xs'
                aria-pressed={granularity === value}
                onClick={() => setGranularity(value)}
              >
                {value === 'day' ? 'Daily' : 'Weekly'}
              </Button>
            ))}
          </div>
          <Select value={days} onValueChange={onDays}>
            <SelectTrigger className='w-32' aria-label='Activity period'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='7'>Last 7 days</SelectItem>
              <SelectItem value='30'>Last 30 days</SelectItem>
              <SelectItem value='90'>Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className='mb-5 flex flex-wrap gap-x-8 gap-y-3 border-b pb-4'>
          {[
            {
              label: 'Snapshots',
              value: summary.total,
              icon: Activity,
              color: 'text-chart-1',
            },
            {
              label: 'Active days',
              value: summary.activeDays,
              icon: CalendarDays,
              color: 'text-chart-2',
            },
            {
              label: 'Peak in one day',
              value: summary.peak,
              icon: BarChart3,
              color: 'text-chart-4',
            },
          ].map((stat) => (
            <div key={stat.label} className='flex items-center gap-2'>
              <stat.icon
                className={`size-4 ${stat.color}`}
                aria-hidden='true'
              />
              <span className='text-lg font-semibold tabular-nums'>
                {stat.value.toLocaleString()}
              </span>
              <span className='text-xs text-muted-foreground'>
                {stat.label}
              </span>
            </div>
          ))}
        </div>
        <div
          className='relative h-56 min-w-0'
          role='img'
          aria-label={`${summary.total} assessments over ${days} days; ${summary.activeDays} days with activity. Peak daily volume ${summary.peak}. Exact counts are in the chart data table below.`}
        >
          <ResponsiveContainer width='100%' height='100%'>
            <AreaChart
              className='chart-motion'
              data={summary.points}
              margin={{ top: 10, right: 12, left: -20, bottom: 0 }}
              accessibilityLayer
            >
              <defs>
                <linearGradient id={gradientId} x1='0' y1='0' x2='0' y2='1'>
                  <stop
                    offset='0%'
                    stopColor='var(--chart-1)'
                    stopOpacity={0.3}
                  />
                  <stop
                    offset='95%'
                    stopColor='var(--chart-1)'
                    stopOpacity={0.015}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                vertical={false}
                stroke='var(--border)'
                strokeDasharray='3 4'
              />
              <XAxis
                dataKey='date'
                tickFormatter={labelDate}
                minTickGap={35}
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                tickMargin={12}
              />
              <YAxis
                allowDecimals={false}
                domain={[0, 'auto']}
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              />
              <Tooltip
                {...chartTooltipAnimation}
                contentStyle={{
                  background: 'var(--popover)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  color: 'var(--popover-foreground)',
                  fontSize: 12,
                }}
                labelStyle={{ color: 'var(--foreground)' }}
                labelFormatter={(label, payload) => {
                  const point = payload?.[0]?.payload as
                    { date?: string; through?: string } | undefined
                  return point?.date && point?.through
                    ? point.date === point.through
                      ? labelDate(point.date)
                      : `${labelDate(point.date)}–${labelDate(point.through)}`
                    : String(label)
                }}
                cursor={{ stroke: 'var(--chart-1)', strokeDasharray: '4 4' }}
              />
              <Area
                type='linear'
                dataKey='count'
                name='Snapshots'
                stroke='var(--chart-1)'
                strokeWidth={2.5}
                fill={`url(#${gradientId})`}
                dot={
                  summary.points.length <= 7
                    ? { r: 3, fill: 'var(--chart-1)', strokeWidth: 0 }
                    : false
                }
                activeDot={{ r: 5, stroke: 'var(--card)', strokeWidth: 2 }}
                {...chartAnimation}
              />
            </AreaChart>
          </ResponsiveContainer>
          {summary.total === 0 && (
            <div className='pointer-events-none absolute inset-x-12 top-12 text-center'>
              <p className='text-sm font-medium'>No assessment activity yet</p>
              <p className='mt-1 text-xs text-muted-foreground'>
                New assessments will appear here when they are saved.
              </p>
            </div>
          )}
        </div>
        <div className='mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground'>
          <span className='inline-flex items-center gap-2'>
            <span className='size-2 rounded-full bg-chart-1' />
            {granularity === 'day' ? 'Daily' : 'Weekly'} assessment count
          </span>
          <span>Activity volume does not indicate merge review results.</span>
        </div>
        <details className='mt-3 text-xs text-muted-foreground'>
          <summary className='w-fit cursor-pointer rounded-sm outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring'>
            View chart data
          </summary>
          <div className='mt-2 max-h-40 overflow-auto rounded-lg border'>
            <table className='w-full text-start'>
              <caption className='sr-only'>
                Saved assessment counts in UTC
              </caption>
              <thead>
                <tr className='border-b bg-muted/30'>
                  <th className='px-3 py-2 text-start'>Period</th>
                  <th className='px-3 py-2 text-end'>Snapshots</th>
                </tr>
              </thead>
              <tbody>
                {summary.points.map((point) => (
                  <tr key={point.date} className='border-b last:border-0'>
                    <td className='px-3 py-1.5'>
                      {point.date}
                      {point.date !== point.through ? `–${point.through}` : ''}
                    </td>
                    <td className='px-3 py-1.5 text-end tabular-nums'>
                      {point.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </CardContent>
    </Card>
  )
}
