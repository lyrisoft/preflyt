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
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { StatusBadge } from '@/components/status-badge'
import { ReadinessAutomation } from './readiness-automation'

type Publication = {
  id: string
  assessmentId: string
  prNumber: number
  sourceSha: string
  state: string
  conclusion: string
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
      request<Page>(`${root}?page=${page}`, undefined, signal),
    enabled: canRead,
    retry: false,
  })
  const assessments = useQuery({
    queryKey: ['check-publication-assessments', actorId, repositoryId],
    queryFn: ({ signal }) =>
      request<{
        assessments: { id: string; sourceSha: string; createdAt: string }[]
      }>(`/github/repositories/${repositoryId}/assessments`, undefined, signal),
    enabled: canRead,
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
      setMessage('The readiness check was published and verified on GitHub.')
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
      <p role='alert' className='rounded-xl border p-5 text-sm'>
        You need policy read access for this repository.
      </p>
    )
  return (
    <div className='space-y-4'>
      <ReadinessAutomation
        repositoryId={repositoryId}
        actorId={actorId}
        canPublish={canPublish}
      />
      <Card className='gap-4'>
        <CardHeader className='flex flex-wrap items-center justify-between gap-3'>
          <div className='flex items-center gap-3'>
            <span className='flex size-10 items-center justify-center rounded-xl bg-info/10 text-info'>
              <ShieldCheck className='size-5' />
            </span>
            <CardTitle>GitHub readiness check</CardTitle>
          </div>
          <Button
            variant='outline'
            size='sm'
            disabled={busy || history.isFetching || assessments.isFetching}
            onClick={() => {
              setPreview(null)
              void history.refetch()
              void assessments.refetch()
            }}
          >
            <RefreshCw className='size-4' />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='flex flex-wrap gap-2'>
            <StatusBadge tone='info'>Published policy evaluation</StatusBadge>
          </div>
          <p className='rounded-lg border border-info/20 bg-info/5 p-3 text-sm'>
            Passing checks require a published policy, verified reports, and
            current GitHub workflow results. Missing evidence keeps the check
            incomplete.
          </p>
          {history.data && !history.data.enabled && (
            <p role='status' className='text-sm text-muted-foreground'>
              Publication is disabled in this deployment. Enable
              GITHUB_CHECK_PUBLICATION_ENABLED on the API and grant the GitHub
              App Checks: write permission.
            </p>
          )}
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
                  disabled={busy || !/^[1-9]\d{0,9}$/.test(pr) || !assessmentId}
                  onClick={() => void review()}
                >
                  {busy ? 'Checking…' : 'Review check'}
                </Button>
              </div>
              {!assessments.data?.assessments.length && (
                <p className='text-sm text-muted-foreground'>
                  No saved assessments. Create an assessment for the current PR
                  commit first.
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
                    preview.gateStatus === 'PASS_WITH_EXCEPTION'
                      ? 'warning'
                      : preview.conclusion === 'success'
                        ? 'success'
                        : preview.conclusion === 'failure'
                          ? 'error'
                          : 'warning'
                  }
                >
                  {preview.gateStatus === 'PASS_WITH_EXCEPTION'
                    ? 'Allowed with exception'
                    : preview.conclusion === 'success'
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
        </CardContent>
      </Card>
      <Card className='gap-4'>
        <CardHeader>
          <CardTitle>Publication history</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          {history.isPending ? (
            <Skeleton className='h-32' />
          ) : history.isError ? (
            <p role='alert' className='text-sm'>
              {history.error.message}
            </p>
          ) : (
            history.data && (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PR / commit</TableHead>
                      <TableHead>Publication</TableHead>
                      <TableHead>Conclusion</TableHead>
                      <TableHead>Verified at publication</TableHead>
                      <TableHead className='text-right'>Check</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.data.publications.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <p>#{item.prNumber}</p>
                          <code className='text-xs text-muted-foreground'>
                            {item.sourceSha.slice(0, 7)}
                          </code>
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            tone={
                              item.state === 'PUBLISHED'
                                ? 'info'
                                : item.state === 'UNKNOWN'
                                  ? 'warning'
                                  : 'neutral'
                            }
                          >
                            {item.state === 'PUBLISHED'
                              ? 'Published'
                              : item.state === 'UNKNOWN'
                                ? 'Needs verification'
                                : 'In progress'}
                          </StatusBadge>
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            tone={
                              item.conclusion === 'success'
                                ? 'success'
                                : item.conclusion === 'failure'
                                  ? 'error'
                                  : 'warning'
                            }
                          >
                            {item.conclusion === 'success'
                              ? 'Passed'
                              : item.conclusion === 'failure'
                                ? 'Failure'
                                : 'Action required'}
                          </StatusBadge>
                        </TableCell>
                        <TableCell className='text-xs text-muted-foreground'>
                          {item.verifiedAt
                            ? new Date(item.verifiedAt).toLocaleString()
                            : 'Not verified'}
                        </TableCell>
                        <TableCell className='text-right'>
                          {item.htmlUrl && (
                            <Button size='sm' variant='ghost' asChild>
                              <a
                                href={item.htmlUrl}
                                target='_blank'
                                rel='noreferrer'
                              >
                                GitHub
                                <ArrowUpRight className='size-4' />
                              </a>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {!history.data.publications.length && (
                  <p className='rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground'>
                    No checks published for this repository.
                  </p>
                )}
                <div className='flex flex-wrap items-center justify-between gap-3 border-t pt-4'>
                  <p className='text-xs text-muted-foreground'>
                    Page {page} · {history.data.publications.length}{' '}
                    publications
                  </p>
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
              </>
            )
          )}
        </CardContent>
      </Card>
    </div>
  )
}
