import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, getRouteApi } from '@tanstack/react-router'
import {
  AlertCircle,
  ArrowUpRight,
  FileSearch,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { PageHelpDrawer } from '@/components/page-help-drawer'
import { ResultTimestamp } from '@/components/result-timestamp'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import { useNavigationSession } from '@/features/workspace/navigation-session'
import { severityTone, triageLabels, type Finding } from './finding-types'
import { FindingsOverview, type FindingsSummary } from './findings-summary'

type Results = {
  incompleteHealth?: boolean
  inspectionOnly?: boolean
  canManage?: boolean
  summary: FindingsSummary
  aiSummary?: {
    suggestions: number
    repositories: number
    pullRequests: number
  }
  rows: Finding[]
  total: number
  pageSize: number
  truncated: boolean
  assessedRevisions: number
  repositories: { githubId: string; fullName: string }[]
}
export function FindingsPage() {
  const session = useNavigationSession()
  return <FindingsWorkspace key={session.data?.organizationId ?? 'loading'} />
}
function FindingsWorkspace() {
  const session = useNavigationSession()
  const initial = getRouteApi('/_authenticated/findings').useSearch()
  const [category, setCategory] = useState(initial.category ?? 'all')
  const [source, setSource] = useState(
    initial.source ?? (initial.origin === 'health' ? 'health' : 'all')
  )
  const [health, setHealth] = useState(initial.health)
  const healthView = source === 'health' && !!health
  const [kind, setKind] = useState<string>(
    initial.kind === 'ai' ? 'findings' : (initial.kind ?? 'findings')
  )
  const aiView = source === 'ai'
  const [repository, setRepository] = useState(initial.repository ?? 'all')
  const [triageFilter, setTriageFilter] = useState<string>(
    initial.triage ?? 'all'
  )
  const [severity, setSeverity] = useState<string>(initial.severity ?? 'all')
  const [search, setSearch] = useState(initial.q ?? '')
  const [q, setQ] = useState(initial.q ?? '')
  const [page, setPage] = useState(initial.page ?? 1)
  const result = useQuery({
    queryKey: [
      'findings',
      category,
      source,
      health,
      session.data?.organizationId,
      kind,
      repository,
      severity,
      triageFilter,
      q,
      page,
    ],
    enabled: session.isSuccess,
    retry: false,
    gcTime: 0,
    queryFn: async ({ signal }): Promise<Results> => {
      const response = await fetch(
        `${API_BASE_URL}/findings?${new URLSearchParams({ category, source, ...(source === 'health' && health ? { health } : {}), kind, repository, severity, triage: triageFilter, q, page: String(page) })}`,
        { credentials: 'include', cache: 'no-store', signal }
      )
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(
          body?.message ??
            'Findings are unavailable. Retry or check your permissions.'
        )
      }
      return response.json()
    },
  })
  return (
    <Main className='space-y-6'>
      <PageHeader
        title='Findings'
        description='CI and repository health findings, plus advisory PR reviews.'
        section='Workspace'
        icon={ShieldAlert}
        tone='amber'
        actions={
          <>
            <Button
              size='sm'
              variant='outline'
              disabled={result.isFetching}
              onClick={() => void result.refetch()}
            >
              <RefreshCw className='size-4' />
              Refresh
            </Button>
            <PageHelpDrawer
              title='Findings'
              sections={[
                {
                  title: 'Where findings come from',
                  content:
                    'One Findings list includes CI, repository health and AI review findings. Use Source to focus on one source. AI findings retain their original assessment, commit, date and cited locations. They are advisory and never change check pass/fail results.',
                },
                {
                  title: 'Evidence and trust',
                  content:
                    'Reported means a scanner or test report supplied the issue. It is not an independent confirmation. Report source verification is shown in the details. Suppressed means the source report accepted a suppression; it does not waive a Preflyt policy.',
                },
                {
                  title: 'Metrics and charts',
                  content:
                    'Metrics use all matching entries before pagination and apply the source, finding type, repository, severity, status and applied search filters across both tabs. Reported issues include failed-check summaries and individual report findings; they are not a count of distinct vulnerabilities. Source-suppressed findings are excluded from metrics and charts, but remain in the list. Affected repositories have an issue or evidence gap. Critical/high counts only issues. Charts follow the selected tab; the check chart groups the top eight checks and combines the rest. Historical commits are included; these are not current-open or resolution metrics. AI review findings are included in finding counts and severity charts; their ratings are advisory and do not change check results or readiness. CI triage records assignment, review and resolution for the specific commit. Health findings retain their saved analyzer outcome; optional hotspot review is available in their details. A resolution is an audited human decision, not proof that a newer commit passes or a policy waiver.',
                },
                {
                  title: 'Scope and limits',
                  content:
                    'Only repositories you can assess are included. The latest saved assessment for each commit is used. Assessed at shows when the CI assessment was saved or the repository health report finished, in your browser time zone. Up to 200 CI assessments and 200 Health assessments, 100 CI reports and 2,000 combined results are inspected. Each source uses its latest saved report for each commit. A partial-results notice appears if a limit is reached. Historical findings are not automatically marked resolved.',
                },
              ]}
            />
          </>
        }
      />
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <Tabs
          value={kind}
          onValueChange={(value) => {
            setKind(value)
            if (value === 'gaps' && source === 'ai') setSource('all')
            setPage(1)
          }}
        >
          <TabsList className='flex h-auto w-fit max-w-full flex-wrap'>
            <TabsTrigger
              value='findings'
              className='flex-none px-3 py-2 whitespace-normal'
            >
              <ShieldAlert className='size-4' aria-hidden='true' />
              Reported issues
            </TabsTrigger>
            <TabsTrigger
              value='gaps'
              className='flex-none px-3 py-2 whitespace-normal'
            >
              <FileSearch className='size-4' aria-hidden='true' />
              Missing or unverified results
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div
          role='group'
          aria-label='Finding source and type'
          className='grid w-full grid-cols-1 gap-3 sm:w-auto sm:grid-cols-2'
        >
          <Select
            value={source}
            onValueChange={(value) => {
              setSource(value as typeof source)
              if (value === 'ai') {
                setKind('findings')
                setCategory('all')
                setSeverity('all')
                setTriageFilter('all')
              }
              setHealth(undefined)
              setPage(1)
            }}
          >
            <SelectTrigger
              aria-label='Finding source'
              className='w-full sm:w-48'
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All sources</SelectItem>
              <SelectItem value='ci'>CI</SelectItem>
              <SelectItem value='health'>Repository health</SelectItem>
              <SelectItem value='ai'>AI review</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={category}
            disabled={aiView}
            onValueChange={(value) => {
              setCategory(value as typeof category)
              setPage(1)
            }}
          >
            <SelectTrigger className='w-full sm:w-48' aria-label='Finding type'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                ['all', 'All finding types'],
                ['security', 'Security'],
                ['reliability', 'Reliability'],
                ['maintainability', 'Maintainability'],
                ['duplication', 'Duplication'],
                ['hotspot', 'Security hotspots'],
                ['coverage', 'Test coverage'],
                ['tests', 'Test failures'],
                ['check', 'Failed checks'],
              ].map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <form
        aria-label='Filter findings'
        className='grid grid-cols-1 items-center gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-[minmax(200px,1fr)_160px_minmax(200px,1fr)_160px_auto]'
        onSubmit={(event) => {
          event.preventDefault()
          setQ(search.trim())
          setPage(1)
        }}
      >
        <div className='relative min-w-0 sm:col-span-2 xl:col-span-1'>
          <Search
            className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground'
            aria-hidden='true'
          />
          <Input
            aria-label='Search findings'
            placeholder='Search findings…'
            maxLength={100}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className='w-full pl-9'
          />
        </div>
        <Select
          value={triageFilter}
          onValueChange={(value) => {
            setTriageFilter(value)
            setPage(1)
          }}
        >
          <SelectTrigger aria-label='Issue status' className='w-full'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All issue statuses</SelectItem>
            {Object.entries(triageLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={repository}
          onValueChange={(value) => {
            setRepository(value)
            setHealth(undefined)
            setPage(1)
          }}
        >
          <SelectTrigger aria-label='Repository' className='w-full'>
            <SelectValue placeholder='All repositories' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All repositories</SelectItem>
            {result.data?.repositories.map((repo) => (
              <SelectItem key={repo.githubId} value={repo.githubId}>
                {repo.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={severity}
          onValueChange={(value) => {
            setSeverity(value)
            setPage(1)
          }}
        >
          <SelectTrigger aria-label='Severity' className='w-full'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {['all', 'critical', 'high', 'medium', 'low', 'unknown'].map(
              (value) => (
                <SelectItem key={value} value={value}>
                  {value === 'all'
                    ? 'All severities'
                    : value[0].toUpperCase() + value.slice(1)}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
        <Button
          size='sm'
          type='submit'
          className='w-full justify-self-end sm:w-auto'
        >
          Apply
        </Button>
      </form>
      {(session.isError || result.isError) && (
        <div
          role='alert'
          className='flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive'
        >
          <AlertCircle className='mt-0.5 size-4 shrink-0' aria-hidden='true' />
          {session.error?.message ?? result.error?.message}
        </div>
      )}
      {result.isPending && !session.isError && (
        <div role='status' aria-label='Loading findings' className='space-y-5'>
          <span className='sr-only'>Loading findings…</span>
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4'>
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className='h-32 rounded-xl' />
            ))}
          </div>
          <Skeleton className='h-64 rounded-xl' />
        </div>
      )}
      {result.data && (
        <>
          {result.data.summary &&
            !result.data.inspectionOnly &&
            !(healthView && category === 'coverage') && (
              <FindingsOverview
                summary={result.data.summary}
                kind={kind}
                onSeverity={(value) => {
                  setSeverity(value)
                  setPage(1)
                }}
              />
            )}
          {aiView && result.data.aiSummary && (
            <p className='text-sm text-muted-foreground'>
              {result.data.aiSummary.suggestions} suggestions ·{' '}
              {result.data.aiSummary.pullRequests} pull request
              {result.data.aiSummary.pullRequests === 1 ? '' : 's'} ·{' '}
              {result.data.aiSummary.repositories} repositor
              {result.data.aiSummary.repositories === 1 ? 'y' : 'ies'}
            </p>
          )}
          {!result.data.rows.length ? (
            <div className='flex flex-col items-start gap-5 rounded-xl border bg-card p-4 sm:flex-row sm:items-center'>
              <SurfaceIcon icon={FileSearch} tone='amber' size='lg' />
              <div className='min-w-0 flex-1'>
                <h2 className='text-base font-semibold'>
                  {aiView
                    ? 'No matching AI suggestions'
                    : healthView && category === 'coverage'
                      ? 'No CI coverage evidence for this commit'
                      : result.data.inspectionOnly
                        ? 'Analysis has not run'
                        : result.data.assessedRevisions === 0
                          ? 'No saved assessments yet'
                          : 'No matching results'}
                </h2>
                <p className='mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground'>
                  {aiView
                    ? 'Completed PR reviews appear here when they return suggestions. Try another filter, or open Assessments to inspect review status.'
                    : healthView && category === 'coverage'
                      ? 'Coverage comes from your CI test reports. Preflyt does not rerun tests to generate it.'
                      : result.data.inspectionOnly
                        ? 'These Health reports contain repository inspection only. Open a repository’s Health tab to review the analysis status.'
                        : result.data.assessedRevisions === 0
                          ? 'Create an assessment from a repository to collect check outcomes and findings from imported reports.'
                          : 'Try another filter or open a saved assessment to review its full evidence.'}
                </p>
              </div>
              <Button size='sm' className='shrink-0' asChild>
                {healthView ? (
                  <Link
                    to='/repositories/$repositoryId'
                    params={{ repositoryId: repository }}
                    search={{ tab: 'health', health }}
                  >
                    Open Health report
                    <ArrowUpRight className='size-4' />
                  </Link>
                ) : (
                  <Link to='/apps'>
                    View repositories
                    <ArrowUpRight className='size-4' />
                  </Link>
                )}
              </Button>
            </div>
          ) : (
            <section
              aria-label='Findings results'
              className='min-w-0 overflow-hidden rounded-xl border bg-card'
            >
              <div className='flex items-center justify-between gap-3 border-b px-5 py-4'>
                <div className='flex items-center gap-3'>
                  <SurfaceIcon
                    icon={
                      aiView
                        ? Sparkles
                        : kind === 'gaps'
                          ? FileSearch
                          : ShieldAlert
                    }
                    tone={kind === 'gaps' ? 'amber' : 'blue'}
                    size='sm'
                  />
                  <h2 className='text-sm font-semibold'>
                    {kind === 'gaps'
                      ? 'Missing or unverified results'
                      : 'Reported issues'}
                  </h2>
                </div>
                <p className='text-xs text-muted-foreground tabular-nums'>
                  {result.data.total.toLocaleString()} results
                </p>
              </div>
              <div className='overflow-x-auto'>
                <table className='w-full text-left text-sm'>
                  <thead className='bg-muted/50 text-muted-foreground'>
                    <tr>
                      <th scope='col' className='p-4'>
                        Finding
                      </th>
                      <th scope='col' className='p-4'>
                        Type / source
                      </th>
                      <th scope='col' className='p-4'>
                        Severity
                      </th>
                      <th scope='col' className='p-4'>
                        Status
                      </th>
                      <th scope='col' className='p-4'>
                        Repository / commit
                      </th>
                      <th scope='col' className='p-4 whitespace-nowrap'>
                        Assessed at
                      </th>
                      <th scope='col' className='p-4'>
                        Evidence
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.rows.map((row) => (
                      <tr
                        key={row.id}
                        className='border-t transition-colors hover:bg-muted/30'
                      >
                        <td className='min-w-64 p-4'>
                          <Link
                            to='/findings/$findingId'
                            params={{
                              findingId: row.healthFingerprint ?? row.id,
                            }}
                            search={{
                              assessment: row.assessmentId,
                              ...(row.origin === 'ai'
                                ? { origin: 'ai' as const }
                                : {}),
                              ...(row.origin === 'health'
                                ? {
                                    origin: 'health' as const,
                                    health: row.health,
                                    repository: row.repositoryId,
                                  }
                                : {}),
                              back: new URLSearchParams({
                                category,
                                source,
                                health: health ?? '',
                                kind,
                                repository,
                                severity,
                                triage: triageFilter,
                                q,
                                page: String(page),
                              }).toString(),
                            }}
                            className='text-left leading-snug font-medium underline-offset-4 hover:text-primary hover:underline focus-visible:outline focus-visible:outline-2'
                          >
                            {row.title}
                          </Link>
                          {row.path && (
                            <p className='mt-1 text-xs break-all text-muted-foreground'>
                              {row.path}
                              {row.line ? `:${row.line}` : ''}
                            </p>
                          )}
                        </td>
                        <td className='p-4 whitespace-nowrap'>
                          <p>
                            {(
                              {
                                security: 'Security',
                                reliability: 'Reliability',
                                maintainability: 'Maintainability',
                                duplication: 'Duplication',
                                hotspot: 'Security hotspot',
                                coverage: 'Test coverage',
                                tests: 'Test failure',
                                check: 'Failed check',
                                evidence: 'Missing evidence',
                                ai: 'PR review',
                              } as Record<string, string>
                            )[row.category ?? ''] ?? 'Other'}
                          </p>
                          <p className='mt-1 text-xs text-muted-foreground'>
                            {row.origin === 'ai'
                              ? 'AI review'
                              : row.origin === 'health'
                                ? 'Repository health'
                                : 'CI'}
                          </p>
                        </td>
                        <td className='p-4'>
                          {row.origin === 'ai' && row.severity === 'unknown' ? (
                            <span title='This saved review did not rate severity'>
                              -
                            </span>
                          ) : (
                            <StatusBadge
                              tone={severityTone[row.severity] ?? 'neutral'}
                            >
                              {row.severity}
                            </StatusBadge>
                          )}
                        </td>
                        <td className='p-4 whitespace-nowrap'>
                          <StatusBadge tone='neutral'>
                            {row.origin === 'ai' &&
                            row.triage?.state &&
                            row.triage.state !== 'REPORTED'
                              ? triageLabels[row.triage.state]
                              : row.status}
                          </StatusBadge>
                        </td>
                        <td className='p-4'>
                          <p>{row.repository}</p>
                          {row.pullRequest && (
                            <a
                              href={row.pullRequestUrl}
                              target='_blank'
                              rel='noopener noreferrer'
                              className='block text-xs underline underline-offset-4'
                            >
                              PR #{row.pullRequest}
                            </a>
                          )}
                          <code className='text-xs text-muted-foreground'>
                            {row.sourceSha.slice(0, 12)}
                          </code>
                        </td>
                        <td className='p-4'>
                          <ResultTimestamp value={row.observedAt} stacked />
                        </td>
                        <td className='p-4'>
                          <Button size='sm' variant='outline' asChild>
                            <Link
                              to='/findings/$findingId'
                              params={{
                                findingId: row.healthFingerprint ?? row.id,
                              }}
                              search={{
                                assessment: row.assessmentId,
                                ...(row.origin === 'ai'
                                  ? { origin: 'ai' as const }
                                  : {}),
                                ...(row.origin === 'health'
                                  ? {
                                      origin: 'health' as const,
                                      health: row.health,
                                      repository: row.repositoryId,
                                    }
                                  : {}),
                                back: new URLSearchParams({
                                  category,
                                  source,
                                  health: health ?? '',
                                  kind,
                                  repository,
                                  severity,
                                  triage: triageFilter,
                                  q,
                                  page: String(page),
                                }).toString(),
                              }}
                            >
                              Details
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <div className='flex flex-wrap items-center justify-between gap-3 text-sm'>
            <p className='text-muted-foreground'>
              {result.data.total} results
              {result.data.truncated
                ? ' (retained result limit reached)'
                : ''}{' '}
              · {result.data.assessedRevisions} assessed commits
            </p>
            <div className='flex items-center gap-2'>
              <Button
                size='sm'
                variant='outline'
                disabled={page === 1 || result.isFetching}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span>Page {page}</span>
              <Button
                size='sm'
                variant='outline'
                disabled={
                  page * result.data.pageSize >= result.data.total ||
                  result.isFetching
                }
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </Main>
  )
}
