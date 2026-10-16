import { useState } from 'react'
import { Activity } from 'lucide-react'
import {
  Bar,
  Cell,
  Line,
  ComposedChart,
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
import { Table } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
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
  // Recharts forwards `id` from data onto SVG marks. Reports can appear in
  // multiple charts on a page, so keep their identifiers out of DOM IDs.
  const data = points.map(({ id, ...point }) => ({
    ...point,
    reportId: id,
    timestamp: new Date(point.at).getTime(),
  }))
  const scope = points.find((point) => point.checkIds?.length)?.checkIds
  const partialCount = points.filter((point) => point.partial).length
  const comparisonCount = points.filter(
    (point) => point.comparableFindings !== null
  ).length
  const scopeNames: Record<string, string> = {
    'security.sast': 'Static security',
    'quality.reliability': 'Reliability',
    'quality.maintainability': 'Maintainability',
    'security.hotspots': 'Security hotspots',
  }
  const timestamps = data.map((point) => point.timestamp)
  const firstTime = data.length ? Math.min(...timestamps) : 0
  const lastTime = data.length ? Math.max(...timestamps) : 0
  const hour = 3600000
  const range = Math.max(24 * hour, (lastTime - firstTime) * 1.3)
  const center = (firstTime + lastTime) / 2
  const step =
    [
      hour,
      4 * hour,
      6 * hour,
      12 * hour,
      24 * hour,
      7 * 24 * hour,
      30 * 24 * hour,
      90 * 24 * hour,
      365 * 24 * hour,
    ].find((value) => value >= range / 6) ?? Math.ceil(range / 6)
  const startTime = Math.floor((center - range / 2) / step) * step
  const endTime = Math.ceil((center + range / 2) / step) * step
  const ticks = Array.from(
    { length: Math.round((endTime - startTime) / step) + 1 },
    (_, index) => startTime + index * step
  )
  const [chartWidth, setChartWidth] = useState(0)
  const uniqueTimes = [...new Set(timestamps)].sort((a, b) => a - b)
  const gaps = uniqueTimes
    .slice(1)
    .map((time, index) => time - uniqueTimes[index])
  const barWidth =
    gaps.length && chartWidth
      ? Math.min(
          28,
          Math.max(
            1,
            (((chartWidth - 80) * Math.min(...gaps)) / (endTime - startTime)) *
              0.7
          )
        )
      : 28
  const formatTick = (value: number) =>
    step >= 86400000
      ? utcDate(value, locale)
      : `${utcDate(value, locale)} ${utcTime(value, locale)}`
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
                {branch} · saved assessments · UTC
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      )}
      <CardContent className={compact ? 'p-0' : embedded ? 'p-4' : 'px-5 pb-5'}>
        {!!partialCount && (
          <div className='mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
            <StatusBadge tone='warning'>Partial analysis</StatusBadge>
            <span>
              {partialCount} of {points.length} scans have incomplete coverage.
              Counts may increase when analysis completes.
            </span>
          </div>
        )}
        {scope?.length && (
          <p className='mb-3 text-xs text-muted-foreground'>
            Compared rule packs:{' '}
            {scope.map((id) => scopeNames[id] ?? id).join(', ')}. Comparison
            line only; bars include all retained findings.
          </p>
        )}
        {embedded && <h3 className='sr-only'>Findings over time</h3>}
        <div
          className={`relative min-w-0 ${data.length ? (compact ? 'h-36' : 'h-48 sm:h-52') : 'h-24'}`}
          role='img'
          aria-label={
            data.length
              ? `${data.length} assessments, ${partialCount} partial. Retained finding counts in chronological order: ${data.map((p) => p.findings).join(', ')}. Exact revisions and coverage are in View chart data.`
              : 'Findings over time unavailable. No recorded finding counts are available.'
          }
        >
          {!!data.length && (
            <ResponsiveContainer
              width='100%'
              height='100%'
              onResize={setChartWidth}
            >
              <ComposedChart
                className='chart-motion'
                data={data}
                margin={{ top: 12, right: 12, left: -18, bottom: 4 }}
                accessibilityLayer
              >
                <CartesianGrid vertical={false} stroke='var(--border)' />
                <XAxis
                  padding={{ left: 16, right: 16 }}
                  type='number'
                  scale='time'
                  dataKey='timestamp'
                  domain={[startTime, endTime]}
                  ticks={ticks}
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
                      (typeof data)[number] | undefined
                    return point
                      ? `${new Date(point.at).toLocaleString(locale, { timeZone: 'UTC' })} UTC · ${point.sourceSha.slice(0, 7)} · ${point.partial ? 'Partial analysis' : 'Complete analysis'}`
                      : ''
                  }}
                  cursor={{ stroke: 'var(--chart-1)', strokeDasharray: '4 4' }}
                />
                <Bar
                  dataKey='findings'
                  name='Retained findings'
                  maxBarSize={barWidth}
                  radius={[3, 3, 0, 0]}
                  minPointSize={2}
                  {...chartAnimation}
                >
                  {data.map((point) => (
                    <Cell
                      key={point.reportId}
                      fill={point.partial ? 'var(--warning)' : 'var(--chart-1)'}
                    />
                  ))}
                </Bar>
                {comparisonCount > 1 && (
                  <Line
                    type='linear'
                    dataKey='comparableFindings'
                    name='Equivalent coverage'
                    stroke='var(--chart-1)'
                    strokeWidth={2}
                    connectNulls={false}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                    {...chartAnimation}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          )}
          {!data.length && (
            <div className='pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center'>
              <p className='text-sm font-medium'>
                Analysis history unavailable
              </p>
              <p className='mt-2 max-w-md text-xs leading-relaxed text-muted-foreground'>
                Run an assessment to see available findings here. Partial
                results will be shown as soon as a report is saved.
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
              Retained findings
            </span>
            <span>
              Each bar is a saved scan. The line compares only equivalent
              coverage.
            </span>
          </div>
        )}
        {!!data.length && (
          <details className='mt-3 text-xs'>
            <summary className='w-fit cursor-pointer rounded-sm text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring'>
              View chart data
            </summary>
            <div className='mt-3 max-h-44 overflow-auto rounded-lg border'>
              <Table className='w-full text-left'>
                <caption className='sr-only'>
                  Available health assessment counts and coverage in UTC
                </caption>
                <thead>
                  <tr className='border-b bg-muted/30'>
                    <th className='px-3 py-2'>Assessed (UTC)</th>
                    <th className='px-3 py-2'>Commit</th>
                    <th className='px-3 py-2'>Coverage</th>
                    <th className='px-3 py-2 text-right'>Retained findings</th>
                    <th className='px-3 py-2 text-right'>
                      Comparable findings
                    </th>
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
                      <td className='px-3 py-2 whitespace-nowrap'>
                        {point.partial ? (
                          <StatusBadge tone='warning'>
                            Partial analysis
                          </StatusBadge>
                        ) : (
                          'Complete analysis'
                        )}
                      </td>
                      <td className='px-3 py-2 text-right tabular-nums'>
                        {point.findings}
                      </td>
                      <td className='px-3 py-2 text-right tabular-nums'>
                        {point.comparableFindings ?? '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </details>
        )}
      </CardContent>
    </Container>
  )
}
