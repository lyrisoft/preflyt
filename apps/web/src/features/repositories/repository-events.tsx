import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
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
import { StatusBadge } from '@/components/status-badge'
import { RelativeTime } from './relative-time'
import {
  deliveryStatus,
  sentence,
  sourceLabel,
  type DeliveryState,
} from './repository-vocabulary'

type Delivery = {
  id: string
  event: string
  action: string
  sourceSha: string
  sourceObjectId: string
  sourceNumber: number | null
  sourceStatus: string | null
  sourceConclusion: string | null
  state: DeliveryState
  reason: string | null
  receivedAt: string
}
type Events = { enabled: boolean; deliveries: Delivery[] }
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
    <Card className='gap-4'>
      <CardHeader>
        <CardTitle>Pull request and CI events</CardTitle>
        <CardDescription>
          Recent GitHub deliveries at their reported commit revisions.
        </CardDescription>
        <CardAction>
          <Button
            variant='outline'
            size='icon'
            className='size-8'
            aria-label='Refresh GitHub events'
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw className={query.isFetching ? 'animate-spin' : ''} />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className='px-0'>
        {query.isPending ? (
          <p role='status' className='px-6 text-sm text-muted-foreground'>
            Loading GitHub events…
          </p>
        ) : query.isError ? (
          <p role='alert' className='px-6 text-sm text-destructive'>
            {query.error.message}
          </p>
        ) : (
          <>
            {!query.data.enabled && (
              <p className='mb-3 px-6 text-sm text-muted-foreground'>
                GitHub event collection is not configured for this deployment.
              </p>
            )}
            {query.data.deliveries.length === 0 ? (
              <p className='px-6 text-sm text-muted-foreground'>
                No pull request or CI events received yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className='ps-6'>Source</TableHead>
                    <TableHead>Commit</TableHead>
                    <TableHead>GitHub state</TableHead>
                    <TableHead>Processing</TableHead>
                    <TableHead className='pe-6'>Received</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.data.deliveries.map((delivery) => (
                    <TableRow key={delivery.id}>
                      <TableCell className='ps-6'>
                        <p className='font-medium whitespace-nowrap'>
                          {sourceLabel(
                            delivery.event,
                            delivery.sourceNumber ?? delivery.sourceObjectId
                          )}
                        </p>
                        <p className='text-xs text-muted-foreground'>
                          {sentence(delivery.action)}
                        </p>
                      </TableCell>
                      <TableCell>
                        <code className='text-xs' title={delivery.sourceSha}>
                          {delivery.sourceSha.slice(0, 7)}
                        </code>
                      </TableCell>
                      <TableCell className='text-sm'>
                        {(delivery.sourceConclusion ??
                        delivery.sourceStatus) ? (
                          sentence(
                            (delivery.sourceConclusion ??
                              delivery.sourceStatus)!
                          )
                        ) : (
                          <span className='text-muted-foreground'>
                            Not reported
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={deliveryStatus[delivery.state].tone}>
                          {deliveryStatus[delivery.state].label}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className='pe-6 text-xs whitespace-nowrap text-muted-foreground'>
                        <RelativeTime value={delivery.receivedAt} />
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
