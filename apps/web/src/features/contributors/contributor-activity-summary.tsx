import {
  GitPullRequest,
  GitBranch,
  UsersRound,
  GitCommitHorizontal,
} from 'lucide-react'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export type ContributionDay = {
  date: string
  authoredPrs: number
  mergedPrs: number
  reviews: number
  commits: number
}
export function ContributorActivitySummary({
  series,
  metrics,
  allowed,
}: {
  series: ContributionDay[]
  metrics: {
    authoredPrs: number | null
    mergedPrs: number | null
    reviews: number | null
    commits: number | null
  }
  allowed: boolean
}) {
  const definitions = [
    {
      key: 'authoredPrs' as const,
      label: 'Authored PRs',
      icon: GitPullRequest,
    },
    { key: 'mergedPrs' as const, label: 'Merged PRs', icon: GitBranch },
    { key: 'reviews' as const, label: 'Recorded reviews', icon: UsersRound },
    {
      key: 'commits' as const,
      label: 'Attributed commits',
      icon: GitCommitHorizontal,
    },
  ]
  return (
    <Card className='h-full min-w-0 gap-3'>
      <CardHeader>
        <CardTitle>Contribution activity</CardTitle>
      </CardHeader>
      <CardContent className='flex flex-1 flex-col gap-4'>
        {allowed &&
        series.some((day) => definitions.some((d) => day[d.key] > 0)) ? (
          <>
            <div
              className='chart-motion h-44 min-h-44 flex-1'
              role='img'
              aria-label='Daily authored PRs, merged PRs, recorded reviews and attributed commits'
            >
              <ResponsiveContainer width='100%' height='100%'>
                <AreaChart
                  data={series}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} stroke='var(--border)' />
                  <XAxis
                    dataKey='date'
                    tickFormatter={(s) => String(s).slice(5)}
                    tick={{ fontSize: 10 }}
                    minTickGap={28}
                  />
                  <YAxis
                    allowDecimals={false}
                    width={28}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip {...chartTooltipAnimation} />
                  {definitions.map((d, i) => (
                    <Area
                      {...chartAnimation}
                      key={d.key}
                      name={d.label}
                      dataKey={d.key}
                      type='linear'
                      stroke={`var(--chart-${i + 1})`}
                      fill={`var(--chart-${i + 1})`}
                      fillOpacity={0.06}
                      strokeWidth={2}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className='flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground'>
              {definitions.map((d, i) => (
                <span key={d.key} className='inline-flex items-center gap-1.5'>
                  <span
                    className='size-2 rounded-full'
                    style={{ backgroundColor: `var(--chart-${i + 1})` }}
                  />
                  {d.label}
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className='flex h-44 items-center justify-center text-sm text-muted-foreground'>
            {allowed
              ? 'No recorded activity in this period.'
              : 'Activity permission is required.'}
          </p>
        )}
        <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
          {definitions.map((d, i) => (
            <div key={d.key} className='rounded-lg border bg-muted/15 p-3'>
              <div className='flex items-center justify-between gap-2'>
                <span className='text-xs text-muted-foreground'>{d.label}</span>
                <d.icon
                  className='size-3.5 shrink-0'
                  style={{ color: `var(--chart-${i + 1})` }}
                />
              </div>
              <p className='mt-2 text-xl font-semibold tabular-nums'>
                {metrics[d.key] ?? 'Unavailable'}
              </p>
            </div>
          ))}
        </div>
        <div className='sr-only'>
          <table className='w-full text-left text-[11px]'>
            <caption>Daily contribution activity (UTC)</caption>
            <thead>
              <tr>
                <th>Date</th>
                {definitions.map((d) => (
                  <th key={d.key}>{d.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {series.map((day) => (
                <tr key={day.date}>
                  <td>{day.date}</td>
                  {definitions.map((d) => (
                    <td key={d.key}>{day[d.key]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
