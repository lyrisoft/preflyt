import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getRouteApi,
  Link,
  useSearch,
  useNavigate,
} from '@tanstack/react-router'
import {
  ArrowLeft,
  UsersRound,
  GitPullRequest,
  GitBranch,
  GitCommitHorizontal,
  RefreshCw,
  ExternalLink,
  Search,
  Activity,
  FileSearch,
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
import { toast } from 'sonner'
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
import { PageHeader } from '@/components/page-header'
import { RepositoryPicker } from '@/components/repository-picker'
import { SurfaceIcon } from '@/components/surface-icon'
import { useNavigationSession } from '../workspace/navigation-session'
import { canPerform } from '../workspace/scoped-access'
import {
  ContributorActivitySummary,
  type ContributionDay,
} from './contributor-activity-summary'
import { ContributorHelp } from './contributor-help'
import { importContributorActivity } from './import-activity'
import {
  PolicyComplianceSummary,
  PolicyComplianceEvidence,
  type Compliance,
} from './policy-compliance'
import {
  paginateCollection,
  paginatePullRequests,
} from './pull-request-pagination'
import type { ContributorSearch } from './search-schema'
import { TabPagination } from './tab-pagination'

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
  emptyActivity?: boolean
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
                      No assessment for this PR commit
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
  const importScope = (query.data?.scope ?? []).filter((repo) =>
    canPerform(session.data, 'repository.manage', repo.githubId)
  )
  const scopeKey = importScope.map((repo) => repo.githubId).join(',')
  const sync = useMutation({
    mutationFn: async () => ({
      ...(await importContributorActivity(importScope)),
      scopeKey,
    }),
    onSuccess: (result) => {
      if (result.failures.length)
        toast.error('Some repository imports failed', {
          description: result.failures
            .map((failure) => `${failure.repository}: ${failure.message}`)
            .join(' · '),
        })
      else
        toast.success(
          `Imported activity from ${result.imported.length} repositories`
        )
      void client.invalidateQueries({ queryKey: ['contributors'] })
    },
  })
  const importResult = sync.data?.scopeKey === scopeKey ? sync.data : undefined
  const data = query.data,
    c = data?.contributors[0],
    rows = data?.observations ?? []
  const pullRequests = paginatePullRequests(rows, page)
  const tabRows =
    tab === 'pull-requests'
      ? pullRequests
      : paginateCollection(
          rows.filter((row) =>
            tab === 'reviews' ? row.relationship === 'REVIEWER' : true
          ),
          page
        )
  const repositoryRows = paginateCollection(
    (data?.scope ?? []).filter((repo) =>
      rows.some((row) => row.repositoryId === repo.githubId)
    ),
    page
  )
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
          label: 'Commits linked to contributor',
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
          label: 'PRs with saved assessments',
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
        {contributorId && (
          <Link
            to='/contributors'
            search={{ ...filters, page: 1, tab: 'overview' }}
            className='inline-flex items-center gap-1 text-xs text-primary sm:hidden'
          >
            <ArrowLeft className='size-3' />
            Contributors
          </Link>
        )}
        <PageHeader
          title={contributorId ? (c?.login ?? 'Contributor') : 'Contributors'}
          section='Engineering activity'
          icon={UsersRound}
          tone='blue'
          leading={
            contributorId && c ? (
              <img
                src={c.avatarUrl}
                alt=''
                className='size-11 shrink-0 rounded-xl'
              />
            ) : undefined
          }
          actions={
            <>
              {importScope.length > 0 && (
                <Button
                  size='sm'
                  disabled={sync.isPending || query.isFetching}
                  onClick={() => sync.mutate()}
                >
                  <RefreshCw className='size-4' />
                  {sync.isPending ? 'Importing…' : 'Import GitHub activity'}
                </Button>
              )}
              <Button
                variant='outline'
                size='sm'
                onClick={() => void query.refetch()}
                disabled={query.isFetching}
              >
                <RefreshCw className='size-4' />
                Refresh local data
              </Button>
              <ContributorHelp
                profile={!!contributorId}
                limitations={data?.limitations}
                lastReceivedAt={data?.lastReceivedAt}
                collectionEnabled={data?.collectionEnabled}
              />
            </>
          }
        />
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
        {contributorId && (
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
                    ? 'Policy evidence'
                    : t
                        .replace(/-/g, ' ')
                        .replace(/^./, (letter) => letter.toUpperCase())}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
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
              {data.emptyActivity && (
                <p
                  role='status'
                  className='rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground'
                >
                  No recorded activity for this contributor in the selected
                  repository, period and filters. Import GitHub activity or
                  widen the filters.
                </p>
              )}
              {contributorId && c && tab === 'overview' ? (
                <div className='grid items-stretch gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]'>
                  <ContributorActivitySummary
                    series={data.contributionActivity ?? []}
                    metrics={c}
                    allowed={data.permissions.activity}
                  />
                  <PolicyComplianceSummary
                    data={data.policyCompliance ?? null}
                    period={data.period}
                    onEvidence={() => setTab('policy-evidence')}
                  />
                </div>
              ) : !contributorId ? (
                <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
                  {metrics.map((m, i) => (
                    <Card key={m.label} className='gap-3'>
                      <CardContent className='pt-1'>
                        <div className='flex items-center justify-between'>
                          <p className='text-xs text-muted-foreground'>
                            {m.label}
                          </p>
                          <SurfaceIcon
                            icon={m.icon}
                            tone={
                              (['blue', 'teal', 'violet', 'amber'] as const)[i]
                            }
                          />
                        </div>
                        <p className='mt-3 text-2xl font-semibold tabular-nums'>
                          {value(m.n)}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : null}
              {importResult && (
                <div
                  role={importResult.failures.length ? 'alert' : 'status'}
                  className='space-y-1 text-sm'
                >
                  <p
                    className={
                      importResult.failures.length
                        ? 'text-danger-text'
                        : 'text-muted-foreground'
                    }
                  >
                    Imported activity from {importResult.imported.length} of{' '}
                    {importScope.length} repositories.
                    {importResult.truncated &&
                      ' Historical coverage is partial because the import limit was reached.'}
                  </p>
                  {importResult.failures.map((failure) => (
                    <p key={failure.repository} className='text-danger-text'>
                      {failure.repository}: {failure.message}
                    </p>
                  ))}
                </div>
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
                </>
              )}
              {!contributorId && (
                <div className='grid gap-4 lg:grid-cols-3'>
                  <Card className='lg:col-span-2'>
                    <CardHeader className='flex flex-row items-center gap-3'>
                      <SurfaceIcon icon={Activity} tone='violet' />
                      <CardTitle>Participation over time</CardTitle>
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
                    <CardHeader className='flex flex-row items-center gap-3'>
                      <SurfaceIcon icon={FileSearch} tone='blue' />
                      <CardTitle>PR revision evidence</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {data.permissions.policyEvidence &&
                      data.assessmentActivity.some((a) => a.count) ? (
                        <div
                          className='chart-motion h-52'
                          role='img'
                          aria-label='PR assessment coverage'
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
                            PR assessment matches
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
                  <CardHeader className='flex flex-row flex-wrap items-center gap-3'>
                    <SurfaceIcon icon={UsersRound} tone='blue' />
                    <CardTitle className='flex-1'>
                      Contributor directory
                    </CardTitle>
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
                          Use Import GitHub activity to load recent
                          contributors, or receive signed PR, review and push
                          events.
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
                  <CardHeader className='flex flex-row items-center gap-3'>
                    <SurfaceIcon icon={GitBranch} tone='teal' />
                    <CardTitle>Contributed repositories</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className='grid gap-3 sm:grid-cols-2'>
                      {repositoryRows.items.map((repo) => (
                        <Link
                          key={repo.githubId}
                          to='/repositories/$repositoryId'
                          params={{ repositoryId: repo.githubId }}
                          className='rounded-lg border p-4 text-sm font-medium text-primary hover:bg-accent'
                        >
                          <GitBranch className='mb-2 size-4' />
                          {repo.fullName}
                        </Link>
                      ))}
                    </div>
                    <TabPagination
                      pagination={repositoryRows}
                      label='repositories'
                      onPageChange={(next) => setPage(() => next)}
                    />
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
                          ? 'Policy evidence'
                          : tab.replace(/-/g, ' ')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {tab === 'policy-evidence' ? (
                        <PolicyComplianceEvidence
                          data={data.policyCompliance ?? null}
                          page={page}
                          onPageChange={(next) => setPage(() => next)}
                        />
                      ) : !data.permissions.activity ? (
                        <p className='text-sm text-muted-foreground'>
                          Policy evidence permission is required.
                        </p>
                      ) : (
                        <>
                          <SourceRows rows={tabRows.items} />
                          <TabPagination
                            pagination={tabRows}
                            label={
                              tab === 'pull-requests'
                                ? 'pull requests'
                                : tab === 'reviews'
                                  ? 'reviews'
                                  : 'activity records'
                            }
                            onPageChange={(next) => setPage(() => next)}
                          />
                        </>
                      )}
                    </CardContent>
                  </Card>
                )}
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
