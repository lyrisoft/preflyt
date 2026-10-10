import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  AlertCircle,
  ArrowUpRight,
  FileSearch,
  ListFilter,
  RefreshCw,
  Search,
  ShieldAlert,
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { PageHelpDrawer } from '@/components/page-help-drawer'
import { StatusBadge, type StatusTone } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import { useNavigationSession } from '@/features/workspace/navigation-session'
import { FindingsOverview, type FindingsSummary } from './findings-summary'

type Finding = {
  id: string
  title: string
  repositoryId: string
  repository: string
  sourceSha: string
  assessmentId: string
  observedAt: string
  severity: string
  status: string
  path: string | null
  line: number | null
  ruleId: string | null
  evidence: string[]
  verification: string
  occurrences: number
  triage?: {
    state: string
    assigneeId: string | null
    note: string
    revision: number
  }
}
type Results = {
  canManage?: boolean
  summary: FindingsSummary
  rows: Finding[]
  total: number
  pageSize: number
  truncated: boolean
  assessedRevisions: number
  repositories: { githubId: string; fullName: string }[]
}
const severityTone: Record<string, StatusTone> = {
  critical: 'error',
  high: 'error',
  medium: 'warning',
  low: 'info',
  unknown: 'neutral',
}
export function FindingsPage() {
  const session = useNavigationSession()
  return <FindingsWorkspace key={session.data?.organizationId ?? 'loading'} />
}
function FindingsWorkspace() {
  const session = useNavigationSession()
  const [kind, setKind] = useState('findings')
  const [repository, setRepository] = useState('all')
  const [triageFilter, setTriageFilter] = useState('all')
  const [severity, setSeverity] = useState('all')
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState<Finding | null>(null)
  const result = useQuery({
    queryKey: [
      'findings',
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
        `${API_BASE_URL}/findings?${new URLSearchParams({ kind, repository, severity, triage: triageFilter, q, page: String(page) })}`,
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
        description='Review reported issues and missing assessment evidence.'
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
                    'Failed assessment checks and SARIF or JUnit reports linked to saved assessments. Each result belongs to a repository and exact commit. Importing activity alone does not create an assessment.',
                },
                {
                  title: 'Evidence and trust',
                  content:
                    'Reported means a scanner or test report supplied the issue. It is not an independent confirmation. Report source verification is shown in the details. Suppressed means the source report accepted a suppression; it does not waive a Preflyt policy.',
                },
                {
                  title: 'Metrics and charts',
                  content:
                    'Metrics use all matching entries before pagination and apply the repository, severity and applied search filters across both tabs. Reported issues include failed-check summaries and individual report findings; they are not a count of distinct vulnerabilities. Source-suppressed findings are excluded from metrics and charts, but remain in the list. Affected repositories have an issue or evidence gap. Critical/high counts only issues. Charts follow the selected tab; the check chart groups the top eight checks and combines the rest. Historical commits are included; these are not current-open or resolution metrics. AI suggestions are not counted. Human triage records assignment, review and resolution for the specific commit. A resolution is an audited human decision, not proof that a newer commit passes or a policy waiver.',
                },
                {
                  title: 'Scope and limits',
                  content:
                    'Only repositories you can assess are included. The latest saved assessment for each commit is used. Up to 200 assessments, 100 reports and 2,000 results are inspected. A partial-results notice appears if a limit is reached. Historical findings are not automatically marked resolved.',
                },
              ]}
            />
          </>
        }
      />
      <Tabs
        value={kind}
        onValueChange={(value) => {
          setKind(value)
          setPage(1)
          setDetail(null)
        }}
      >
        <TabsList className='grid h-auto w-full max-w-full grid-cols-2 sm:w-fit'>
          <TabsTrigger value='findings' className='h-full whitespace-normal'>
            <ShieldAlert className='size-4' aria-hidden='true' />
            Reported issues
          </TabsTrigger>
          <TabsTrigger value='gaps' className='h-full whitespace-normal'>
            <FileSearch className='size-4' aria-hidden='true' />
            Missing or unverified results
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <form
        aria-label='Filter findings'
        className='flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4'
        onSubmit={(event) => {
          event.preventDefault()
          setQ(search.trim())
          setPage(1)
          setDetail(null)
        }}
      >
        <ListFilter
          className='hidden size-4 shrink-0 text-muted-foreground xl:block'
          aria-hidden='true'
        />
        <Select
          value={triageFilter}
          onValueChange={(value) => {
            setTriageFilter(value)
            setPage(1)
            setDetail(null)
          }}
        >
          <SelectTrigger aria-label='Issue status' className='w-full sm:w-40'>
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
        <div className='relative w-full min-w-0 sm:w-60 sm:flex-1'>
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
          value={repository}
          onValueChange={(value) => {
            setRepository(value)
            setPage(1)
            setDetail(null)
          }}
        >
          <SelectTrigger aria-label='Repository' className='w-full sm:w-64'>
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
            setDetail(null)
          }}
        >
          <SelectTrigger aria-label='Severity' className='w-full sm:w-40'>
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
        <Button size='sm' type='submit' className='ml-auto'>
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
          {result.data.truncated && (
            <p
              role='status'
              className='flex items-start gap-3 rounded-xl border border-warning/20 bg-warning/5 p-4 text-sm'
            >
              <AlertCircle
                className='mt-0.5 size-4 shrink-0 text-warning-text'
                aria-hidden='true'
              />
              <span>
                Results are partial. Narrow the repository filter or open the
                repository’s assessments for more evidence.
              </span>
            </p>
          )}
          {result.data.summary && (
            <FindingsOverview
              summary={result.data.summary}
              kind={kind}
              onSeverity={(value) => {
                setSeverity(value)
                setPage(1)
                setDetail(null)
              }}
            />
          )}
          {!result.data.rows.length ? (
            <div className='flex flex-col items-start gap-5 rounded-xl border bg-card p-6 sm:flex-row sm:items-center'>
              <SurfaceIcon icon={FileSearch} tone='amber' size='lg' />
              <div className='min-w-0 flex-1'>
                <h2 className='text-base font-semibold'>
                  {result.data.assessedRevisions === 0
                    ? 'No saved assessments yet'
                    : 'No matching results'}
                </h2>
                <p className='mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground'>
                  {result.data.assessedRevisions === 0
                    ? 'Create an assessment from a repository to collect check outcomes and findings from imported reports.'
                    : 'Try another filter or open a saved assessment to review its full evidence.'}
                </p>
              </div>
              <Button size='sm' className='shrink-0' asChild>
                <Link to='/apps'>
                  View repositories
                  <ArrowUpRight className='size-4' />
                </Link>
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
                    icon={kind === 'gaps' ? FileSearch : ShieldAlert}
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
                      <th className='p-4'>Finding</th>
                      <th className='p-4'>Severity</th>
                      <th className='p-4'>Status</th>
                      <th className='p-4'>Repository / commit</th>
                      <th className='p-4'>Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.rows.map((row) => (
                      <tr
                        key={row.id}
                        className='border-t transition-colors hover:bg-muted/30'
                      >
                        <td className='min-w-64 p-4'>
                          <button
                            type='button'
                            className='text-left leading-snug font-medium underline-offset-4 hover:text-primary hover:underline focus-visible:outline focus-visible:outline-2'
                            onClick={() => setDetail(row)}
                          >
                            {row.title}
                          </button>
                          {row.path && (
                            <p className='mt-1 text-xs break-all text-muted-foreground'>
                              {row.path}
                              {row.line ? `:${row.line}` : ''}
                            </p>
                          )}
                        </td>
                        <td className='p-4'>
                          <StatusBadge
                            tone={severityTone[row.severity] ?? 'neutral'}
                          >
                            {row.severity}
                          </StatusBadge>
                        </td>
                        <td className='p-4 whitespace-nowrap'>
                          <StatusBadge tone='neutral'>{row.status}</StatusBadge>
                        </td>
                        <td className='p-4'>
                          <p>{row.repository}</p>
                          <code className='text-xs text-muted-foreground'>
                            {row.sourceSha.slice(0, 12)}
                          </code>
                        </td>
                        <td className='p-4'>
                          <Button
                            size='sm'
                            variant='outline'
                            onClick={() => setDetail(row)}
                          >
                            Details
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
              {result.data.total} results · {result.data.assessedRevisions}{' '}
              assessed commits
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
      <Sheet
        open={Boolean(detail)}
        onOpenChange={(open) => {
          if (!open) setDetail(null)
        }}
      >
        <SheetContent className='overflow-y-auto sm:max-w-xl'>
          <SheetHeader>
            <SheetTitle>{detail?.title ?? 'Finding details'}</SheetTitle>
            <SheetDescription>
              Evidence for this saved assessment and commit.
            </SheetDescription>
          </SheetHeader>
          {detail && (
            <div className='space-y-6 px-4 pb-6'>
              <dl className='space-y-4 text-sm'>
                {[
                  ['Repository', detail.repository],
                  ['Commit', detail.sourceSha],
                  ['Rule', detail.ruleId ?? 'Not supplied'],
                  [
                    'File',
                    detail.path
                      ? `${detail.path}${detail.line ? `:${detail.line}` : ''}`
                      : 'Not supplied',
                  ],
                  [
                    'Report source verification',
                    detail.verification === 'ADMIN_ASSOCIATED_UNVERIFIED'
                      ? 'Admin-associated report; source not independently verified'
                      : detail.verification,
                  ],
                  ['Recorded', new Date(detail.observedAt).toLocaleString()],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className='text-muted-foreground'>{label}</dt>
                    <dd className='mt-1 break-all'>{value}</dd>
                  </div>
                ))}
              </dl>
              <div>
                <h3 className='text-sm font-semibold'>Evidence</h3>
                <ul className='mt-2 space-y-2 text-sm'>
                  {detail.evidence.map((value, index) => (
                    <li key={index} className='break-all'>
                      {value}
                    </li>
                  ))}
                </ul>
              </div>
              <FindingTriage
                key={detail.id}
                finding={detail}
                canManage={!!result.data?.canManage}
                onSaved={(triage) => setDetail({ ...detail, triage })}
              />
              <Button size='sm' asChild>
                <Link
                  to='/repositories/$repositoryId'
                  params={{ repositoryId: detail.repositoryId }}
                  search={{
                    tab: 'assessments',
                    assessment: detail.assessmentId,
                  }}
                >
                  View assessment
                </Link>
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </Main>
  )
}

const triageLabels: Record<string, string> = {
  REPORTED: 'Reported',
  IN_REVIEW: 'In review',
  RESOLVED: 'Resolved',
}
function FindingTriage({
  finding,
  canManage,
  onSaved,
}: {
  finding: Finding
  canManage: boolean
  onSaved: (triage: NonNullable<Finding['triage']>) => void
}) {
  const client = useQueryClient()
  const [state, setState] = useState(finding.triage?.state ?? 'REPORTED')
  const [assignee, setAssignee] = useState(
    finding.triage?.assigneeId ?? 'unassigned'
  )
  const [note, setNote] = useState(finding.triage?.note ?? '')
  const assignees = useQuery({
    queryKey: ['finding-assignees', finding.id],
    enabled: canManage,
    retry: false,
    gcTime: 0,
    queryFn: async ({ signal }): Promise<{ id: string; label: string }[]> => {
      const response = await fetch(
        `${API_BASE_URL}/findings/${finding.id}/assignees`,
        { credentials: 'include', cache: 'no-store', signal }
      )
      if (!response.ok)
        throw new Error(
          'Assignees are unavailable. Refresh and check repository access.'
        )
      return response.json()
    },
  })
  const save = useMutation({
    meta: { successMessage: 'Issue updated' },
    mutationFn: async () => {
      const response = await fetch(
        `${API_BASE_URL}/findings/${finding.id}/triage`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            state,
            assigneeId: assignee === 'unassigned' ? null : assignee,
            note,
            expectedRevision: finding.triage?.revision ?? 0,
          }),
        }
      )
      const data = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(
          data?.message ?? 'Could not update this issue. Try again.'
        )
      return data as NonNullable<Finding['triage']>
    },
    onSuccess: async (data) => {
      onSaved(data)
      await client.invalidateQueries({ queryKey: ['findings'] })
    },
  })
  if (!canManage)
    return (
      <div className='space-y-2'>
        <h3 className='text-sm font-semibold'>Manage issue</h3>
        <StatusBadge
          tone={finding.triage?.state === 'RESOLVED' ? 'success' : 'info'}
        >
          {triageLabels[finding.triage?.state ?? 'REPORTED']}
        </StatusBadge>
        {finding.triage?.note && (
          <p className='text-sm whitespace-pre-wrap'>{finding.triage.note}</p>
        )}
      </div>
    )
  return (
    <form
      className='space-y-4 rounded-lg border p-4'
      onSubmit={(event) => {
        event.preventDefault()
        save.mutate()
      }}
    >
      <h3 className='text-sm font-semibold'>Manage issue</h3>
      <div className='grid gap-4 sm:grid-cols-2'>
        <div className='space-y-2'>
          <label className='text-sm font-medium' htmlFor='finding-state'>
            Status
          </label>
          <Select value={state} onValueChange={setState}>
            <SelectTrigger id='finding-state'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(triageLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className='space-y-2'>
          <label className='text-sm font-medium' htmlFor='finding-assignee'>
            Assignee
          </label>
          <Select value={assignee} onValueChange={setAssignee}>
            <SelectTrigger id='finding-assignee'>
              <SelectValue placeholder='Unassigned' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='unassigned'>Unassigned</SelectItem>
              {assignees.data?.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className='space-y-2'>
        <label className='text-sm font-medium' htmlFor='finding-note'>
          Resolution or review note
        </label>
        <Textarea
          id='finding-note'
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={1000}
          required={state === 'RESOLVED'}
          placeholder='Explain the review or how the issue was resolved.'
        />
      </div>
      <p className='text-xs text-muted-foreground'>
        Your changes apply to this commit. Assessment evidence and gate results
        stay unchanged.
      </p>
      {(save.error || assignees.error) && (
        <p role='alert' className='text-sm text-destructive'>
          {(save.error ?? assignees.error)?.message}
        </p>
      )}
      <div className='flex justify-end'>
        <Button size='sm' disabled={save.isPending || assignees.isFetching}>
          Save changes
        </Button>
      </div>
    </form>
  )
}
