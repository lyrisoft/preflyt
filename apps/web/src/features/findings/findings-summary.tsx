import {
  AlertTriangle,
  FileWarning,
  FolderGit2,
  ShieldAlert,
} from 'lucide-react'
import {
  Bar,
  BarChart,
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export type FindingsSummary = {
  reportedIssues: number
  affectedRepositories: number
  criticalHigh: number
  evidenceGaps: number
  suppressed: number
  chartTotal: number
  bySeverity: { name: string; count: number }[]
  byCheck: { name: string; count: number }[]
}
const colors: Record<string, string> = {
  critical: 'var(--destructive)',
  high: 'var(--destructive)',
  medium: 'var(--warning)',
  low: 'var(--info)',
  unknown: 'var(--muted-foreground)',
}
const label = (name: string) => name[0].toUpperCase() + name.slice(1)
export function FindingsOverview({
  summary,
  kind,
  onSeverity,
}: {
  summary: FindingsSummary
  kind: string
  onSeverity: (severity: string) => void
}) {
  const entries = [
    {
      name: 'Reported issues',
      value: summary.reportedIssues,
      icon: ShieldAlert,
    },
    {
      name: 'Affected repositories',
      value: summary.affectedRepositories,
      icon: FolderGit2,
    },
    {
      name: 'Critical / high',
      value: summary.criticalHigh,
      icon: AlertTriangle,
    },
    { name: 'Evidence gaps', value: summary.evidenceGaps, icon: FileWarning },
  ]
  const subject = kind === 'gaps' ? 'Evidence gaps' : 'Issues'
  return (
    <section aria-label='Findings overview' className='space-y-5'>
      <dl className='grid grid-cols-2 gap-4 xl:grid-cols-4'>
        {entries.map(({ name, value, icon: Icon }) => (
          <Card key={name} className='gap-3 py-5'>
            <CardContent className='space-y-3 px-5'>
              <dt className='flex items-start justify-between gap-3 text-sm text-muted-foreground'>
                {name}
                <Icon aria-hidden='true' className='size-4 shrink-0' />
              </dt>
              <dd className='text-2xl font-semibold tracking-tight tabular-nums'>
                {value.toLocaleString()}
              </dd>
            </CardContent>
          </Card>
        ))}
      </dl>
      {summary.suppressed > 0 && (
        <p className='text-sm text-muted-foreground'>
          {summary.suppressed} source-suppressed entries excluded from metrics
          and charts.
        </p>
      )}
      <div className='grid items-stretch gap-5 xl:grid-cols-2'>
        <Card className='min-w-0 gap-4'>
          <CardHeader>
            <CardTitle asChild>
              <h2>{subject} by severity</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className='px-5'>
            {summary.chartTotal === 0 ? (
              <ChartEmpty />
            ) : (
              <div className='grid min-w-0 items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(120px,1fr)]'>
                <div aria-hidden='true' className='h-64 min-w-0'>
                  <ResponsiveContainer width='100%' height='100%'>
                    <PieChart>
                      <Pie
                        data={summary.bySeverity.filter(
                          (item) => item.count > 0
                        )}
                        dataKey='count'
                        nameKey='name'
                        innerRadius='62%'
                        outerRadius='85%'
                        stroke='var(--card)'
                        strokeWidth={3}
                        {...chartAnimation}
                      >
                        {summary.bySeverity
                          .filter((item) => item.count > 0)
                          .map((item) => (
                            <Cell key={item.name} fill={colors[item.name]} />
                          ))}
                      </Pie>
                      <Tooltip
                        {...chartTooltipAnimation}
                        formatter={(value, name) => [
                          value,
                          label(String(name)),
                        ]}
                        contentStyle={{
                          background: 'var(--popover)',
                          borderColor: 'var(--border)',
                          borderRadius: 8,
                          color: 'var(--popover-foreground)',
                        }}
                      />
                      <text
                        x='50%'
                        y='50%'
                        textAnchor='middle'
                        dominantBaseline='middle'
                        fill='var(--foreground)'
                        className='text-2xl font-semibold'
                      >
                        {summary.chartTotal}
                      </text>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul aria-label='Severity counts' className='space-y-1'>
                  {summary.bySeverity.map((item) => (
                    <li key={item.name}>
                      <Button
                        variant='ghost'
                        size='sm'
                        className='w-full justify-between gap-3 px-2'
                        onClick={() => onSeverity(item.name)}
                        aria-label={`Filter ${label(item.name)}: ${item.count}`}
                      >
                        <span className='flex items-center gap-2'>
                          <span
                            aria-hidden='true'
                            className='size-2 rounded-full'
                            style={{ background: colors[item.name] }}
                          />
                          {label(item.name)}
                        </span>
                        <span className='tabular-nums'>{item.count}</span>
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className='min-w-0 gap-4'>
          <CardHeader>
            <CardTitle asChild>
              <h2>{subject} by check</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className='px-5'>
            {summary.chartTotal === 0 ? (
              <ChartEmpty />
            ) : (
              <>
                <div aria-hidden='true' className='h-64 min-w-0'>
                  <ResponsiveContainer width='100%' height='100%'>
                    <BarChart
                      data={summary.byCheck}
                      layout='vertical'
                      margin={{ top: 0, right: 12, bottom: 0, left: 0 }}
                    >
                      <XAxis
                        type='number'
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        type='category'
                        dataKey='name'
                        width={125}
                        tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                        tickFormatter={(value: string) =>
                          value.length > 19 ? `${value.slice(0, 18)}…` : value
                        }
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        {...chartTooltipAnimation}
                        cursor={{ fill: 'var(--muted)' }}
                        formatter={(value) => [value, 'Entries']}
                        contentStyle={{
                          background: 'var(--popover)',
                          borderColor: 'var(--border)',
                          borderRadius: 8,
                          color: 'var(--popover-foreground)',
                        }}
                      />
                      <Bar
                        dataKey='count'
                        fill='var(--chart-1)'
                        radius={[0, 4, 4, 0]}
                        maxBarSize={20}
                        {...chartAnimation}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <table className='sr-only'>
                  <caption>{subject} by check</caption>
                  <thead>
                    <tr>
                      <th>Check</th>
                      <th>Entries</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.byCheck.map((item) => (
                      <tr key={item.name}>
                        <th>{item.name}</th>
                        <td>{item.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
function ChartEmpty() {
  return (
    <div className='flex h-32 items-center justify-center text-sm text-muted-foreground'>
      No matching entries to chart
    </div>
  )
}
