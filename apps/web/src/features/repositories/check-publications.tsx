import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { PageHelpDrawer } from '@/components/page-help-drawer'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'

type Publication = {
  id: string
  assessmentId: string | null
  branchRef?: string | null
  updatedAt?: string
  prNumber: number
  sourceSha: string | null
  state: string
  conclusion: string | null
  appId: string | null
  htmlUrl: string | null
  verifiedAt: string | null
  createdAt: string
}
type Page = { enabled: boolean; hasMore: boolean; publications: Publication[] }
type Preview = {
  previewHash: string
  prNumber: number
  assessmentId: string
  sourceSha: string
  appId: string
  name: string
  conclusion: string
  gateStatus: string
  output: { title: string; summary: string }
  enabled: boolean
}
async function request<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    cache: 'no-store',
    signal: signal ?? AbortSignal.timeout(40_000),
    ...(body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      message?: string
    } | null
    throw new Error(
      typeof data?.message === 'string'
        ? data.message
        : 'The readiness check could not be loaded. Try again.'
    )
  }
  return response.json() as Promise<T>
}
export function CheckPublications({
  repositoryId,
  actorId,
  canRead,
  canPublish,
}: {
  repositoryId: string
  actorId?: string
  canRead: boolean
  canPublish: boolean
}) {
  const [page, setPage] = useState(1)
  const [manual, setManual] = useState(false)
  const [pr, setPr] = useState('')
  const [assessmentId, setAssessmentId] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const root = `/github/repositories/${repositoryId}/check-publications`
  const history = useQuery({
    queryKey: ['check-publications', actorId, root, page],
    queryFn: ({ signal }) =>
      request<Page>(`${root}/results?page=${page}`, undefined, signal),
    enabled: canRead,
    retry: false,
  })
  const assessments = useQuery({
    queryKey: ['check-publication-assessments', actorId, repositoryId],
    queryFn: ({ signal }) =>
      request<{
        assessments: { id: string; sourceSha: string; createdAt: string }[]
      }>(`/github/repositories/${repositoryId}/assessments`, undefined, signal),
    enabled: canRead && canPublish && manual,
    retry: false,
  })
  const review = async () => {
    setBusy(true)
    setError('')
    setMessage('')
    setPreview(null)
    try {
      setPreview(
        await request<Preview>(
          `${root}/preview?${new URLSearchParams({ pr, assessmentId })}`
        )
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed.')
    } finally {
      setBusy(false)
    }
  }
  const publish = async () => {
    if (!preview || !canPublish || !preview.enabled) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await request(root, {
        prNumber: preview.prNumber,
        assessmentId: preview.assessmentId,
        expectedPreviewHash: preview.previewHash,
      })
      toast.success('PR check published and verified on GitHub')
      setManual(false)
      setPreview(null)
      setPage(1)
      void history.refetch()
    } catch (err) {
      setPreview(null)
      setError(
        err instanceof Error
          ? err.message
          : 'Publication could not be verified. Refresh history before retrying.'
      )
      void history.refetch()
    } finally {
      setBusy(false)
    }
  }
  if (!canRead)
    return (
      <p role='alert' className='rounded-xl border p-4 text-sm'>
        You need policy read access for this repository.
      </p>
    )
  return (
    <>
      <Card className='gap-4'>
        <CardHeader className='flex flex-row flex-wrap items-center justify-between gap-3'>
          <div className='flex items-center gap-3'>
            <SurfaceIcon icon={ShieldCheck} tone='blue' />
            <CardTitle>PR checks</CardTitle>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Button
              variant='outline'
              size='sm'
              disabled={history.isFetching || busy}
              onClick={() => void history.refetch()}
            >
              <RefreshCw className='size-4' />
              Refresh
            </Button>
            {canPublish && history.data?.enabled && !history.isError && (
              <Button
                size='sm'
                variant='outline'
                onClick={() => {
                  setError('')
                  setMessage('')
                  setPreview(null)
                  setManual(true)
                }}
              >
                Publish check
              </Button>
            )}
            <PageHelpDrawer
              title='PR checks'
              sections={[
                {
                  title: 'What this list shows',
                  content:
                    'The latest Preflyt check for each pull request, from automatic or manual publishing. This is not a list of every GitHub build or test. Open the PR number to read its saved assessment, or View on GitHub to see the published check. Target branch is shown when recorded; a dash means it is unavailable.',
                },
                {
                  title: 'Publishing and merge protection',
                  content:
                    'Configure automatic publishing per repository in Settings → PR checks. Deployment administrators must enable check publication and automatic publication; the GitHub App needs Checks: write. A published check blocks merging only when required by GitHub branch rules. Missing or unverified evidence never becomes a passed check.',
                },
              ]}
            />
          </div>
        </CardHeader>
        <CardContent className='space-y-4'>
          {history.isPending ? (
            <Skeleton className='h-32' />
          ) : history.isError ? (
            <p role='alert' className='text-sm text-destructive'>
              {history.error.message}
            </p>
          ) : (
            history.data && (
              <>
                {!history.data.enabled && (
                  <div className='flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3'>
                    <p className='text-sm text-muted-foreground'>
                      Preflyt checks are not being published to GitHub.{' '}
                      {canPublish
                        ? 'Configure publishing in Settings.'
                        : 'Ask your administrator to enable publishing.'}
                    </p>
                    {canPublish && (
                      <Button size='sm' variant='outline' asChild>
                        <Link
                          to='/organization-settings'
                          search={{ tab: 'pr-checks' }}
                        >
                          Open settings
                        </Link>
                      </Button>
                    )}
                  </div>
                )}
                {history.data.publications.length ? (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Pull request</TableHead>
                          <TableHead>Target branch</TableHead>
                          <TableHead>GitHub status</TableHead>
                          <TableHead>Preflyt result</TableHead>
                          <TableHead>Last updated</TableHead>
                          <TableHead className='text-right'>Links</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {history.data.publications.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              {item.assessmentId ? (
                                <Link
                                  to='/assessments'
                                  search={{
                                    repository: repositoryId,
                                    assessment: item.assessmentId,
                                  }}
                                  className='font-medium text-primary hover:underline'
                                >
                                  #{item.prNumber}
                                </Link>
                              ) : (
                                <span className='font-medium'>
                                  #{item.prNumber}
                                </span>
                              )}
                              <code className='block text-xs text-muted-foreground'>
                                {item.sourceSha?.slice(0, 7) ??
                                  'Commit pending'}
                              </code>
                            </TableCell>
                            <TableCell>
                              {item.branchRef?.replace(/^refs\/heads\//, '') ??
                                '—'}
                            </TableCell>
                            <TableCell>
                              <StatusBadge
                                tone={
                                  item.state === 'PUBLISHED'
                                    ? 'success'
                                    : item.state === 'UNKNOWN'
                                      ? 'warning'
                                      : 'neutral'
                                }
                              >
                                {item.state === 'PUBLISHED'
                                  ? 'Published'
                                  : item.state === 'UNKNOWN'
                                    ? 'Needs verification'
                                    : item.state === 'DISABLED'
                                      ? 'Disabled'
                                      : 'In progress'}
                              </StatusBadge>
                            </TableCell>
                            <TableCell>
                              <StatusBadge
                                tone={
                                  item.state === 'PUBLISHED' &&
                                  item.conclusion === 'success'
                                    ? 'success'
                                    : item.state === 'PUBLISHED' &&
                                        item.conclusion === 'failure'
                                      ? 'error'
                                      : 'warning'
                                }
                              >
                                {item.state === 'PUBLISHED' &&
                                item.conclusion === 'success'
                                  ? 'Passed'
                                  : item.state === 'PUBLISHED' &&
                                      item.conclusion === 'failure'
                                    ? 'Failed'
                                    : item.state === 'PUBLISHED'
                                      ? 'Incomplete'
                                      : 'Not evaluated'}
                              </StatusBadge>
                            </TableCell>
                            <TableCell className='text-xs text-muted-foreground'>
                              {item.updatedAt
                                ? new Date(item.updatedAt).toLocaleString()
                                : '—'}
                            </TableCell>
                            <TableCell className='text-right'>
                              {item.htmlUrl && (
                                <Button size='sm' variant='ghost' asChild>
                                  <a
                                    href={item.htmlUrl}
                                    target='_blank'
                                    rel='noreferrer'
                                  >
                                    View on GitHub
                                    <ArrowUpRight className='size-4' />
                                  </a>
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {(page > 1 || history.data.hasMore) && (
                      <div className='flex items-center justify-between border-t pt-3'>
                        <span className='text-xs text-muted-foreground'>
                          Page {page}
                        </span>
                        <div className='flex gap-2'>
                          <Button
                            size='sm'
                            variant='outline'
                            disabled={page === 1 || history.isFetching}
                            onClick={() => setPage(page - 1)}
                          >
                            <ChevronLeft className='size-4' />
                            Previous
                          </Button>
                          <Button
                            size='sm'
                            variant='outline'
                            disabled={
                              !history.data.hasMore ||
                              history.isFetching ||
                              page >= 1000
                            }
                            onClick={() => setPage(page + 1)}
                          >
                            Next
                            <ChevronRight className='size-4' />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  history.data.enabled && (
                    <div className='space-y-3 py-6 text-center'>
                      <p className='text-sm text-muted-foreground'>
                        No Preflyt checks published yet.
                      </p>
                      <Button size='sm' variant='outline' asChild>
                        <Link
                          to='/assessments'
                          search={{ repository: repositoryId }}
                        >
                          View assessments
                        </Link>
                      </Button>
                    </div>
                  )
                )}
              </>
            )
          )}
        </CardContent>
      </Card>
      <Dialog
        open={manual}
        onOpenChange={(open) => {
          if (!busy) setManual(open)
        }}
      >
        <DialogContent className='max-h-[85dvh] overflow-y-auto sm:max-w-2xl'>
          <DialogHeader>
            <DialogTitle>Publish PR check</DialogTitle>
            <DialogDescription>
              Review the result for this PR’s current commit before publishing
              it to GitHub.
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4'>
            {error && (
              <p
                role='alert'
                className='rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm'
              >
                {error}
              </p>
            )}
            {message && (
              <p role='status' className='text-sm text-success'>
                {message}
              </p>
            )}
            {assessments.isPending ? (
              <Skeleton className='h-20' />
            ) : assessments.isError ? (
              <p role='alert' className='text-sm'>
                {assessments.error.message}
              </p>
            ) : (
              <>
                <div className='grid items-end gap-4 sm:grid-cols-[8rem_1fr_auto]'>
                  <div className='space-y-2'>
                    <Label htmlFor='publication-pr'>Pull request</Label>
                    <Input
                      id='publication-pr'
                      inputMode='numeric'
                      placeholder='PR number'
                      value={pr}
                      disabled={busy}
                      onChange={(e) => {
                        setPr(e.target.value)
                        setPreview(null)
                        setMessage('')
                      }}
                    />
                  </div>
                  <div className='min-w-0 space-y-2'>
                    <Label htmlFor='publication-assessment'>
                      Saved assessment
                    </Label>
                    <Select
                      value={assessmentId}
                      disabled={busy || !assessments.data?.assessments.length}
                      onValueChange={(value) => {
                        setAssessmentId(value)
                        setPreview(null)
                        setMessage('')
                      }}
                    >
                      <SelectTrigger
                        id='publication-assessment'
                        className='w-full'
                      >
                        <SelectValue placeholder='Choose an assessment' />
                      </SelectTrigger>
                      <SelectContent>
                        {assessments.data?.assessments.map((assessment) => (
                          <SelectItem key={assessment.id} value={assessment.id}>
                            {assessment.sourceSha.slice(0, 7)} ·{' '}
                            {new Date(assessment.createdAt).toLocaleString()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant='outline'
                    disabled={
                      busy || !/^[1-9]\d{0,9}$/.test(pr) || !assessmentId
                    }
                    onClick={() => void review()}
                  >
                    {busy ? 'Checking…' : 'Review check'}
                  </Button>
                </div>
                {!assessments.data?.assessments.length && (
                  <p className='text-sm text-muted-foreground'>
                    No saved assessments. Create an assessment for the current
                    PR commit first.
                  </p>
                )}
              </>
            )}
            <Button variant='ghost' size='sm' asChild>
              <Link
                to='/repositories/$repositoryId'
                params={{ repositoryId }}
                search={{ tab: 'assessments' }}
              >
                View assessments
                <ArrowUpRight className='size-4' />
              </Link>
            </Button>
            {preview && (
              <section className='space-y-4 rounded-xl border p-4'>
                <div className='flex flex-wrap items-center justify-between gap-3'>
                  <h3 className='text-sm font-semibold'>{preview.name}</h3>
                  <StatusBadge
                    tone={
                      preview.conclusion === 'success'
                        ? 'success'
                        : preview.conclusion === 'failure'
                          ? 'error'
                          : 'warning'
                    }
                  >
                    {preview.conclusion === 'success'
                      ? 'Passed'
                      : preview.conclusion === 'failure'
                        ? 'Failure'
                        : 'Action required'}
                  </StatusBadge>
                </div>
                <dl className='grid gap-4 text-sm sm:grid-cols-3'>
                  <div>
                    <dt className='text-muted-foreground'>Pull request</dt>
                    <dd>#{preview.prNumber}</dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground'>Exact commit</dt>
                    <dd className='font-mono text-xs break-all'>
                      {preview.sourceSha}
                    </dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground'>GitHub App ID</dt>
                    <dd>{preview.appId}</dd>
                  </div>
                </dl>
                <div className='max-h-64 overflow-auto rounded-lg bg-muted/30 p-3 text-xs whitespace-pre-wrap'>
                  {preview.output.summary}
                </div>
                {canPublish ? (
                  <Button
                    disabled={busy || !preview.enabled}
                    onClick={() => void publish()}
                  >
                    {busy ? 'Publishing…' : 'Publish readiness check'}
                  </Button>
                ) : (
                  <p className='text-sm text-muted-foreground'>
                    A policy publisher can publish this reviewed check.
                  </p>
                )}
              </section>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
