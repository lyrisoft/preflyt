import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ChevronLeft,
  ChevronRight,
  GitBranch,
  RefreshCw,
  ShieldCheck,
  FileSearch,
  Bug,
  Wrench,
  Copy,
  TestTubeDiagonal,
  Clock3,
  ArrowUpRight,
  GitCommitHorizontal,
  LoaderCircle,
} from 'lucide-react'
import type { SurfaceTone } from '@/lib/surface-tones'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import { BranchPicker } from '@/features/repositories/branch-picker'
import { RelativeTime } from '@/features/repositories/relative-time'
import { useNavigationSession } from '@/features/workspace/navigation-session'
import { canPerform } from '@/features/workspace/scoped-access'
import { AnalysisCoverage } from './analysis-coverage'
import {
  healthRequest,
  HealthRequestError,
  healthTone,
  healthLabel,
  useHealth,
  useHealthFreshness,
  type HealthAssessment,
} from './health-api'
import { healthDimensionValues } from './health-dimensions'
import { HealthHelp } from './health-help'
import { HealthPolicyEvidence } from './health-policy-evidence'
import { HealthTimelineChart } from './health-timeline-chart'

const pageSize = 10

function findingMetricDescription(value: string) {
  if (value === 'Unavailable') return 'No verified finding count yet'
  if (value.startsWith('≥'))
    return 'At least this many retained; analysis incomplete'
  return value === '0'
    ? 'No findings in the analyzed scope'
    : 'Retained findings in the analyzed scope'
}

export function RepositoryHealth({
  repositoryId,
  defaultBranch,
  assessmentId,
  selectedBranch,
}: {
  repositoryId: string
  name: string
  defaultBranch: string | null
  assessmentId?: string
  selectedBranch?: string
}) {
  const session = useNavigationSession(),
    cache = useQueryClient()
  const [page, setPage] = useState(1),
    [selectedReport, setSelectedReport] = useState<string | undefined>(
      assessmentId
    )
  const [branch, setBranch] = useState(''),
    [search, setSearch] = useState(''),
    [severity, setSeverity] = useState('all')
  const [findingPage, setFindingPage] = useState(1)
  const [detailTab, setDetailTab] = useState<'findings' | 'history'>('findings')
  const query = useHealth(repositoryId, selectedReport, page)
  const loaded = query.isError ? undefined : query.data
  const freshnessQuery = useHealthFreshness(
    repositoryId,
    loaded?.assessment?.id
  )
  const freshnessDenied =
    freshnessQuery.error instanceof HealthRequestError &&
    [401, 403].includes(freshnessQuery.error.status)
  const data = freshnessDenied ? undefined : loaded
  const row = data?.assessment,
    report = row?.report
  const checked = freshnessQuery.isError ? undefined : freshnessQuery.data
  const recent = (at: string | null | undefined, loadedAt: number) =>
    !!at && loadedAt - new Date(at).getTime() <= 60000
  const freshness =
    freshnessQuery.isError || (!!checked && freshnessQuery.isStale)
      ? 'UNVERIFIED'
      : checked?.assessmentId === row?.id &&
          checked?.sourceSha === row?.sourceSha &&
          recent(checked?.checkedAt, freshnessQuery.dataUpdatedAt)
        ? checked!.freshness
        : recent(data?.checkedAt, query.dataUpdatedAt)
          ? (data?.freshness ?? 'UNVERIFIED')
          : 'UNVERIFIED'
  const headCheckedAt =
    checked?.assessmentId === row?.id && checked?.sourceSha === row?.sourceSha
      ? checked?.checkedAt
      : data?.checkedAt
  const allowed = canPerform(session.data, 'execution.run', repositoryId)
  const refresh = async () => {
    await cache.invalidateQueries({ queryKey: ['repository-health'] })
    await cache.invalidateQueries({ queryKey: ['health-portfolio'] })
    await cache.invalidateQueries({ queryKey: ['health-freshness'] })
  }
  const start = useMutation({
    mutationFn: (value: string) =>
      healthRequest<HealthAssessment>(
        `repositories/${repositoryId}/health`,
        undefined,
        { branch: value, requestKey: crypto.randomUUID() }
      ),
    onSuccess: async () => {
      setSelectedReport(undefined)
      setPage(1)
      await refresh()
    },
  })
  const cancel = useMutation({
    mutationFn: () =>
      healthRequest(
        `repositories/${repositoryId}/health/${row!.id}/cancel`,
        undefined,
        {}
      ),
    onSuccess: refresh,
  })
  const active = !!row && ['QUEUED', 'RUNNING'].includes(row.state)
  const chosenBranch =
    selectedBranch ?? (branch || data?.branch || defaultBranch || '')
  const rows =
    report?.findings.filter(
      (f) =>
        (severity === 'all' || severity === f.severity) &&
        `${f.title} ${f.path ?? ''} ${f.ruleId ?? ''}`
          .toLowerCase()
          .includes(search.toLowerCase())
    ) ?? []
  const findingPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const currentFindingPage = Math.min(findingPage, findingPages)
  const historyPages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize))
  const findingsAvailable =
    report?.mode === 'EXECUTED' &&
    report.analyses.some((a) => a.findingsRetained !== undefined)
  const dimensions = report
    ? healthDimensionValues(
        report,
        data?.hotspotReview,
        row?.includeCoverage ?? false
      )
    : null
  const metrics = dimensions
    ? [
        {
          label: 'Security',
          value: dimensions.security,
          description: findingMetricDescription(dimensions.security),
          icon: ShieldCheck,
          tone: 'blue' as SurfaceTone,
        },
        {
          label: 'Reliability',
          value: dimensions.reliability,
          description: findingMetricDescription(dimensions.reliability),
          icon: Bug,
          tone: 'blue' as SurfaceTone,
        },
        {
          label: 'Maintainability',
          value: dimensions.maintainability,
          description: findingMetricDescription(dimensions.maintainability),
          icon: Wrench,
          tone: 'teal' as SurfaceTone,
        },
        {
          label: 'Duplication',
          value: dimensions.duplication,
          description:
            dimensions.duplication === 'Unavailable'
              ? 'No verified duplication measurement'
              : 'Duplicated analyzed lines',
          icon: Copy,
          tone: 'violet' as SurfaceTone,
        },
        {
          label: 'Test coverage',
          value: dimensions.coverage,
          description: report?.measurements?.coverage
            ? 'Recorded line coverage'
            : 'No matching CI line coverage',
          icon: TestTubeDiagonal,
          tone: 'teal' as SurfaceTone,
        },
      ]
    : []
  return (
    <div className='space-y-5'>
      <Card
        className='gap-0 overflow-hidden py-0'
        aria-label='Repository health summary'
      >
        <div className='flex flex-wrap items-center justify-between gap-4 p-4'>
          <div className='flex items-center gap-3'>
            <SurfaceIcon icon={ShieldCheck} tone='teal' />
            <div>
              <h2 className='text-base font-semibold'>Repository health</h2>
              <p className='mt-1 text-sm text-muted-foreground'>
                Findings over time and the latest assessment.
              </p>
            </div>
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            {allowed && (
              <>
                {selectedBranch === undefined && (
                  <BranchPicker
                    id='health-assessment-branch'
                    label='Assessment branch'
                    repositoryId={repositoryId}
                    actorId={session.data?.identityId}
                    value={chosenBranch}
                    disabled={
                      start.isPending ||
                      query.isPending ||
                      query.isError ||
                      freshnessDenied
                    }
                    onValueChange={setBranch}
                  />
                )}
                <Button
                  size='sm'
                  disabled={
                    !chosenBranch ||
                    query.isPending ||
                    query.isError ||
                    freshnessDenied ||
                    start.isPending ||
                    (active && chosenBranch === row.branch)
                  }
                  onClick={() => start.mutate(chosenBranch)}
                >
                  {start.isPending ? (
                    <LoaderCircle className='motion-safe:animate-spin' />
                  ) : (
                    <RefreshCw />
                  )}
                  {start.isPending
                    ? 'Queuing…'
                    : row
                      ? 'Reassess'
                      : 'Assess repository'}
                </Button>
              </>
            )}
            <Button
              variant='outline'
              size='icon'
              className='size-9'
              aria-label='Refresh health report'
              onClick={() => void query.refetch()}
            >
              <RefreshCw />
            </Button>
            {selectedBranch === undefined && <HealthHelp />}
          </div>
        </div>
        {row && (
          <div className='flex flex-wrap items-center justify-between gap-3 border-t bg-muted/15 px-4 py-2.5'>
            <div className='flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground'>
              <span className='inline-flex items-center gap-1.5'>
                <GitBranch className='size-3.5' />
                {row.branch}
              </span>
              <span className='inline-flex items-center gap-1.5'>
                <GitCommitHorizontal className='size-3.5' />
                <code title={row.sourceSha ?? undefined}>
                  {row.sourceSha?.slice(0, 7) ?? 'Commit not pinned yet'}
                </code>
              </span>
              {row.finishedAt && (
                <span className='inline-flex items-center gap-1.5'>
                  <Clock3 className='size-3.5' />
                  Assessed <RelativeTime value={row.finishedAt} />
                </span>
              )}
            </div>
            <div className='flex flex-wrap items-center gap-2'>
              <span className='text-xs text-muted-foreground'>
                Overall health
              </span>
              <StatusBadge
                tone={healthTone(
                  row.overallHealth?.status ??
                    (row.state === 'COMPLETED' ? 'INCOMPLETE' : row.state)
                )}
              >
                <span title={row.overallHealth?.reasons.join(' ')}>
                  {healthLabel(
                    row.overallHealth?.status ??
                      (row.state === 'COMPLETED' ? 'INCOMPLETE' : row.state)
                  )}
                </span>
              </StatusBadge>
              <StatusBadge tone={healthTone(freshness)}>
                {healthLabel(freshness)}
              </StatusBadge>
              {freshnessQuery.isFetching && (
                <span role='status' className='text-xs text-muted-foreground'>
                  Checking freshness…
                </span>
              )}
              {active && allowed && (
                <Button
                  size='sm'
                  variant='outline'
                  disabled={cancel.isPending || row.cancelled}
                  onClick={() => cancel.mutate()}
                >
                  {row.cancelled ? 'Cancelling…' : 'Cancel assessment'}
                </Button>
              )}
            </div>
          </div>
        )}
        {query.isPending && (
          <div
            role='status'
            aria-label='Loading repository health'
            className='space-y-3 border-t p-4'
          >
            <Skeleton className='h-32 w-full rounded-lg' />
            <span className='sr-only'>Loading repository health…</span>
          </div>
        )}
        {!query.isPending && !query.isError && row && (
          <HealthTimelineChart
            embedded
            points={data!.timeline ?? []}
            branch={row.branch}
            onSelectReport={setSelectedReport}
          />
        )}
      </Card>
      {(start.isError || cancel.isError) && (
        <p
          role='alert'
          className='rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm'
        >
          {start.error?.message ?? cancel.error?.message}
        </p>
      )}
      {query.isPending ? null : query.isError || freshnessDenied ? (
        <Card>
          <CardHeader>
            <CardTitle>Health unavailable</CardTitle>
          </CardHeader>
          <CardContent>
            <p role='alert' className='text-sm'>
              {query.error?.message ?? freshnessQuery.error?.message}
            </p>
            <Button
              variant='outline'
              className='mt-3'
              onClick={() => {
                void query.refetch()
                void freshnessQuery.refetch()
              }}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : !row ? (
        <Card>
          <CardContent className='flex flex-col items-center px-6 py-12 text-center'>
            <SurfaceIcon icon={FileSearch} tone='blue' size='lg' />
            <h3 className='mt-4 font-semibold'>Not assessed</h3>
            <p className='mt-2 max-w-md text-sm leading-relaxed text-muted-foreground'>
              Select an assessment branch and start the first health report.
              Existing repositories are not scanned without explicit selection.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {report && (
            <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-5'>
              {metrics.map((metric) => (
                <Link
                  key={metric.label}
                  to='/findings'
                  search={{
                    origin: 'health',
                    health: row!.id,
                    repository: repositoryId,
                    category: (
                      {
                        Security: 'security',
                        Reliability: 'reliability',
                        Maintainability: 'maintainability',
                        Duplication: 'duplication',
                        'Test coverage': 'coverage',
                      } as const
                    )[metric.label as 'Security'],
                    kind:
                      metric.label === 'Test coverage' ? 'gaps' : 'findings',
                    page: 1,
                  }}
                  aria-label={`View ${metric.label.toLowerCase()} findings`}
                  className='block rounded-xl outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring'
                >
                  <Card className='h-full gap-0 transition-colors hover:border-primary/40'>
                    <CardHeader className='flex flex-row items-center justify-between gap-3 pb-4'>
                      <CardTitle className='text-sm font-medium'>
                        {metric.label}
                      </CardTitle>
                      <SurfaceIcon icon={metric.icon} tone={metric.tone} />
                    </CardHeader>
                    <CardContent>
                      <p
                        aria-label={`${metric.label}: ${metric.value}`}
                        title={metric.value}
                        className='text-2xl font-semibold tracking-tight tabular-nums'
                      >
                        {['Unavailable', 'Awaiting CI coverage'].includes(
                          metric.value
                        )
                          ? '—'
                          : metric.value}
                      </p>
                      <p className='mt-1.5 text-xs text-muted-foreground'>
                        {metric.description}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
          {active && (
            <div className='flex items-start gap-3 rounded-xl border border-info/20 bg-info/5 p-4'>
              <LoaderCircle className='mt-0.5 size-4 shrink-0 text-info-text motion-safe:animate-spin' />
              <div className='min-w-0'>
                <p className='text-sm font-semibold'>
                  {row.cancelled
                    ? 'Cancellation requested'
                    : row.state === 'QUEUED'
                      ? 'Waiting for worker capacity'
                      : 'Assessment in progress'}
                </p>
                <p
                  role='status'
                  className='mt-1 text-sm leading-relaxed text-muted-foreground'
                >
                  {row.cancelled
                    ? 'Waiting for the analysis runtime to confirm cleanup.'
                    : 'Progress updates automatically. The assessment stays pinned to one commit.'}
                </p>
              </div>
            </div>
          )}
          {report && (
            <AnalysisCoverage
              key={row.id}
              report={report}
              assessmentId={row.id}
              assessmentReason={row.reason}
              hotspotReview={data?.hotspotReview}
              headCheckedAt={headCheckedAt}
            />
          )}
          <div className='grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_350px]'>
            <div className='min-w-0'>
              <Tabs
                value={report ? detailTab : 'history'}
                onValueChange={(value) => {
                  if (value === 'findings' || value === 'history')
                    setDetailTab(value)
                }}
                className='gap-4'
              >
                <TabsList aria-label='Repository health details'>
                  <TabsTrigger value='findings' disabled={!report}>
                    Findings {report ? `(${report.findings.length})` : ''}
                  </TabsTrigger>
                  <TabsTrigger value='history'>
                    Assessment history ({data!.total})
                  </TabsTrigger>
                </TabsList>
                <TabsContent value='findings' className='space-y-5'>
                  {report && (
                    <Card
                      className='gap-0 overflow-hidden py-0'
                      aria-label='Repository findings'
                    >
                      <CardHeader className='gap-4 p-5'>
                        <div className='flex items-center justify-between gap-3'>
                          <div className='flex items-center gap-3'>
                            <SurfaceIcon
                              icon={FileSearch}
                              tone='blue'
                              size='sm'
                            />
                            <CardTitle>Findings</CardTitle>
                          </div>
                          {findingsAvailable && (
                            <span className='text-xs text-muted-foreground'>
                              {report.findings.length} reported
                            </span>
                          )}
                        </div>
                        <CardDescription>
                          Open an issue to inspect its rule and exact source
                          location.
                        </CardDescription>
                        {!!report.findings.length && (
                          <div className='flex flex-wrap gap-2'>
                            <Input
                              className='min-w-0 flex-1 sm:max-w-sm'
                              value={search}
                              placeholder='Search findings or files…'
                              aria-label='Search health findings'
                              onChange={(e) => {
                                setSearch(e.target.value)
                                setFindingPage(1)
                              }}
                            />
                            <Select
                              value={severity}
                              onValueChange={(value) => {
                                setSeverity(value)
                                setFindingPage(1)
                              }}
                            >
                              <SelectTrigger
                                className='w-40'
                                aria-label='Filter finding severity'
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {[
                                  'all',
                                  'critical',
                                  'high',
                                  'medium',
                                  'low',
                                  'unknown',
                                ].map((value) => (
                                  <SelectItem key={value} value={value}>
                                    {value === 'all' ? 'All severities' : value}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </CardHeader>
                      {rows.length ? (
                        <div className='overflow-x-auto border-t'>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className='pl-5'>
                                  Finding / location
                                </TableHead>
                                <TableHead className='w-28 pr-5'>
                                  Severity
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {rows
                                .slice(
                                  (currentFindingPage - 1) * pageSize,
                                  currentFindingPage * pageSize
                                )
                                .map((f) => (
                                  <TableRow key={f.fingerprint}>
                                    <TableCell className='max-w-lg py-4 pl-5 whitespace-normal'>
                                      <Link
                                        to='/findings/$findingId'
                                        params={{ findingId: f.fingerprint }}
                                        search={{
                                          origin: 'health',
                                          repository: repositoryId,
                                          health: row.id,
                                        }}
                                        className='text-left text-sm font-medium hover:text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring'
                                      >
                                        {f.title}
                                      </Link>
                                      <p className='mt-1.5 font-mono text-xs break-all text-muted-foreground'>
                                        {f.path ?? 'No file supplied'}
                                        {f.line
                                          ? `:${f.line}${f.endLine && f.endLine > f.line ? `–${f.endLine}` : ''}`
                                          : ''}
                                      </p>
                                      <p className='mt-1 text-xs text-muted-foreground'>
                                        {f.ruleId ?? f.checkId}
                                      </p>
                                    </TableCell>
                                    <TableCell className='pt-4 pr-5 align-top'>
                                      <StatusBadge
                                        tone={healthTone(f.severity)}
                                      >
                                        {f.severity}
                                      </StatusBadge>
                                    </TableCell>
                                  </TableRow>
                                ))}
                            </TableBody>
                          </Table>
                        </div>
                      ) : (
                        <div className='flex min-h-64 flex-col items-center justify-center border-t bg-muted/10 px-6 py-10 text-center'>
                          <FileSearch
                            className='size-8 text-muted-foreground/60'
                            aria-hidden='true'
                          />
                          <p className='mt-4 text-sm font-medium'>
                            {report.mode === 'INSPECTION_ONLY'
                              ? 'Findings unavailable because no analyzer ran.'
                              : report.completeness === 'PARTIAL'
                                ? 'No retained findings match. Analysis is incomplete; this is not an all-clear result.'
                                : 'No findings match the current filters within the recorded analysis scope.'}
                          </p>
                          <p className='mt-2 max-w-sm text-xs leading-relaxed text-muted-foreground'>
                            {report.mode === 'INSPECTION_ONLY'
                              ? 'Repository inspection is saved. Review the analysis status for what needs to be enabled.'
                              : 'Results apply to the recorded analyzers, revision and scope.'}
                          </p>
                        </div>
                      )}
                      {rows.length > 0 && (
                        <div className='flex flex-wrap items-center justify-between gap-2 border-t p-3 text-xs'>
                          <span>
                            {(currentFindingPage - 1) * pageSize + 1}–
                            {Math.min(
                              currentFindingPage * pageSize,
                              rows.length
                            )}{' '}
                            of {rows.length} findings · page{' '}
                            {currentFindingPage} of {findingPages}
                          </span>
                          <div className='flex gap-1'>
                            <Button
                              aria-label='Previous findings page'
                              size='icon'
                              variant='outline'
                              disabled={currentFindingPage === 1}
                              onClick={() =>
                                setFindingPage(currentFindingPage - 1)
                              }
                            >
                              <ChevronLeft />
                            </Button>
                            <Button
                              aria-label='Next findings page'
                              size='icon'
                              variant='outline'
                              disabled={currentFindingPage === findingPages}
                              onClick={() =>
                                setFindingPage(currentFindingPage + 1)
                              }
                            >
                              <ChevronRight />
                            </Button>
                          </div>
                        </div>
                      )}
                    </Card>
                  )}
                  {data!.trend && (
                    <p className='rounded-lg border px-4 py-3 text-sm'>
                      {data!.trend.checkIds?.length
                        ? 'Compared rule packs: '
                        : ''}
                      {data!.trend.introduced} findings introduced ·{' '}
                      {data!.trend.noLongerReported} no longer reported compared
                      with the previous compatible complete report.
                    </p>
                  )}
                </TabsContent>
                <TabsContent value='history'>
                  <Card className='gap-0 py-0' aria-label='Assessment history'>
                    <CardHeader className='p-5'>
                      <div className='flex items-center gap-3'>
                        <SurfaceIcon icon={Clock3} tone='violet' size='sm' />
                        <CardTitle>Assessment history</CardTitle>
                      </div>
                      <CardDescription>
                        Immutable reports for {row.branch}. Each retains its
                        original commit and limits.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className='space-y-2 px-5 pb-5'>
                      {data!.history.slice(0, pageSize).map((h) => (
                        <button
                          key={h.id}
                          aria-current={h.id === row.id ? 'true' : undefined}
                          className={`flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring ${h.id === row.id ? 'border-primary/25 bg-primary/5' : ''}`}
                          onClick={() => {
                            setSelectedReport(h.id)
                            setPage(1)
                            setFindingPage(1)
                          }}
                        >
                          <span className='flex flex-wrap items-center gap-3 text-xs text-muted-foreground'>
                            <GitCommitHorizontal className='size-4' />
                            <code className='text-foreground'>
                              {h.sourceSha?.slice(0, 7) ?? 'Not pinned yet'}
                            </code>
                            <RelativeTime value={h.createdAt} />
                          </span>
                          <StatusBadge
                            tone={
                              h.state === 'COMPLETED'
                                ? 'neutral'
                                : healthTone(h.state)
                            }
                          >
                            <span>{healthLabel(h.state)}</span>
                          </StatusBadge>
                        </button>
                      ))}
                      <div className='flex flex-wrap items-center justify-between gap-2 pt-2'>
                        <Button
                          size='sm'
                          variant='ghost'
                          onClick={() => {
                            setSelectedReport(undefined)
                            setPage(1)
                          }}
                        >
                          View latest report
                        </Button>
                        {data!.total > 0 && (
                          <nav
                            aria-label='Assessment history pages'
                            className='flex flex-wrap items-center gap-2'
                          >
                            <span className='text-xs text-muted-foreground'>
                              {(page - 1) * pageSize + 1}–
                              {Math.min(page * pageSize, data!.total)} of{' '}
                              {data!.total} reports · page {page} of{' '}
                              {historyPages}
                            </span>
                            <Button
                              size='sm'
                              variant='outline'
                              aria-label='Previous history page'
                              disabled={page === 1}
                              onClick={() => setPage(page - 1)}
                            >
                              Previous
                            </Button>
                            <Button
                              size='sm'
                              variant='outline'
                              aria-label='Next history page'
                              disabled={page === historyPages}
                              onClick={() => setPage(page + 1)}
                            >
                              Next
                            </Button>
                          </nav>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
            <aside className='min-w-0 space-y-5' aria-label='Analysis details'>
              {report && (
                <HealthPolicyEvidence
                  report={report}
                  repositoryId={repositoryId}
                />
              )}
              <p className='px-1 text-xs leading-relaxed text-muted-foreground'>
                For ongoing PR feedback,{' '}
                <Link
                  className='inline-flex items-center gap-1 font-medium text-foreground hover:underline'
                  to='/policies'
                  search={{ repository: repositoryId }}
                >
                  configure continuous checks{' '}
                  <ArrowUpRight className='size-3' />
                </Link>
                .
              </p>
            </aside>
          </div>
        </>
      )}
    </div>
  )
}
