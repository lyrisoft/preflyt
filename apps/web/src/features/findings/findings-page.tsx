import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { RefreshCw } from 'lucide-react'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Main } from '@/components/layout/main'
import { PageHelpDrawer } from '@/components/page-help-drawer'
import { StatusBadge, type StatusTone } from '@/components/status-badge'
import { useNavigationSession } from '@/features/workspace/navigation-session'

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
}
type Results = {
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
      q,
      page,
    ],
    enabled: session.isSuccess,
    retry: false,
    gcTime: 0,
    queryFn: async ({ signal }): Promise<Results> => {
      const response = await fetch(
        `${API_BASE_URL}/findings?${new URLSearchParams({ kind, repository, severity, q, page: String(page) })}`,
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
      <div className='flex flex-wrap items-center justify-between gap-4'>
        <div>
          <h1 className='text-2xl font-semibold tracking-tight'>Findings</h1>
          <p className='mt-1 text-sm text-muted-foreground'>
            Review reported issues and missing assessment evidence.
          </p>
        </div>
        <div className='flex gap-2'>
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
                title: 'Scope and limits',
                content:
                  'Only repositories you can assess are included. The latest saved assessment for each commit is used. Up to 200 assessments, 100 reports and 2,000 results are inspected. A partial-results notice appears if a limit is reached. Historical findings are not automatically marked resolved.',
              },
            ]}
          />
        </div>
      </div>
      <Tabs
        value={kind}
        onValueChange={(value) => {
          setKind(value)
          setPage(1)
          setDetail(null)
        }}
      >
        <TabsList>
          <TabsTrigger value='findings'>Reported issues</TabsTrigger>
          <TabsTrigger value='gaps'>Evidence gaps</TabsTrigger>
        </TabsList>
      </Tabs>
      <form
        className='flex flex-wrap items-center gap-3'
        onSubmit={(event) => {
          event.preventDefault()
          setQ(search.trim())
          setPage(1)
        }}
      >
        <Input
          aria-label='Search findings'
          placeholder='Search findings…'
          maxLength={100}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className='w-full sm:w-72'
        />
        <Select
          value={repository}
          onValueChange={(value) => {
            setRepository(value)
            setPage(1)
            setDetail(null)
          }}
        >
          <SelectTrigger aria-label='Repository' className='w-full sm:w-72'>
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
          <SelectTrigger aria-label='Severity' className='w-44'>
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
        <Button size='sm' variant='outline'>
          Apply
        </Button>
      </form>
      {(session.isError || result.isError) && (
        <p role='alert' className='text-sm text-destructive'>
          {session.error?.message ?? result.error?.message}
        </p>
      )}
      {result.isPending && !session.isError && (
        <p role='status'>Loading findings…</p>
      )}
      {result.data && (
        <>
          {result.data.truncated && (
            <p role='status' className='rounded-lg border p-3 text-sm'>
              Results are partial. Narrow the repository filter or open the
              repository’s assessments for more evidence.
            </p>
          )}
          {!result.data.rows.length ? (
            <div className='rounded-xl border bg-card p-8'>
              <h2 className='font-semibold'>
                {result.data.assessedRevisions === 0
                  ? 'No saved assessments yet'
                  : 'No matching results'}
              </h2>
              <p className='mt-2 text-sm text-muted-foreground'>
                {result.data.assessedRevisions === 0
                  ? 'Run an assessment from a repository to collect check outcomes and report findings.'
                  : 'Try another filter or inspect a saved assessment for its full evidence.'}
              </p>
              <Button size='sm' variant='outline' className='mt-4' asChild>
                <Link to='/apps'>View repositories</Link>
              </Button>
            </div>
          ) : (
            <div className='overflow-x-auto rounded-xl border'>
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
                    <tr key={row.id} className='border-t'>
                      <td className='min-w-64 p-4'>
                        <button
                          type='button'
                          className='text-left font-medium underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2'
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
          )}
          <div className='flex items-center justify-between gap-3 text-sm'>
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
