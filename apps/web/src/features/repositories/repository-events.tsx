import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type Delivery = {
  id: string
  event: string
  action: string
  sourceSha: string
  sourceObjectId: string
  sourceNumber: number | null
  sourceStatus: string | null
  sourceConclusion: string | null
  state: 'RECEIVED' | 'PROCESSED' | 'IGNORED' | 'FAILED'
  reason: string | null
  receivedAt: string
}
type Events = { enabled: boolean; deliveries: Delivery[] }
const states = {
  RECEIVED: 'Awaiting worker',
  PROCESSED: 'Recorded',
  IGNORED: 'Access changed',
  FAILED: 'Processing failed',
}
const sources: Record<string, string> = {
  pull_request: 'Pull request',
  workflow_run: 'Workflow run',
  check_run: 'Check run',
}

export function RepositoryEvents({ repositoryId }: { repositoryId: string }) {
  const query = useQuery<Events>({
    queryKey: ['repository-events', repositoryId],
    retry: false,
    refetchInterval: (query) => (query.state.data?.enabled ? 10_000 : false),
    queryFn: async ({ signal }): Promise<Events> => {
      const response = await fetch(
        `${API_BASE_URL}/github/repositories/${encodeURIComponent(repositoryId)}/events`,
        {
          credentials: 'include',
          signal,
        }
      )
      if (!response.ok)
        throw new Error(
          response.status === 403
            ? 'Repository selection or access changed. Reload the profile.'
            : 'Could not load GitHub events. Try again.'
        )
      return response.json() as Promise<Events>
    },
  })
  return (
    <Card className='mb-6'>
      <CardHeader className='flex flex-row items-start justify-between gap-4'>
        <div>
          <CardTitle>Pull request and CI events</CardTitle>
          <CardDescription className='mt-2'>
            Recent GitHub deliveries at their reported commit revisions.
          </CardDescription>
        </div>
        <Button
          variant='outline'
          size='icon'
          aria-label='Refresh GitHub events'
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw className={query.isFetching ? 'animate-spin' : ''} />
        </Button>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <p role='status' className='text-sm text-muted-foreground'>
            Loading GitHub events…
          </p>
        ) : query.isError ? (
          <p role='alert' className='text-sm text-destructive'>
            {query.error.message}
          </p>
        ) : (
          <>
            {!query.data.enabled && (
              <p className='mb-3 text-sm text-muted-foreground'>
                GitHub event collection is not configured for this deployment.
              </p>
            )}
            {query.data.deliveries.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                No pull request or CI events have been received for this
                selected repository.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Commit</TableHead>
                    <TableHead>GitHub state</TableHead>
                    <TableHead>Processing</TableHead>
                    <TableHead>Received</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.data.deliveries.map((delivery) => (
                    <TableRow key={delivery.id}>
                      <TableCell>
                        <p className='whitespace-nowrap'>
                          {sources[delivery.event] ?? delivery.event} #
                          {delivery.sourceNumber ?? delivery.sourceObjectId}
                        </p>
                        <p className='text-xs text-muted-foreground'>
                          {delivery.action}
                        </p>
                      </TableCell>
                      <TableCell>
                        <code className='text-xs' title={delivery.sourceSha}>
                          {delivery.sourceSha.slice(0, 12)}
                        </code>
                      </TableCell>
                      <TableCell>
                        {delivery.sourceConclusion ??
                          delivery.sourceStatus ??
                          'Unknown'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            delivery.state === 'FAILED'
                              ? 'destructive'
                              : 'secondary'
                          }
                        >
                          {states[delivery.state]}
                        </Badge>
                      </TableCell>
                      <TableCell className='text-xs whitespace-nowrap'>
                        {new Date(delivery.receivedAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
