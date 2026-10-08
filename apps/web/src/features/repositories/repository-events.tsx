import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ChevronDown,
  CircleCheck,
  Clock3,
  GitCommitHorizontal,
  GitPullRequest,
  Radio,
  RefreshCw,
  Workflow,
} from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { StatusBadge } from '@/components/status-badge'
import { RelativeTime } from './relative-time'
import {
  deliveryStatus,
  sentence,
  sourceLabel,
  toneFill,
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
const stateOrder: DeliveryState[] = [
  'PROCESSED',
  'RECEIVED',
  'IGNORED',
  'FAILED',
]

function DeliveryTimelineItem({
  delivery,
  last,
}: {
  delivery: Delivery
  last: boolean
}) {
  const Icon =
    delivery.event === 'pull_request'
      ? GitPullRequest
      : delivery.event === 'workflow_run'
        ? Workflow
        : CircleCheck
  const status = deliveryStatus[delivery.state]
  const providerState = delivery.sourceConclusion ?? delivery.sourceStatus
  return (
    <li className='relative flex gap-4 px-6 py-4'>
      {!last && (
        <span
          aria-hidden='true'
          className='absolute start-[2.375rem] top-12 bottom-0 w-px bg-border'
        />
      )}
      <span className='relative z-10 flex size-8 shrink-0 items-center justify-center rounded-lg border border-info/20 bg-info/10 text-info-text'>
        <Icon className='size-4' />
      </span>
      <div className='min-w-0 flex-1'>
        <div className='flex flex-wrap items-center justify-between gap-x-4 gap-y-2'>
          <div className='flex min-w-0 flex-wrap items-center gap-2'>
            <h3 className='text-sm font-medium'>
              {sourceLabel(
                delivery.event,
                delivery.sourceNumber ?? delivery.sourceObjectId
              )}
            </h3>
            <span className='text-xs text-muted-foreground'>
              {sentence(delivery.action)}
            </span>
          </div>
          <div className='flex items-center gap-3'>
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            <span className='text-xs whitespace-nowrap text-muted-foreground'>
              <RelativeTime value={delivery.receivedAt} />
            </span>
          </div>
        </div>
        <div className='mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground'>
          <span className='inline-flex items-center gap-1.5'>
            <GitCommitHorizontal className='size-3.5' />
            <code title={delivery.sourceSha}>
              {delivery.sourceSha.slice(0, 7)}
            </code>
          </span>
          {providerState && <span>GitHub · {sentence(providerState)}</span>}
          {delivery.state === 'FAILED' && (
            <span className='inline-flex items-center gap-1.5 text-danger-text'>
              <AlertTriangle className='size-3.5' />
              Review processing details
            </span>
          )}
        </div>
        <details className='group mt-2'>
          <summary className='inline-flex cursor-pointer list-none items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden'>
            Delivery details
            <ChevronDown className='size-3 transition-transform group-open:rotate-180' />
          </summary>
          <dl className='mt-3 grid gap-x-4 gap-y-2 rounded-lg border bg-muted/20 p-3 text-xs sm:grid-cols-[max-content_1fr]'>
            <dt className='text-muted-foreground'>Delivery ID</dt>
            <dd className='font-mono break-all'>{delivery.id}</dd>
            <dt className='text-muted-foreground'>Commit</dt>
            <dd className='font-mono break-all'>{delivery.sourceSha}</dd>
            <dt className='text-muted-foreground'>Received</dt>
            <dd>{new Date(delivery.receivedAt).toLocaleString()}</dd>
            <dt className='text-muted-foreground'>GitHub status</dt>
            <dd>
              {delivery.sourceStatus
                ? sentence(delivery.sourceStatus)
                : 'Not reported'}
            </dd>
            <dt className='text-muted-foreground'>GitHub conclusion</dt>
            <dd>
              {delivery.sourceConclusion
                ? sentence(delivery.sourceConclusion)
                : 'Not reported'}
            </dd>
            {delivery.reason && (
              <>
                <dt className='text-muted-foreground'>Processing reason</dt>
                <dd className='break-words'>{sentence(delivery.reason)}</dd>
              </>
            )}
          </dl>
        </details>
      </div>
    </li>
  )
}

export function RepositoryEvents({ repositoryId }: { repositoryId: string }) {
  const query = useQuery<Events>({
    queryKey: ['repository-events', repositoryId],
    retry: false,
    refetchInterval: (query) => (query.state.data?.enabled ? 10_000 : false),
    queryFn: async ({ signal }): Promise<Events> => {
      const response = await fetch(
        `${API_BASE_URL}/github/repositories/${encodeURIComponent(repositoryId)}/events`,
        { credentials: 'include', signal }
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
  const deliveries = query.data?.deliveries ?? []
  const counts = stateOrder.map((state) => ({
    state,
    count: deliveries.filter((delivery) => delivery.state === state).length,
  }))
  return (
    <Card className='gap-4'>
      <CardHeader>
        <CardTitle asChild>
          <h2>Delivery timeline</h2>
        </CardTitle>
        <CardDescription>
          Signed GitHub events and worker processing.
        </CardDescription>
        <CardAction>
          <Button
            variant='outline'
            size='icon'
            className='touch-target size-8'
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
        ) : deliveries.length === 0 ? (
          <div className='mx-6 flex items-center gap-4 rounded-lg border border-dashed bg-muted/10 p-5'>
            <span className='flex size-10 shrink-0 items-center justify-center rounded-full border text-muted-foreground'>
              {query.data.enabled ? (
                <Clock3 className='size-5' />
              ) : (
                <Radio className='size-5' />
              )}
            </span>
            <div>
              <h3 className='text-sm font-medium'>
                {query.data.enabled
                  ? 'Waiting for repository events'
                  : 'Event collection is offline'}
              </h3>
              <p className='mt-1 text-xs text-muted-foreground'>
                {query.data.enabled
                  ? 'Pull request updates and CI deliveries will appear here as they arrive.'
                  : 'The timeline starts when signed webhooks and the worker are enabled.'}
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className='mx-6 mb-2 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border bg-muted/10 px-4 py-3 text-xs'>
              {counts.map(({ state, count }) => (
                <span key={state} className='inline-flex items-center gap-2'>
                  <span
                    className={cn(
                      'size-2 rounded-full',
                      toneFill[deliveryStatus[state].tone]
                    )}
                  />
                  <span className='text-muted-foreground'>
                    {deliveryStatus[state].label}
                  </span>
                  <strong className='font-semibold tabular-nums'>
                    {count}
                  </strong>
                </span>
              ))}
              {!query.data.enabled && (
                <span className='text-warning-text'>Collection paused</span>
              )}
            </div>
            <ol>
              {[...deliveries]
                .sort(
                  (a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt)
                )
                .map((delivery, index) => (
                  <DeliveryTimelineItem
                    key={delivery.id}
                    delivery={delivery}
                    last={index === deliveries.length - 1}
                  />
                ))}
            </ol>
          </>
        )}
      </CardContent>
    </Card>
  )
}
