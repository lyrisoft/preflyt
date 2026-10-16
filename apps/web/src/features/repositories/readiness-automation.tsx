import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { governanceRequest } from './governance-api'

type Task = {
  id: string
  prNumber: number
  sourceSha: string | null
  state: string
  conclusion: string | null
  htmlUrl: string | null
  message: string | null
  verifiedAt: string | null
}
type Result = {
  repositories?: { id: string; result: Result }[]
  available: boolean
  settings: {
    enabled: boolean
    revision: number
    pipelineComments?: boolean
    aiReviews?: boolean
  }
  tasks: Task[]
  hasMore: boolean
}
export function ReadinessAutomation({
  repositoryId,
  repositoryIds,
  actorId,
  canPublish,
  settingsOnly = false,
  canReview = false,
}: {
  repositoryId: string
  repositoryIds?: string[]
  actorId?: string
  canPublish: boolean
  settingsOnly?: boolean
  canReview?: boolean
}) {
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const root = `/github/repositories/${repositoryId}/check-automation`
  const query = useQuery({
    queryKey: [
      'readiness-automation',
      actorId,
      root,
      repositoryIds?.join(','),
      page,
      pageSize,
    ],
    queryFn: async ({ signal }): Promise<Result> => {
      if (!repositoryIds)
        return governanceRequest<Result>(
          `${root}?page=${page}&pageSize=${pageSize}`,
          undefined,
          signal
        )
      const rows: { id: string; result: Result }[] = []
      // Bound concurrent requests for organizations with large inventories.
      for (let offset = 0; offset < repositoryIds.length; offset += 5) {
        rows.push(
          ...(await Promise.all(
            repositoryIds.slice(offset, offset + 5).map(async (id) => ({
              id,
              result: await governanceRequest<Result>(
                `/github/repositories/${id}/check-automation`,
                undefined,
                signal
              ),
            }))
          ))
        )
      }
      return {
        available: rows.every((row) => row.result.available),
        settings: {
          enabled: rows.every((row) => row.result.settings.enabled),
          revision: 0,
          pipelineComments: rows.every(
            (row) => row.result.settings.pipelineComments
          ),
          aiReviews: rows.every((row) => row.result.settings.aiReviews),
        },
        repositories: rows,
        tasks: [],
        hasMore: false,
      }
    },
    retry: false,
    refetchInterval: settingsOnly ? false : 15_000,
  })
  const toggle = async (change?: {
    pipelineComments?: boolean
    aiReviews?: boolean
  }) => {
    if (!query.data) return
    setBusy(true)
    setError('')
    try {
      const rows = query.data.repositories ?? [
        { id: repositoryId, result: query.data },
      ]
      const failures: string[] = []
      for (const row of rows) {
        try {
          await governanceRequest(
            `/github/repositories/${row.id}/check-automation`,
            {
              enabled:
                change === undefined
                  ? !query.data.settings.enabled
                  : row.result.settings.enabled,
              ...change,
              expectedRevision: row.result.settings.revision,
            }
          )
        } catch (e) {
          failures.push(
            e instanceof Error ? e.message : 'Settings could not be saved'
          )
        }
      }
      await query.refetch()
      if (failures.length)
        throw new Error(
          `${rows.length - failures.length} of ${rows.length} repositories updated. ${failures[0]}`
        )
      toast.success(
        change !== undefined
          ? 'PR feedback preference saved'
          : query.data.settings.enabled
            ? 'PR checks disabled'
            : 'PR checks enabled'
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Settings could not be saved')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className='gap-4'>
      <CardHeader className='flex flex-wrap items-center justify-between gap-3'>
        <CardTitle>{settingsOnly ? 'PR feedback' : 'PR checks'}</CardTitle>
        <div className='flex gap-2'>
          <Button
            variant='outline'
            size='sm'
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw className='size-4' />
            Refresh
          </Button>
          {canPublish && settingsOnly && (
            <Button
              size='sm'
              disabled={
                busy ||
                query.isError ||
                !query.data ||
                (!query.data.available && !query.data.settings.enabled)
              }
              onClick={() => void toggle()}
            >
              {repositoryIds
                ? query.data?.settings.enabled
                  ? 'Disable checks for all'
                  : 'Enable checks for all'
                : query.data?.settings.enabled
                  ? 'Disable checks'
                  : 'Enable checks'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        {repositoryIds && query.data?.repositories && (
          <p className='text-xs text-muted-foreground'>
            {query.data.repositories.length} connected repositories
          </p>
        )}
        {!settingsOnly && (
          <Link
            to='/organization-settings'
            search={{ tab: 'pr-checks' }}
            className='text-sm underline'
          >
            PR feedback settings
          </Link>
        )}
        {settingsOnly && query.data && !query.isError && (
          <label className='flex items-center justify-between gap-3 text-sm'>
            <span>
              Post a policy summary comment on the PR
              {query.data.repositories && (
                <span className='ml-2 text-xs text-muted-foreground'>
                  {
                    query.data.repositories.filter(
                      (r) => r.result.settings.pipelineComments
                    ).length
                  }{' '}
                  of {query.data.repositories.length} enabled
                </span>
              )}
            </span>
            <Switch
              checked={query.data.settings.pipelineComments ?? false}
              disabled={!canPublish || busy}
              onCheckedChange={(value) =>
                void toggle({ pipelineComments: value })
              }
            />
          </label>
        )}
        {settingsOnly && query.data && !query.isError && canReview && (
          <label className='flex items-center justify-between gap-3 text-sm'>
            <span>
              Review changed code with AI and comment on PRs
              {query.data.repositories && (
                <span className='ml-2 text-xs text-muted-foreground'>
                  {
                    query.data.repositories.filter(
                      (r) => r.result.settings.aiReviews
                    ).length
                  }{' '}
                  of {query.data.repositories.length} enabled
                </span>
              )}
            </span>
            <Switch
              checked={query.data.settings.aiReviews ?? false}
              disabled={busy}
              onCheckedChange={(value) => void toggle({ aiReviews: value })}
            />
          </label>
        )}
        {query.isPending ? (
          <p role='status'>Loading publishing settings…</p>
        ) : (
          !query.isError &&
          (query.data?.repositories ? (
            <p className='text-sm text-muted-foreground'>
              {
                query.data.repositories.filter((r) => r.result.settings.enabled)
                  .length
              }{' '}
              of {query.data.repositories.length} repositories have PR checks
              enabled.
            </p>
          ) : (
            <StatusBadge
              tone={query.data?.settings.enabled ? 'success' : 'neutral'}
            >
              {query.data?.settings.enabled ? 'Enabled' : 'Disabled'}
            </StatusBadge>
          ))
        )}
        {!query.data?.available && !query.isError && query.data && (
          <p className='text-sm text-muted-foreground'>
            Automatic publication is not enabled in this deployment.
          </p>
        )}
        {(error || query.isError) && (
          <p role='alert' className='text-sm text-destructive'>
            {error || query.error?.message}
          </p>
        )}
        {settingsOnly ? null : query.isPending ? (
          <p role='status'>Loading checks…</p>
        ) : (
          !query.isError &&
          query.data && (
            <>
              <Table
                pagination={
                  repositoryIds
                    ? undefined
                    : {
                        page,
                        pageSize,
                        hasNext: query.data?.hasMore,
                        onPageChange: setPage,
                        onPageSizeChange: (size) => {
                          setPageSize(size)
                          setPage(1)
                        },
                      }
                }
              >
                <TableHeader>
                  <TableRow>
                    <TableHead>Pull request</TableHead>
                    <TableHead>Commit</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Last verified</TableHead>
                    <TableHead className='text-right'>GitHub</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.data.tasks.map((task) => (
                    <TableRow key={task.id}>
                      <TableCell>#{task.prNumber}</TableCell>
                      <TableCell>
                        <code className='text-xs'>
                          {task.sourceSha?.slice(0, 7) ?? 'Pending'}
                        </code>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          tone={
                            task.state === 'PUBLISHED'
                              ? task.conclusion === 'success'
                                ? 'success'
                                : task.conclusion === 'failure'
                                  ? 'error'
                                  : 'warning'
                              : task.state === 'UNKNOWN'
                                ? 'warning'
                                : 'neutral'
                          }
                        >
                          {task.state === 'PUBLISHED'
                            ? task.conclusion === 'success'
                              ? 'Passed'
                              : task.conclusion === 'failure'
                                ? 'Failed'
                                : 'Incomplete'
                            : task.state === 'PROCESSING'
                              ? 'Checking'
                              : task.state === 'UNKNOWN'
                                ? 'Needs verification'
                                : task.state === 'DISABLED'
                                  ? 'Inactive'
                                  : 'Incomplete'}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className='text-xs text-muted-foreground'>
                        {task.verifiedAt
                          ? new Date(task.verifiedAt).toLocaleString()
                          : 'Not verified'}
                      </TableCell>
                      <TableCell className='text-right'>
                        {task.htmlUrl && (
                          <Button variant='ghost' size='sm' asChild>
                            <a
                              href={task.htmlUrl}
                              target='_blank'
                              rel='noreferrer'
                            >
                              View check
                            </a>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!query.data.tasks.length && (
                <p className='p-6 text-center text-sm text-muted-foreground'>
                  No eligible pull requests have been found yet.
                </p>
              )}
            </>
          )
        )}
      </CardContent>
    </Card>
  )
}
