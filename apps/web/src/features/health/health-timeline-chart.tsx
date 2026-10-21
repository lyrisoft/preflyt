import { useState } from 'react'
import {
  CartesianGrid,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatusBadge } from '@/components/status-badge'
import type { HealthTimelinePoint } from './health-api'

const names = {
  all: 'All findings',
  security: 'Security',
  reliability: 'Reliability',
  maintainability: 'Maintainability',
}
const severityOrder = ['low', 'medium', 'high', 'critical', 'unknown'] as const
const colors: Record<string, string> = {
  critical: 'var(--severity-critical-mark)',
  high: 'var(--severity-high-mark)',
  medium: 'var(--warning)',
  low: 'var(--success)',
  unknown: 'var(--muted-foreground)',
}
const severityName = (key: string) => key.charAt(0).toUpperCase() + key.slice(1)
type Category = keyof typeof names
type Remediation = NonNullable<
  NonNullable<HealthTimelinePoint['categories']>['security']
>['remediation']
function remediationText(value: Remediation, locale?: string) {
  if (!value) return null
  switch (value.status) {
    case 'COMPARED':
      return `${value.remaining?.toLocaleString(locale)} scanner findings remaining · ${value.introduced?.toLocaleString(locale)} new · ${value.noLongerReported?.toLocaleString(locale)} no longer reported since ${value.previousSourceSha?.slice(0, 7)}`
    case 'PARTIAL':
      return 'Partial scan: fixes are unverified. Missing results do not count as fixes.'
    case 'SCOPE_CHANGED':
      return 'Scan coverage or configuration changed. This run starts a new comparison baseline; no fixes are credited.'
    case 'AI_REVIEW':
      return 'AI review findings are advisory. Changes in AI counts do not verify fixes.'
    case 'BASELINE':
      return 'First complete scan in the available comparison history. The next comparable complete run can show remediation.'
  }
}
const date = (at: string, locale?: string) =>
  new Date(at).toLocaleDateString(locale, { month: 'short', day: 'numeric' })
export function HealthTimelineChart({
  points,
  branch,
  onSelectReport,
  embedded = false,
  compact = false,
  locale,
  aiReview = false,
}: {
  embedded?: boolean
  compact?: boolean
  locale?: string
  aiReview?: boolean
  points: HealthTimelinePoint[]
  branch: string
  onSelectReport: (id: string) => void
}) {
  const [category, setCategory] = useState<Category>('security')
  const [window, setWindow] = useState('8')
  const modern = points.some((p) => p.categories)
  const selected: Category = modern ? category : 'all'
  const ordered = [...points].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id)
  )
  const available = ordered.flatMap((point) => {
    const value =
      selected === 'all'
        ? {
            findings: point.findings,
            partial: point.partial,
            comparisonKey: null,
          }
        : point.categories?.[selected]
    return value
      ? [
          {
            ...point,
            ...value,
            remediation: 'remediation' in value ? value.remediation : undefined,
            bySeverity:
              'bySeverity' in value && value.bySeverity
                ? value.bySeverity
                : { unknown: value.findings },
          },
        ]
      : []
  })
  const visible =
    window === 'all' ? available : available.slice(-Number(window))
  const data = visible.map((p, index) => ({ ...p, index }))
  const latest = data[data.length - 1]
  const partial = data.filter((p) => p.partial).length
  const Container = embedded ? 'div' : Card
  const label = (p: (typeof data)[number]) =>
    `Open scan ${new Date(p.at).toLocaleString(locale)}, ${p.findings.toLocaleString(locale)} findings, ${p.partial ? 'Partial scan' : 'Recorded results'}, commit ${p.sourceSha.slice(0, 7)}`
  return (
    <Container
      className='min-w-0 gap-0 overflow-hidden py-0'
      role='region'
      aria-label='Findings over time'
    >
      <CardContent className={compact ? 'p-0' : 'p-4'}>
        <div className='mb-5 flex flex-wrap items-center justify-between gap-3'>
          {modern ? (
            <Tabs
              value={category}
              onValueChange={(v) => setCategory(v as Category)}
              className='min-w-0'
            >
              <TabsList
                aria-label='Finding category'
                className='h-auto flex-wrap'
              >
                {(['security', 'reliability', 'maintainability'] as const).map(
                  (key) => (
                    <TabsTrigger className='text-xs' key={key} value={key}>
                      {names[key]}
                    </TabsTrigger>
                  )
                )}
              </TabsList>
            </Tabs>
          ) : (
            <h3 className='text-sm font-semibold'>
              {aiReview ? 'AI security findings' : 'Findings over time'}
            </h3>
          )}
          <Select value={window} onValueChange={setWindow}>
            <SelectTrigger
              className='h-8 w-36 text-xs'
              aria-label='History range'
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='8'>Last 8 scans</SelectItem>
              <SelectItem value='20'>Last 20 scans</SelectItem>
              <SelectItem value='all'>Available history</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {latest ? (
          <>
            <div className='mb-4 flex flex-wrap items-end justify-between gap-2'>
              <div>
                <div className='text-xs text-muted-foreground'>
                  {latest.partial ? 'Observed' : 'Remaining'}{' '}
                  {selected === 'all'
                    ? 'findings'
                    : names[selected].toLowerCase() + ' findings'}
                </div>
                <div className='mt-1 flex items-center gap-3'>
                  <strong className='text-3xl font-semibold tracking-tight tabular-nums'>
                    {latest.findings.toLocaleString(locale)}
                  </strong>
                  {latest.partial && (
                    <StatusBadge tone='warning'>Partial scan</StatusBadge>
                  )}
                </div>
              </div>
              <p className='text-xs text-muted-foreground'>
                {branch} · {date(latest.at, locale)}
              </p>
            </div>
            {remediationText(latest.remediation, locale) && (
              <div
                className='mb-4 space-y-1 text-xs'
                aria-label='Latest remediation'
              >
                <p>{remediationText(latest.remediation, locale)}</p>
                {latest.remediation?.status === 'COMPARED' && (
                  <p className='text-muted-foreground'>
                    Compared with the last complete scan using the same coverage
                    and configuration. AI counts and manual review decisions do
                    not count as scanner fixes.
                  </p>
                )}
              </div>
            )}
            <div
              className='w-full min-w-0 overflow-x-auto text-xs'
              role='group'
              aria-label={`${names[selected]} over ${data.length} scans. Finding counts: ${data.map((p) => p.findings).join(', ')}. Select a column to open its assessment.`}
            >
              <div
                className='h-60'
                style={{ minWidth: Math.max(250, data.length * 64) }}
              >
                <ResponsiveContainer width='100%' height='100%'>
                  <BarChart
                    data={data}
                    margin={{ top: 28, right: 16, bottom: 8, left: 0 }}
                    maxBarSize={48}
                    accessibilityLayer
                  >
                    <CartesianGrid
                      vertical={false}
                      stroke='var(--border)'
                      strokeDasharray='3 4'
                    />
                    <XAxis
                      dataKey='index'
                      type='category'
                      tickFormatter={(i) =>
                        data.length &&
                        date(data[0].at, locale) === date(latest.at, locale)
                          ? new Date(data[Number(i)].at).toLocaleTimeString(
                              locale,
                              { hour: '2-digit', minute: '2-digit' }
                            )
                          : date(data[Number(i)].at, locale)
                      }
                      interval='preserveStartEnd'
                      minTickGap={45}
                      tickLine={false}
                      axisLine={false}
                      tick={{
                        fill: 'var(--muted-foreground)',
                        fontSize: '0.75rem',
                      }}
                      dy={8}
                    />
                    <YAxis
                      width={42}
                      allowDecimals={false}
                      domain={[0, 'auto']}
                      tickLine={false}
                      axisLine={false}
                      tick={{
                        fill: 'var(--muted-foreground)',
                        fontSize: '0.75rem',
                      }}
                    />
                    <Tooltip
                      cursor={{ fill: 'var(--muted)', opacity: 0.3 }}
                      content={({ active, payload }) => {
                        const p = payload?.[0]?.payload as
                          typeof latest | undefined
                        return active && p ? (
                          <div className='rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md'>
                            <div className='font-medium'>
                              {p.findings.toLocaleString(locale)} findings
                            </div>
                            <div className='mt-1 text-muted-foreground'>
                              {new Date(p.at).toLocaleString(locale)}
                            </div>
                            <div className='my-2 space-y-1'>
                              {[...severityOrder]
                                .reverse()
                                .filter((key) => p.bySeverity[key] > 0)
                                .map((key) => (
                                  <div
                                    key={key}
                                    className='flex justify-between gap-6'
                                  >
                                    <span>{severityName(key)}</span>
                                    <span className='tabular-nums'>
                                      {p.bySeverity[key]}
                                    </span>
                                  </div>
                                ))}
                            </div>
                            <div className='mt-1'>
                              {p.partial ? 'Partial scan · ' : ''}
                              {p.sourceSha.slice(0, 7)}
                            </div>
                            <p className='mt-2 max-w-72 leading-relaxed'>
                              {remediationText(p.remediation, locale)}
                            </p>
                          </div>
                        ) : null
                      }}
                    />
                    <Bar
                      dataKey='findings'
                      name='Findings'
                      isAnimationActive={false}
                      shape={(props) => {
                        const {
                          x,
                          y,
                          width,
                          height,
                          payload: p,
                        } = props as {
                          x: number
                          y: number
                          width: number
                          height: number
                          payload: typeof latest
                        }
                        let bottom = y + height
                        return (
                          <g
                            role='button'
                            tabIndex={0}
                            aria-label={label(p)}
                            className='cursor-pointer focus-visible:outline-2 focus-visible:outline-ring'
                            onClick={() => onSelectReport(p.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                onSelectReport(p.id)
                              }
                            }}
                          >
                            <rect
                              x={x}
                              y={Math.min(y, y + height - 24)}
                              width={width}
                              height={Math.max(24, height)}
                              fill='transparent'
                            />
                            {severityOrder.map((key) => {
                              const count = p.bySeverity[key] ?? 0
                              const h = p.findings
                                ? (height * count) / p.findings
                                : 0
                              bottom -= h
                              return count > 0 ? (
                                <rect
                                  key={key}
                                  data-severity={key}
                                  x={x}
                                  y={bottom}
                                  width={width}
                                  height={h}
                                  fill={colors[key]}
                                  fillOpacity={p.partial ? 0.6 : 1}
                                />
                              ) : null
                            })}
                            {p.partial && (
                              <rect
                                x={x}
                                y={y}
                                width={width}
                                height={Math.max(2, height)}
                                fill='none'
                                stroke='var(--muted-foreground)'
                                strokeDasharray='3 3'
                                aria-hidden='true'
                              />
                            )}
                            <text
                              x={x + width / 2}
                              y={y - 10}
                              textAnchor='middle'
                              fill='var(--foreground)'
                              fontSize={12}
                              className='tabular-nums'
                            >
                              {p.findings.toLocaleString(locale)}
                            </text>
                          </g>
                        )
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            {partial > 0 && (
              <p className='mt-2 text-xs text-muted-foreground'>
                Dashed columns show partial results. A lower partial count may
                reflect missing analysis; it does not verify remediation.
              </p>
            )}
            <div className='mt-3 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground'>
              <span>{data.length} scans · Oldest to newest</span>
              <span>{partial > 0 ? `${partial} partial assessments` : ''}</span>
            </div>
            <div
              className='mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground'
              aria-label='Severity legend'
            >
              {[
                'critical',
                'high',
                'medium',
                'low',
                ...(data.some((p) => p.bySeverity.unknown > 0)
                  ? ['unknown']
                  : []),
              ].map((key) => (
                <span key={key} className='flex items-center gap-2'>
                  <span
                    aria-hidden='true'
                    className='size-2 rounded-sm'
                    style={{ backgroundColor: colors[key] }}
                  />
                  {severityName(key)}
                </span>
              ))}
            </div>
            <details className='mt-3 text-xs'>
              <summary className='w-fit cursor-pointer text-muted-foreground'>
                View chart data
              </summary>
              <ul className='mt-2 divide-y'>
                {data.map((p) => (
                  <li key={p.id}>
                    <button
                      type='button'
                      className='flex w-full flex-wrap justify-between gap-2 rounded px-2 py-2 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring'
                      aria-label={label(p)}
                      onClick={() => onSelectReport(p.id)}
                    >
                      <span>
                        {new Date(p.at).toLocaleString(locale)} ·{' '}
                        {p.sourceSha.slice(0, 7)}
                      </span>
                      <span>
                        {p.findings.toLocaleString(locale)} findings
                        {p.partial ? ' · Partial scan' : ''}
                        <span className='block text-muted-foreground'>
                          {[...severityOrder]
                            .reverse()
                            .filter((key) => p.bySeverity[key] > 0)
                            .map(
                              (key) =>
                                `${severityName(key)}: ${p.bySeverity[key]}`
                            )
                            .join(' · ')}
                        </span>
                        <span className='mt-1 block text-muted-foreground'>
                          {remediationText(p.remediation, locale)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          </>
        ) : (
          <div
            className='flex h-24 flex-col items-center justify-center text-center'
            role='img'
            aria-label='Findings over time unavailable. No recorded finding counts are available.'
          >
            <p className='text-sm font-medium'>No recorded results to chart</p>
            <p className='mt-2 text-xs text-muted-foreground'>
              {points.length
                ? `No ${names[selected].toLowerCase()} counts were saved for this branch.`
                : 'Run an assessment to add this branch’s first scan.'}
            </p>
          </div>
        )}
      </CardContent>
    </Container>
  )
}
