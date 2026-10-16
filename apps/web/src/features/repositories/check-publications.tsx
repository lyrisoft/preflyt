import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight, RefreshCw, ShieldCheck } from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { ResultTimestamp } from '@/components/result-timestamp'
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
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const root = `/github/repositories/${repositoryId}/check-publications`
  const history = useQuery({
    queryKey: ['check-publications', actorId, root, page, pageSize],
    queryFn: ({ signal }) =>
      request<Page>(
        `${root}/results?page=${page}&pageSize=${pageSize}`,
        undefined,
        signal
      ),
    enabled: canRead,
    retry: false,
  })
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
              disabled={history.isFetching}
              onClick={() => void history.refetch()}
            >
              <RefreshCw className='size-4' />
              Refresh
            </Button>
            <PageHelpDrawer
              title='PR checks'
              sections={[
                {
                  title: 'What this list shows',
                  content:
                    'The latest Preflyt check for each pull request, published automatically after workflow verification. This is not a list of every GitHub build or test. Open the PR number to read its saved assessment, or View on GitHub to see the published check. Target branch is shown when recorded; a dash means it is unavailable.',
                },
                {
                  title: 'Publishing and merge protection',
                  content:
                    'Configure automatic publishing per repository in Settings → PR feedback. Deployment administrators must enable check publication and automatic publication; the GitHub App needs Checks: write. A published check blocks merging only when required by GitHub branch rules. Missing or unverified evidence never becomes a passed check.',
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
                    <Table
                      pagination={{
                        page,
                        pageSize,
                        hasNext: history.data?.hasMore,
                        onPageChange: setPage,
                        onPageSizeChange: (size) => {
                          setPageSize(size)
                          setPage(1)
                        },
                      }}
                    >
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
                              <ResultTimestamp value={item.updatedAt} stacked />
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
    </>
  )
}
