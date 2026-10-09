import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  available: boolean
  settings: { enabled: boolean; revision: number }
  tasks: Task[]
  hasMore: boolean
}
export function ReadinessAutomation({
  repositoryId,
  actorId,
  canPublish,
}: {
  repositoryId: string
  actorId?: string
  canPublish: boolean
}) {
  const [page, setPage] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const root = `/github/repositories/${repositoryId}/check-automation`
  const query = useQuery({
    queryKey: ['readiness-automation', actorId, root, page],
    queryFn: ({ signal }) =>
      governanceRequest<Result>(`${root}?page=${page}`, undefined, signal),
    retry: false,
    refetchInterval: 15_000,
  })
  const toggle = async () => {
    if (!query.data) return
    setBusy(true)
    setError('')
    try {
      await governanceRequest(root, {
        enabled: !query.data.settings.enabled,
        expectedRevision: query.data.settings.revision,
      })
      await query.refetch()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Settings could not be saved')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className='gap-4'>
      <CardHeader className='flex flex-wrap items-center justify-between gap-3'>
        <CardTitle>Automatic PR checks</CardTitle>
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
          {canPublish && (
            <Button
              size='sm'
              disabled={
                busy ||
                !query.data ||
                (!query.data.available && !query.data.settings.enabled)
              }
              onClick={() => void toggle()}
            >
              {query.data?.settings.enabled
                ? 'Disable checks'
                : 'Enable checks'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        <StatusBadge
          tone={query.data?.settings.enabled ? 'success' : 'neutral'}
        >
          {query.data?.settings.enabled ? 'Enabled' : 'Disabled'}
        </StatusBadge>
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
        {query.isPending ? (
          <p role='status'>Loading checks…</p>
        ) : (
          !query.isError &&
          query.data && (
            <>
              <Table>
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
              <div className='flex items-center justify-between border-t pt-4'>
                <span className='text-xs text-muted-foreground'>
                  Page {page}
                </span>
                <div className='flex gap-2'>
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={page === 1 || query.isFetching}
                    onClick={() => setPage(page - 1)}
                  >
                    <ChevronLeft className='size-4' />
                    Previous
                  </Button>
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={
                      !query.data.hasMore || query.isFetching || page >= 1000
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
  )
}
