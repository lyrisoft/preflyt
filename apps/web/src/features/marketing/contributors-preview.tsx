import { useState } from 'react'
import {
  Activity,
  FileSearch,
  GitBranch,
  GitPullRequest,
  Search,
  UsersRound,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { SurfaceIcon } from '@/components/surface-icon'
import { ContributorActivitySparkline } from '@/features/contributors/contributor-activity-sparkline'
import { demoActivity } from './demo-workspace'

const contributors = [
  {
    login: 'alex-northstar',
    initials: 'AN',
    role: 'Human · GitHub contributor',
    repositories: 3,
    prs: 48,
    reviews: 32,
    offset: 0,
  },
  {
    login: 'sam-northstar',
    initials: 'SN',
    role: 'Human · GitHub contributor',
    repositories: 2,
    prs: 26,
    reviews: 41,
    offset: 1,
  },
  {
    login: 'jordan-northstar',
    initials: 'JN',
    role: 'Human · GitHub contributor',
    repositories: 2,
    prs: 12,
    reviews: 19,
    offset: 2,
  },
].map((person) => ({
  ...person,
  activity: demoActivity
    .slice(-30)
    .map((day, index) => ({
      date: day.date,
      count: Math.max(0, day.count - person.offset + (index % 3)),
    })),
}))
const participation = demoActivity
  .slice(-30)
  .map((day, index) => ({
    date: day.date,
    count: contributors.reduce(
      (total, person) => total + person.activity[index].count,
      0
    ),
  }))
const evidence = [
  { name: 'Snapshot recorded', count: 64 },
  { name: 'No matching snapshot', count: 22 },
]
const tooltipStyle = {
  background: 'var(--popover)',
  color: 'var(--popover-foreground)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 12,
}

export function ContributorsPreview() {
  const [search, setSearch] = useState('')
  const visible = contributors.filter((person) =>
    person.login.includes(search.toLowerCase().trim())
  )
  return (
    <div id='contributors-preview' className='scroll-mt-28 space-y-4'>
      <div className='flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/10 px-4 py-3 text-xs text-muted-foreground'>
        <span>Last 30 days · All repositories</span>
        <span>12 September–11 October 2026 · UTC</span>
      </div>
      <div className='grid grid-cols-2 gap-3 xl:grid-cols-4'>
        {[
          {
            label: 'Observed contributors',
            value: 3,
            icon: UsersRound,
            tone: 'blue' as const,
          },
          {
            label: 'Contributed repositories',
            value: 3,
            icon: GitBranch,
            tone: 'teal' as const,
          },
          {
            label: 'Authored PRs',
            value: 86,
            icon: GitPullRequest,
            tone: 'violet' as const,
          },
          {
            label: 'PRs with saved assessments',
            value: 64,
            icon: FileSearch,
            tone: 'amber' as const,
          },
        ].map((metric) => (
          <Card key={metric.label} className='gap-3 py-4'>
            <CardHeader className='flex flex-row items-start justify-between gap-2 px-4'>
              <CardTitle className='text-xs leading-5 text-muted-foreground'>
                {metric.label}
              </CardTitle>
              <SurfaceIcon icon={metric.icon} tone={metric.tone} />
            </CardHeader>
            <CardContent className='px-4'>
              <p className='text-3xl font-semibold tabular-nums'>
                {metric.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className='grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]'>
        <Card className='min-w-0'>
          <CardHeader className='flex flex-row items-center gap-3'>
            <SurfaceIcon icon={Activity} tone='violet' />
            <CardTitle>Participation over time</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              style={{ height: 224, width: '100%' }}
              role='img'
              aria-label='Daily contributor participation over 30 days'
            >
              <ResponsiveContainer width='100%' height='100%'>
                <AreaChart
                  data={participation}
                  margin={{ top: 8, right: 8, bottom: 0, left: -12 }}
                >
                  <CartesianGrid
                    vertical={false}
                    stroke='var(--border)'
                    strokeDasharray='3 4'
                  />
                  <XAxis
                    dataKey='date'
                    tickFormatter={(date) => String(date).slice(5)}
                    minTickGap={30}
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                    tickLine={false}
                  />
                  <YAxis
                    width={36}
                    allowDecimals={false}
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    itemStyle={{ color: 'var(--foreground)' }}
                  />
                  <Area
                    dataKey='count'
                    name='Recorded participations'
                    type='linear'
                    stroke='var(--chart-1)'
                    fill='var(--chart-1)'
                    fillOpacity={0.16}
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        <Card className='min-w-0'>
          <CardHeader className='flex flex-row items-center gap-3'>
            <SurfaceIcon icon={FileSearch} tone='blue' />
            <CardTitle>PR revision evidence</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              style={{ height: 224, width: '100%' }}
              role='img'
              aria-label='64 PRs with a recorded snapshot; 22 without a matching snapshot'
            >
              <ResponsiveContainer width='100%' height='100%'>
                <BarChart
                  data={evidence}
                  layout='vertical'
                  margin={{ top: 12, right: 16, bottom: 0, left: 0 }}
                >
                  <CartesianGrid horizontal={false} stroke='var(--border)' />
                  <XAxis
                    type='number'
                    allowDecimals={false}
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  />
                  <YAxis
                    type='category'
                    dataKey='name'
                    width={95}
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--muted)', fillOpacity: 0.25 }}
                    contentStyle={tooltipStyle}
                    itemStyle={{ color: 'var(--foreground)' }}
                  />
                  <Bar
                    dataKey='count'
                    name='Pull requests'
                    fill='var(--chart-2)'
                    radius={[0, 4, 4, 0]}
                    barSize={34}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
      <Card className='gap-0 overflow-hidden'>
        <CardHeader className='flex flex-row flex-wrap items-center justify-between gap-4 border-b pb-4'>
          <div className='flex items-center gap-3'>
            <SurfaceIcon icon={UsersRound} tone='blue' />
            <div>
              <CardTitle>Contributor directory</CardTitle>
              <p className='mt-1 text-xs text-muted-foreground'>
                {visible.length} identities · selected period and scope
              </p>
            </div>
          </div>
          <div className='relative w-full sm:w-60'>
            <Search
              aria-hidden
              className='absolute top-2.5 left-3 size-4 text-muted-foreground'
            />
            <Input
              aria-label='Search demo contributors'
              placeholder='Find a contributor…'
              className='pl-9'
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className='p-0'>
          <div className='overflow-x-auto'>
            <table className='w-full min-w-[830px] text-left text-sm'>
              <caption className='sr-only'>
                Contributor participation and repository activity
              </caption>
              <thead className='border-b bg-muted/20 text-[11px] text-muted-foreground'>
                <tr>
                  {[
                    'Contributor',
                    'Activity',
                    'Repositories',
                    'Authored PRs',
                    'Reviews',
                    'Last activity',
                  ].map((label, index) => (
                    <th
                      key={label}
                      scope='col'
                      className={`px-5 py-3 font-medium ${index >= 2 && index <= 4 ? 'text-right' : ''}`}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((person) => (
                  <tr
                    key={person.login}
                    className='border-b last:border-0 hover:bg-muted/15'
                  >
                    <td className='px-5 py-4'>
                      <div className='flex items-center gap-3'>
                        <span className='flex size-9 shrink-0 items-center justify-center rounded-full border border-info/20 bg-info/10 text-xs font-semibold text-info-text'>
                          {person.initials}
                        </span>
                        <div>
                          <p className='font-semibold'>{person.login}</p>
                          <p className='mt-1 text-[11px] text-muted-foreground'>
                            {person.role}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className='px-5 py-4'>
                      <ContributorActivitySparkline
                        login={person.login}
                        activity={person.activity}
                      />
                    </td>
                    <td className='px-5 py-4 text-right tabular-nums'>
                      {person.repositories}
                    </td>
                    <td className='px-5 py-4 text-right tabular-nums'>
                      {person.prs}
                    </td>
                    <td className='px-5 py-4 text-right tabular-nums'>
                      {person.reviews}
                    </td>
                    <td className='px-5 py-4 text-xs text-muted-foreground'>
                      11 Oct 2026
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!visible.length && (
            <p
              role='status'
              className='px-5 py-8 text-sm text-muted-foreground'
            >
              No contributors match “{search}”.
            </p>
          )}
          <div className='border-t px-5 py-3 text-xs text-muted-foreground'>
            {visible.length} of 3 contributors · Activity provides context, not
            individual performance rankings.
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
