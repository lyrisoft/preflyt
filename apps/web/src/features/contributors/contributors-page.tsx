import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getRouteApi,
  Link,
  useSearch,
  useNavigate,
} from '@tanstack/react-router'
import {
  UsersRound,
  GitPullRequest,
  GitBranch,
  GitCommitHorizontal,
  RefreshCw,
  ArrowLeft,
  ExternalLink,
  Search,
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
import { API_BASE_URL } from '@/lib/api'
import { chartAnimation, chartTooltipAnimation } from '@/lib/chart-motion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AppHeader } from '@/components/layout/app-header'
import { Main } from '@/components/layout/main'
import { RepositoryPicker } from '@/components/repository-picker'
import { useNavigationSession } from '../workspace/navigation-session'
import { canPerform } from '../workspace/scoped-access'
import {
  ContributorActivitySummary,
  type ContributionDay,
} from './contributor-activity-summary'
import {
  PolicyComplianceSummary,
  PolicyComplianceEvidence,
  type Compliance,
} from './policy-compliance'
import { paginatePullRequests } from './pull-request-pagination'
import type { ContributorSearch } from './search-schema'

type Contributor = {
  id: string
  login: string
  kind: string
  profileUrl: string
  avatarUrl: string
  membership: string
  repositoryCount: number
  authoredPrs: number | null
  mergedPrs: number | null
  reviews: number | null
  commits: number | null
  lastObservedAt: string
}
type Observation = {
  id: string
  relationship: string
  sourceSha: string
  sourceObjectId: string
  pullRequestNumber: number | null
  action: string
  state: string | null
  merged: boolean
  observedAt: string
  deliveryId: string
  repositoryId: string
  repository: string
  sourceUrl: string
  assessments: {
    id: string
    sourceSha: string
    selectionId: string
    createdAt: string
  }[]
}
type Result = {
  choices: { githubId: string; fullName: string }[]
  period: { days: number; from: string; to: string }
  scope: { githubId: string; fullName: string }[]
  summary: {
    contributors: number
    repositories: number
    authoredPrs: number | null
    prsWithSnapshots: number | null
  }
  contributionActivity: ContributionDay[]
  activity: { date: string; count: number }[]
  assessmentActivity: { name: string; count: number }[]
  permissions: { activity: boolean; policyEvidence: boolean }
  page: number
  pageSize: number
  total: number
  truncated: boolean
  contributors: Contributor[]
  lastReceivedAt: string | null
  collectionEnabled: boolean
  limitations: string[]
  policyCompliance?: Compliance | null
  observations?: Observation[]
}
const value = (n: number | null | undefined) => n ?? 'Unavailable'
async function contributorRead(
  path: string,
  signal?: AbortSignal
): Promise<Result> {
  const r = await fetch(`${API_BASE_URL}/contributors${path}`, {
    credentials: 'include',
    signal,
  })
  if (!r.ok)
    throw new Error(
      r.status === 403
        ? 'You do not have access to these contributors or this repository scope.'
        : r.status === 400
          ? 'Choose a valid contributor filter.'
          : 'Contributor information could not be loaded. Try again.'
    )
  return r.json() as Promise<Result>
}
function SourceRows({
  rows,
  policy = false,
}: {
  rows: Observation[]
  policy?: boolean
}) {
  return rows.length ? (
    <div className='overflow-x-auto'>
      <table className='w-full text-left text-sm'>
        <thead>
          <tr className='border-b text-xs text-muted-foreground'>
            <th className='p-3'>Source</th>
            <th className='p-3'>Repository / revision</th>
            <th className='p-3'>
              {policy ? 'Assessment evidence' : 'Relationship'}
            </th>
            <th className='p-3'>Observed (UTC)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className='border-b last:border-0'>
              <td className='p-3'>
                <a
                  href={r.sourceUrl}
                  target='_blank'
                  rel='noreferrer'
                  className='inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline'
                >
                  {r.pullRequestNumber
                    ? `PR #${r.pullRequestNumber}`
                    : r.sourceObjectId.slice(0, 8)}
                  <ExternalLink className='size-3' />
                </a>
                <p className='mt-1 text-xs text-muted-foreground'>
                  {r.action}
                  {r.merged ? ' · Merged' : ''}
                </p>
              </td>
              <td className='p-3'>
                <Link
                  to='/repositories/$repositoryId'
                  params={{ repositoryId: r.repositoryId }}
                  className='text-primary hover:underline'
                >
                  {r.repository}
                </Link>
                <p
                  className='mt-1 font-mono text-xs text-muted-foreground'
                  title={r.sourceSha}
                >
                  {r.sourceSha.slice(0, 12)}
                </p>
              </td>
              <td className='p-3'>
                {policy ? (
                  r.assessments.length ? (
                    <div className='space-y-1'>
                      {r.assessments.map((a) => (
                        <Link
                          key={a.id}
                          to='/repositories/$repositoryId'
                          params={{ repositoryId: r.repositoryId }}
                          search={{ tab: 'assessments', assessment: a.id }}
                          className='block text-xs text-primary hover:underline'
                        >
                          Snapshot {a.id.slice(0, 8)} · selection{' '}
                          {a.selectionId.slice(0, 8)}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <span className='text-muted-foreground'>
                      No matching PR revision snapshot
                    </span>
                  )
                ) : (
                  <Badge variant='outline'>
                    {r.relationship.replace(/_/g, ' ').toLowerCase()}
                  </Badge>
                )}
              </td>
              <td className='p-3 text-xs text-muted-foreground'>
                {new Date(r.observedAt)
                  .toISOString()
                  .slice(0, 16)
                  .replace('T', ' ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p className='p-6 text-sm text-muted-foreground'>
      No matching observations in this period. Broaden the filters or collect
      GitHub events.
    </p>
  )
}
export function ContributorsPage({
  contributorId,
}: {
  contributorId?: string
}) {
  const filters = useSearch({ strict: false }) as ContributorSearch
  const { days, repository, kind, relationship, q, page, tab } = filters
  const navigate = useNavigate()
  const patch = (changes: Partial<ContributorSearch>) => {
    const search = { ...filters, ...changes }
    if (contributorId)
      void navigate({
        to: '/contributors/$contributorId',
        params: { contributorId },
        search,
        replace: true,
      })
    else void navigate({ to: '/contributors', search, replace: true })
  }
  const setDays = (days: string) =>
    patch({ days: days as ContributorSearch['days'], page: 1 })
  const setRepository = (repository: string) => patch({ repository, page: 1 })
  const setKind = (kind: string) =>
    patch({ kind: kind as ContributorSearch['kind'], page: 1 })
  const setRelationship = (relationship: string) =>
    patch({
      relationship: relationship as ContributorSearch['relationship'],
      page: 1,
    })
  const setQ = (q: string) => patch({ q, page: 1 })
  const setPage = (update: (page: number) => number) =>
    patch({ page: update(page) })
  const setTab = (tab: string) =>
    patch({ tab: tab as ContributorSearch['tab'], page: 1 })
  const session = useNavigationSession(),
    client = useQueryClient()
  const params = new URLSearchParams({
    days,
    kind,
    relationship,
    q,
    page: String(page),
  })
  if (repository !== 'all') params.set('repository', repository)
  const query = useQuery({
    queryKey: [
      'contributors',
      session.data?.organizationId,
      session.data?.identityId,
      contributorId,
      params.toString(),
    ],
    queryFn: ({ signal }) =>
      contributorRead(
        `${contributorId ? `/${encodeURIComponent(contributorId)}` : ''}?${params}`,
        signal
      ),
    retry: false,
    gcTime: 0,
    enabled: session.isSuccess,
  })
  const sync = useMutation({
    mutationFn: async () => {
      const r = await fetch(
        `${API_BASE_URL}/contributors/repositories/${repository}/sync`,
        { method: 'POST', credentials: 'include' }
      )
      if (!r.ok)
        throw new Error(
          r.status === 429
            ? 'GitHub rate limit reached. Retry after the cooldown.'
            : 'Backfill failed. Check repository permission and GitHub App read access.'
        )
      return r.json() as Promise<{ truncated: boolean }>
    },
    onSuccess: () =>
      void client.invalidateQueries({ queryKey: ['contributors'] }),
  })
  const data = query.data,
    c = data?.contributors[0],
    rows = data?.observations ?? []
  const pullRequests = paginatePullRequests(rows, page)
  function filter(action: () => void) {
    action()
  }
  const selectClass = 'h-9 rounded-md border bg-background px-3 text-sm'
  const metrics = contributorId
    ? [
        { label: 'Authored PRs', n: c?.authoredPrs, icon: GitPullRequest },
        { label: 'Merged PRs', n: c?.mergedPrs, icon: GitBranch },
        { label: 'Recorded reviews', n: c?.reviews, icon: UsersRound },
        {
          label: 'Attributed commits',
          n: c?.commits,
          icon: GitCommitHorizontal,
        },
      ]
    : [
        {
          label: 'Observed contributors',
          n: data?.summary.contributors,
          icon: UsersRound,
        },
        {
          label: 'Contributed repositories',
          n: data?.summary.repositories,
          icon: GitBranch,
        },
        {
          label: 'Authored PRs',
          n: data?.summary.authoredPrs,
          icon: GitPullRequest,
        },
        {
          label: 'PRs with revision snapshots',
          n: data?.summary.prsWithSnapshots,
          icon: GitCommitHorizontal,
        },
      ]
  return (
    <>
      <AppHeader
        breadcrumbs={
          contributorId
            ? [
                { label: 'Contributors', to: '/contributors' },
                { label: c?.login ?? 'Contributor' },
              ]
            : [{ label: 'Contributors' }]
        }
      />
      <Main className='space-y-6'>
        <div className='flex flex-wrap items-center justify-between gap-4'>
          <div>
            {contributorId && (
              <Link
                to='/contributors'
                search={{ ...filters, page: 1, tab: 'overview' }}
                className='mb-2 inline-flex items-center gap-1 text-xs text-primary sm:hidden'
              >
                <ArrowLeft className='size-3' />
                Contributors
              </Link>
            )}
            <p className='text-[10px] font-semibold tracking-widest text-muted-foreground uppercase'>
              Engineering activity
            </p>
            <h1 className='mt-1 flex items-center gap-3 text-2xl font-semibold'>
              {contributorId && c ? (
                <img
                  src={c.avatarUrl}
                  alt=''
                  className='size-10 rounded-full'
                />
              ) : null}
              {contributorId ? (c?.login ?? 'Contributor') : 'Contributors'}
            </h1>
            <p className='mt-1 text-sm text-muted-foreground'>
              Observed participation and revision evidence from authorized
              repositories.
            </p>
          </div>
          <Button
            variant='outline'
            size='sm'
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw className='size-4' />
            Refresh local data
          </Button>
        </div>
        <div className='flex flex-wrap gap-3 rounded-xl border bg-card p-4'>
          <label className='flex flex-col gap-1 text-xs text-muted-foreground'>
            Period
            <select
              value={days}
              className={selectClass}
              onChange={(e) => filter(() => setDays(e.target.value))}
            >
              {[7, 30, 90, 180].map((d) => (
                <option key={d} value={d}>
                  Last {d} days
                </option>
              ))}
            </select>
          </label>
          <label className='flex flex-col gap-1 text-xs text-muted-foreground'>
            Repository
            <RepositoryPicker
              aria-label='Contributor repository scope'
              repositories={data?.choices ?? []}
              value={repository}
              allowAll
              onValueChange={(v) => filter(() => setRepository(v))}
              className='w-72'
            />
          </label>
          <label className='flex flex-col gap-1 text-xs text-muted-foreground'>
            Identity
            <select
              value={kind}
              className={selectClass}
              onChange={(e) => filter(() => setKind(e.target.value))}
            >
              <option value='all'>All identities</option>
              <option value='HUMAN'>Human</option>
              <option value='BOT'>Bot</option>
              <option value='UNKNOWN'>Unknown</option>
            </select>
          </label>
          {(!data || data.permissions.activity) && (
            <label className='flex flex-col gap-1 text-xs text-muted-foreground'>
              Relationship
              <select
                value={relationship}
                className={selectClass}
                onChange={(e) => filter(() => setRelationship(e.target.value))}
              >
                <option value='all'>All participation</option>
                {[
                  'PR_AUTHOR',
                  'REVIEWER',
                  'COMMIT_AUTHOR',
                  'COMMITTER',
                  'MERGE_ACTOR',
                ].map((r) => (
                  <option key={r} value={r}>
                    {r.replace(/_/g, ' ').toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!contributorId && (
            <label className='flex flex-1 flex-col gap-1 text-xs text-muted-foreground'>
              Search GitHub login
              <div className='relative'>
                <Search className='absolute top-2.5 left-3 size-4' />
                <Input
                  value={q}
                  maxLength={100}
                  className='pl-9'
                  onChange={(e) => filter(() => setQ(e.target.value))}
                  placeholder='Find a contributor…'
                />
              </div>
            </label>
          )}
        </div>
        {query.isPending ? (
          <div
            role='status'
            aria-label='Loading contributors'
            className='grid gap-4 sm:grid-cols-4'
          >
            {metrics.map((m) => (
              <Skeleton key={m.label} className='h-28' />
            ))}
          </div>
        ) : query.isError ? (
          <Card>
            <CardContent role='alert' className='space-y-3 pt-6'>
              <p>{query.error.message}</p>
              <Button onClick={() => void query.refetch()}>Try again</Button>
            </CardContent>
          </Card>
        ) : (
          data && (
            <>
              {contributorId && c ? (
                <div className='grid items-stretch gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]'>
                  <ContributorActivitySummary
                    series={data.contributionActivity ?? []}
                    metrics={c}
                    allowed={data.permissions.activity}
                    truncated={data.truncated}
                  />
                  <PolicyComplianceSummary
                    data={data.policyCompliance ?? null}
                    period={data.period}
                    onEvidence={() => setTab('policy-evidence')}
                  />
                </div>
              ) : (
                <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
                  {metrics.map((m, i) => (
                    <Card key={m.label} className='gap-3'>
                      <CardContent className='pt-1'>
                        <div className='flex items-center justify-between'>
                          <p className='text-xs text-muted-foreground'>
                            {m.label}
                          </p>
                          <m.icon
                            className='size-4'
                            style={{ color: `var(--chart-${i + 1})` }}
                          />
                        </div>
                        <p className='mt-3 text-2xl font-semibold tabular-nums'>
                          {value(m.n)}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
              <div className='flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground'>
                <p>
                  {data.lastReceivedAt
                    ? `Last receipt: ${new Date(data.lastReceivedAt).toLocaleString()}`
                    : 'No contributor receipts yet'}{' '}
                  ·{' '}
                  {data.collectionEnabled
                    ? 'Signed event collection enabled'
                    : 'Signed event collection is disabled'}
                </p>
                {repository !== 'all' &&
                  canPerform(session.data, 'repository.manage', repository) && (
                    <Button
                      size='sm'
                      variant='outline'
                      disabled={sync.isPending}
                      onClick={() => sync.mutate()}
                    >
                      <RefreshCw className='size-3.5' />
                      {sync.isPending
                        ? 'Importing…'
                        : 'Import recent GitHub activity'}
                    </Button>
                  )}
              </div>
              {sync.isError && (
                <p role='alert' className='text-sm text-danger-text'>
                  {sync.error.message}
                </p>
              )}
              {sync.isSuccess && (
                <p role='status' className='text-sm text-muted-foreground'>
                  Recent activity imported.{' '}
                  {sync.data.truncated
                    ? 'Backfill limit reached; historical coverage remains partial.'
                    : 'Historical coverage is bounded to recent pages.'}
                </p>
              )}
              {data.truncated && (
                <p
                  role='status'
                  className='rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm'
                >
                  Collection limit reached. These counts cover the first 5,000
                  observations. Narrow the period or repository for complete
                  scoped results.
                </p>
              )}
              {contributorId && (
                <>
                  <div className='flex flex-wrap gap-2'>
                    <Badge variant='outline'>{c?.kind.toLowerCase()}</Badge>
                    <Badge variant='outline'>GitHub membership unlinked</Badge>
                    {c && (
                      <a
                        className='text-sm text-primary hover:underline'
                        href={c.profileUrl}
                        target='_blank'
                        rel='noreferrer'
                      >
                        GitHub profile ↗
                      </a>
                    )}
                  </div>
                  <Tabs value={tab} onValueChange={setTab}>
                    <TabsList className='flex h-auto flex-wrap justify-start'>
                      {[
                        'overview',
                        'repositories',
                        'pull-requests',
                        'reviews',
                        'policy-evidence',
                        'activity',
                      ].map((t) => (
                        <TabsTrigger key={t} value={t}>
                          {t === 'policy-evidence'
                            ? 'Findings & policy evidence'
                            : t.replace(/-/g, ' ')}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                </>
              )}
              {!contributorId && (
                <div className='grid gap-4 lg:grid-cols-3'>
                  <Card className='lg:col-span-2'>
                    <CardHeader>
                      <CardTitle>Participation over time</CardTitle>
                      <p className='text-xs text-muted-foreground'>
                        Recorded PRs, commits and reviews per day (UTC).
                        Repeated GitHub events are counted once.
                      </p>
                    </CardHeader>
                    <CardContent>
                      {data.permissions.activity && data.activity.length ? (
                        <div
                          className='chart-motion h-52'
                          role='img'
                          aria-label='Daily contributor participation'
                        >
                          <ResponsiveContainer width='100%' height='100%'>
                            <AreaChart data={data.activity}>
                              <CartesianGrid
                                vertical={false}
                                stroke='var(--border)'
                              />
                              <XAxis
                                dataKey='date'
                                tickFormatter={(s) => String(s).slice(5)}
                                tick={{ fontSize: 10 }}
                              />
                              <YAxis
                                allowDecimals={false}
                                width={30}
                                tick={{ fontSize: 10 }}
                              />
                              <Tooltip {...chartTooltipAnimation} />
                              <Area
                                {...chartAnimation}
                                dataKey='count'
                                type='monotone'
                                stroke='var(--chart-1)'
                                fill='var(--chart-1)'
                                fillOpacity={0.15}
                                strokeWidth={2}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <p className='py-16 text-center text-sm text-muted-foreground'>
                          {data.permissions.activity
                            ? 'No recorded activity in this period.'
                            : 'Activity permission is required to view this chart.'}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>PR revision evidence</CardTitle>
                      <p className='text-xs text-muted-foreground'>
                        Recorded snapshots are not verified passing assessments.
                      </p>
                    </CardHeader>
                    <CardContent>
                      {data.permissions.policyEvidence &&
                      data.assessmentActivity.some((a) => a.count) ? (
                        <div
                          className='chart-motion h-52'
                          role='img'
                          aria-label='PR snapshot coverage'
                        >
                          <ResponsiveContainer width='100%' height='100%'>
                            <BarChart
                              data={data.assessmentActivity}
                              layout='vertical'
                            >
                              <XAxis type='number' allowDecimals={false} />
                              <YAxis
                                type='category'
                                dataKey='name'
                                width={100}
                                tick={{ fontSize: 10 }}
                              />
                              <Tooltip {...chartTooltipAnimation} />
                              <Bar
                                {...chartAnimation}
                                dataKey='count'
                                fill='var(--chart-2)'
                                radius={[0, 4, 4, 0]}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <p className='py-12 text-sm text-muted-foreground'>
                          No matching assessed PR evidence is available in this
                          scope.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}
              {!contributorId &&
                data.permissions.activity &&
                data.activity.length > 0 && (
                  <details className='rounded-lg border p-3 text-xs'>
                    <summary className='cursor-pointer font-medium'>
                      View chart data
                    </summary>
                    <div className='mt-3 grid gap-4 sm:grid-cols-2'>
                      <table className='text-left'>
                        <caption className='mb-2 text-left font-medium'>
                          Daily source observations (UTC)
                        </caption>
                        <thead>
                          <tr>
                            <th className='pb-2'>Date</th>
                            <th className='pb-2'>Distinct objects</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.activity.map((a) => (
                            <tr key={a.date}>
                              <td className='py-1'>{a.date}</td>
                              <td>{a.count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {data.permissions.policyEvidence && (
                        <table className='self-start text-left'>
                          <caption className='mb-2 text-left font-medium'>
                            PR snapshot associations
                          </caption>
                          <thead>
                            <tr>
                              <th className='pb-2'>Evidence</th>
                              <th className='pb-2'>PRs</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.assessmentActivity.map((a) => (
                              <tr key={a.name}>
                                <td className='py-1'>{a.name}</td>
                                <td>{a.count}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </details>
                )}
              {!contributorId && (
                <Card>
                  <CardHeader>
                    <CardTitle>Contributor directory</CardTitle>
                    <p className='text-xs text-muted-foreground'>
                      {data.total} identities · filtered period and scope
                    </p>
                  </CardHeader>
                  <CardContent>
                    {data.contributors.length ? (
                      <div className='overflow-x-auto'>
                        <table className='w-full text-left text-sm'>
                          <thead>
                            <tr className='border-b text-xs text-muted-foreground'>
                              <th className='p-3'>Contributor</th>
                              <th className='p-3'>Repositories</th>
                              <th className='p-3'>Authored PRs</th>
                              <th className='p-3'>Reviews</th>
                              <th className='p-3'>Last recorded activity</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.contributors.map((c) => (
                              <tr key={c.id} className='border-b last:border-0'>
                                <td className='p-3'>
                                  <div className='flex items-center gap-3'>
                                    <img
                                      src={c.avatarUrl}
                                      alt=''
                                      loading='lazy'
                                      className='size-8 rounded-full'
                                    />
                                    <div>
                                      {data.permissions.activity ? (
                                        <Link
                                          to='/contributors/$contributorId'
                                          params={{ contributorId: c.id }}
                                          search={{
                                            ...filters,
                                            page: 1,
                                            tab: 'overview',
                                          }}
                                          className='font-semibold text-primary hover:underline'
                                        >
                                          {c.login}
                                        </Link>
                                      ) : (
                                        <span>{c.login}</span>
                                      )}
                                      <p className='text-xs text-muted-foreground'>
                                        {c.kind.toLowerCase()} · membership
                                        unlinked
                                      </p>
                                    </div>
                                  </div>
                                </td>
                                <td className='p-3 tabular-nums'>
                                  {c.repositoryCount}
                                </td>
                                <td className='p-3 tabular-nums'>
                                  {value(c.authoredPrs)}
                                </td>
                                <td className='p-3 tabular-nums'>
                                  {value(c.reviews)}
                                </td>
                                <td className='p-3 text-xs text-muted-foreground'>
                                  {new Date(
                                    c.lastObservedAt
                                  ).toLocaleDateString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className='py-12 text-center'>
                        <UsersRound className='mx-auto mb-3 size-8 text-muted-foreground' />
                        <h2 className='font-semibold'>
                          No contributors match this scope
                        </h2>
                        <p className='mt-2 text-sm text-muted-foreground'>
                          Select a repository and import recent activity, or
                          receive signed PR, review and push events.
                        </p>
                      </div>
                    )}
                    <div className='mt-4 flex items-center justify-between text-xs text-muted-foreground'>
                      <span>Page {page} · 20 per page</span>
                      <div className='flex gap-2'>
                        <Button
                          size='sm'
                          variant='outline'
                          disabled={page === 1}
                          onClick={() => setPage((p) => p - 1)}
                        >
                          Previous
                        </Button>
                        <Button
                          size='sm'
                          variant='outline'
                          disabled={page * 20 >= data.total}
                          onClick={() => setPage((p) => p + 1)}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
              {contributorId && tab === 'repositories' && (
                <Card>
                  <CardHeader>
                    <CardTitle>Contributed repositories</CardTitle>
                  </CardHeader>
                  <CardContent className='grid gap-3 sm:grid-cols-2'>
                    {data.scope
                      .filter((r) =>
                        rows.some((o) => o.repositoryId === r.githubId)
                      )
                      .map((r) => (
                        <Link
                          key={r.githubId}
                          to='/repositories/$repositoryId'
                          params={{ repositoryId: r.githubId }}
                          className='rounded-lg border p-4 text-sm font-medium text-primary hover:bg-accent'
                        >
                          <GitBranch className='mb-2 size-4' />
                          {r.fullName}
                        </Link>
                      ))}
                  </CardContent>
                </Card>
              )}
              {contributorId &&
                [
                  'pull-requests',
                  'reviews',
                  'policy-evidence',
                  'activity',
                ].includes(tab) && (
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        {tab === 'policy-evidence'
                          ? 'Revision-bound policy evidence'
                          : tab.replace(/-/g, ' ')}
                      </CardTitle>
                      {tab === 'policy-evidence' && (
                        <p className='text-sm text-muted-foreground'>
                          Required-check results for the latest recorded PR
                          revisions. Open an assessment to inspect its standards
                          and evidence. Confirmed findings are not available.
                        </p>
                      )}
                    </CardHeader>
                    <CardContent>
                      {tab === 'policy-evidence' ? (
                        <PolicyComplianceEvidence
                          data={data.policyCompliance ?? null}
                        />
                      ) : !data.permissions.activity ? (
                        <p className='text-sm text-muted-foreground'>
                          Policy evidence permission is required.
                        </p>
                      ) : tab === 'pull-requests' ? (
                        <>
                          <SourceRows rows={pullRequests.items} />
                          {pullRequests.total > 0 && (
                            <div className='mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-xs text-muted-foreground'>
                              <p>
                                {(pullRequests.page - 1) *
                                  pullRequests.pageSize +
                                  1}
                                –
                                {Math.min(
                                  pullRequests.page * pullRequests.pageSize,
                                  pullRequests.total
                                )}{' '}
                                of {pullRequests.total} pull requests · Latest
                                recorded activity per PR
                              </p>
                              <nav
                                aria-label='Pull request pagination'
                                className='flex items-center gap-2'
                              >
                                <Button
                                  size='sm'
                                  variant='outline'
                                  disabled={pullRequests.page === 1}
                                  onClick={() =>
                                    setPage(() => pullRequests.page - 1)
                                  }
                                >
                                  Previous
                                </Button>
                                <span aria-live='polite'>
                                  Page {pullRequests.page} of{' '}
                                  {pullRequests.pages}
                                </span>
                                <Button
                                  size='sm'
                                  variant='outline'
                                  disabled={
                                    pullRequests.page === pullRequests.pages
                                  }
                                  onClick={() =>
                                    setPage(() => pullRequests.page + 1)
                                  }
                                >
                                  Next
                                </Button>
                              </nav>
                            </div>
                          )}
                        </>
                      ) : (
                        <SourceRows
                          rows={rows.filter((r) =>
                            tab === 'reviews'
                              ? r.relationship === 'REVIEWER'
                              : true
                          )}
                        />
                      )}
                    </CardContent>
                  </Card>
                )}
              <details className='rounded-xl border bg-muted/10 p-4 text-xs text-muted-foreground'>
                <summary className='cursor-pointer font-medium'>
                  Data sources and limits
                </summary>
                <ul className='mt-3 list-disc space-y-1 pl-4'>
                  {data.limitations.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </details>
            </>
          )
        )}
      </Main>
    </>
  )
}

export function ContributorDetailPage() {
  const { contributorId } = getRouteApi(
    '/_authenticated/contributors/$contributorId'
  ).useParams()
  return <ContributorsPage contributorId={contributorId} />
}
