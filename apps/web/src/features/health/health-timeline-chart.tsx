import { useId } from 'react'
import { Activity } from 'lucide-react'
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { SurfaceIcon } from '@/components/surface-icon'
import type { HealthTimelinePoint } from './health-api'

const utcDate = (value: number, locale?: string) =>
  new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value))
const utcTime = (value: number, locale?: string) =>
  new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(new Date(value))

export function HealthTimelineChart({
  points,
  branch,
  onSelectReport,
  embedded = false,
  compact = false,
  locale,
}: {
  embedded?: boolean
  compact?: boolean
  locale?: string
  points: HealthTimelinePoint[]
  branch: string
  onSelectReport: (id: string) => void
}) {
  const gradientId = `health-trend-${useId().replace(/:/g, '')}`
  const data = points.map((point) => ({
    ...point,
    timestamp: new Date(point.at).getTime(),
  }))
  const scope = points[0]?.checkIds
  const scopeNames: Record<string,string> = {
    'security.sast':'Static security', 'quality.reliability':'Reliability',
    'quality.maintainability':'Maintainability', 'security.hotspots':'Security hotspots',
  }
  const span =
    data.length > 1 ? data[data.length - 1].timestamp - data[0].timestamp : 0
  const formatTick = (value: number) => span >= 86400000 ? utcDate(value, locale) : utcTime(value, locale)
  const Container = embedded ? 'div' : Card
  return (
    <Container
      className='min-w-0 gap-0 overflow-hidden py-0'
      role='region'
      aria-label='Findings over time'
    >
      {!embedded && (
        <CardHeader className='p-5 pb-4'>
          <div className='flex items-center gap-3'>
            <SurfaceIcon icon={Activity} tone='violet' />
            <div>
              <CardTitle>Findings over time</CardTitle>
              <CardDescription className='mt-1'>
                {branch} · comparable assessments · UTC
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      )}
      <CardContent className={compact ? 'p-0' : embedded ? 'p-4' : 'px-5 pb-5'}>
        {scope?.length && <p className='mb-3 text-xs text-muted-foreground'>
          Compared rule packs: {scope.map(id=>scopeNames[id] ?? id).join(', ')}. Other analyses are excluded.
        </p>}
        {embedded && <h3 className='sr-only'>Findings over time</h3>}
        <div
          className={`relative min-w-0 ${data.length ? compact ? 'h-36' : 'h-48 sm:h-52' : 'h-24'}`}
          role='img'
          aria-label={
            data.length
              ? `${data.length} comparable assessments. Finding counts in chronological order: ${data.map((p) => p.findings).join(', ')}. Exact revisions are in View chart data.`
              : 'Findings over time unavailable. No comparable complete analysis is available.'
          }
        >
          {!!data.length && (
            <ResponsiveContainer width='100%' height='100%'>
              <AreaChart
                className='chart-motion'
                data={data}
                margin={{ top: 12, right: 12, left: -18, bottom: 4 }}
                accessibilityLayer
              >
                <defs>
                  <linearGradient id={gradientId} x1='0' y1='0' x2='0' y2='1'>
                    <stop
                      offset='0%'
                      stopColor='var(--chart-1)'
                      stopOpacity={0.28}
                    />
                    <stop
                      offset='100%'
                      stopColor='var(--chart-1)'
                      stopOpacity={0.035}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke='var(--border)' />
                <XAxis
                  type='number'
                  scale='time'
                  dataKey='timestamp'
                  domain={
                    data.length === 1
                      ? [data[0].timestamp - 60000, data[0].timestamp + 60000]
                      : ['dataMin', 'dataMax']
                  }
                  tickFormatter={formatTick}
                  tick={
                    data.length
                      ? { fill: 'var(--muted-foreground)', fontSize: 11 }
                      : false
                  }
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border)' }}
                  minTickGap={40}
                  tickMargin={12}
                />
                <YAxis
                  allowDecimals={false}
                  domain={[0, 'auto']}
                  tick={
                    data.length
                      ? { fill: 'var(--muted-foreground)', fontSize: 11 }
                      : false
                  }
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  {...chartTooltipAnimation}
                  contentStyle={{
                    background: 'var(--popover)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    color: 'var(--popover-foreground)',
                    fontSize: 12,
                  }}
                  labelFormatter={(_, payload) => {
                    const point = payload?.[0]?.payload as
                      HealthTimelinePoint | undefined
                    return point
                      ? `${new Date(point.at).toLocaleString(locale, { timeZone: 'UTC' })} UTC · ${point.sourceSha.slice(0, 7)}`
                      : ''
                  }}
                  cursor={{ stroke: 'var(--chart-1)', strokeDasharray: '4 4' }}
                />
                <Area
                  type='monotone'
                  dataKey='findings'
                  name='Reported findings'
                  stroke='var(--chart-1)'
                  strokeWidth={2.5}
                  fill={`url(#${gradientId})`}
                  dot={
                    data.length <= 7
                      ? { r: 3, fill: 'var(--chart-1)', strokeWidth: 0 }
                      : false
                  }
                  activeDot={{ r: 5, stroke: 'var(--card)', strokeWidth: 2 }}
                  {...chartAnimation}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
          {!data.length && (
            <div className='pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center'>
              <p className='text-sm font-medium'>
                Analysis history unavailable
              </p>
              <p className='mt-2 max-w-md text-xs leading-relaxed text-muted-foreground'>
                Complete analysis is needed to plot findings. Future comparable
                assessments will show changes here.
              </p>
            </div>
          )}
        </div>
        {!compact && (
        <div className='mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs text-muted-foreground'>
          <span className='inline-flex items-center gap-2'>
            <span
              className='size-2 rounded-full bg-chart-1'
              aria-hidden='true'
            />
            Reported findings
          </span>
          <span>
            Latest 30 branch reports · incomplete finding sets and incompatible scopes are excluded
          </span>
        </div>
        )}
        {!!data.length && (
          <details className='mt-3 text-xs'>
            <summary className='w-fit cursor-pointer rounded-sm text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring'>
              View chart data
            </summary>
            <div className='mt-3 max-h-44 overflow-auto rounded-lg border'>
              <table className='w-full text-left'>
                <caption className='sr-only'>
                  Comparable complete health assessment counts in UTC
                </caption>
                <thead>
                  <tr className='border-b bg-muted/30'>
                    <th className='px-3 py-2'>Assessed (UTC)</th>
                    <th className='px-3 py-2'>Commit</th>
                    <th className='px-3 py-2 text-right'>Findings</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((point) => (
                    <tr key={point.id} className='border-b last:border-0'>
                      <td className='px-3 py-2'>
                        {new Date(point.at).toLocaleString(locale, {
                          timeZone: 'UTC',
                        })}
                      </td>
                      <td className='px-3 py-2'>
                        <button
                          type='button'
                          className='rounded-sm font-mono hover:underline focus-visible:outline-2 focus-visible:outline-ring'
                          aria-label={`Open health report ${point.sourceSha.slice(0, 7)}`}
                          onClick={() => onSelectReport(point.id)}
                        >
                          {point.sourceSha.slice(0, 7)}
                        </button>
                      </td>
                      <td className='px-3 py-2 text-right tabular-nums'>
                        {point.findings}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </CardContent>
    </Container>
  )
}
