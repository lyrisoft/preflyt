import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Bell } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { StatusBadge } from '@/components/status-badge'
import {
  useInbox,
  useNotificationCount,
  titles,
  type Item,
} from './notification-query'

export function NotificationItem({
  item,
  onRead,
  busy,
}: {
  item: Item
  onRead: (id: string) => void
  busy: boolean
}) {
  return (
    <div
      className={cn(
        'flex gap-3 rounded-lg border p-4',
        !item.readAt && 'border-primary/25 bg-primary/5'
      )}
    >
      <span
        className={cn(
          'mt-1 size-2 shrink-0 rounded-full',
          item.severity === 'error'
            ? 'bg-red-500'
            : item.severity === 'warning'
              ? 'bg-amber-500'
              : 'bg-blue-500'
        )}
        aria-label={item.severity}
      />
      <div className='min-w-0 flex-1'>
        {item.type === 'AI_SECURITY_REVIEW_COMPLETED' &&
        item.healthAssessmentId ? (
          <Link
            to='/findings'
            search={{
              origin: 'health',
              source: 'health',
              health: item.healthAssessmentId,
              repository: item.repositoryId,
              category: 'security',
              kind: 'findings',
              page: 1,
            }}
            className='font-medium hover:underline'
          >
            {item.title ?? 'AI security review completed'}
            <span className='mt-1 block text-xs font-normal text-primary'>
              View review findings →
            </span>
          </Link>
        ) : item.type === 'AI_MODEL_UNAVAILABLE' ||
          item.type === 'AI_REVIEW_BUDGET_REACHED' ? (
          <Link
            to='/intelligence'
            search={{
              tab:
                item.type === 'AI_REVIEW_BUDGET_REACHED'
                  ? 'routing'
                  : 'connections',
            }}
            className='font-medium hover:underline'
          >
            {item.title ??
              titles[item.type] ??
              'AI configuration needs attention'}
            {item.actionLabel && (
              <span className='mt-1 block text-xs font-normal text-primary'>
                {item.actionLabel} →
              </span>
            )}
          </Link>
        ) : item.policyId || item.type.startsWith('POLICY_EXCEPTION_') ? (
          <Link
            to='/policies'
            search={{
              repository: item.repositoryId,
              policy: item.policyId ?? undefined,
            }}
            className='font-medium hover:underline'
          >
            {item.title ?? titles[item.type] ?? 'Policy update'}
            {item.actionLabel && (
              <span className='mt-1 block text-xs font-normal text-primary'>
                {item.actionLabel} →
              </span>
            )}
          </Link>
        ) : item.type.startsWith('READINESS_') ||
          item.type.startsWith('RULESET_') ? (
          <Link
            to='/quality-gates'
            search={{
              repository: item.repositoryId,
              gate: item.type.startsWith('READINESS_') ? 'checks' : 'rulesets',
            }}
            className='font-medium hover:underline'
          >
            {item.title ?? titles[item.type] ?? 'Merge review update'}
            {item.actionLabel && (
              <span className='mt-1 block text-xs font-normal text-primary'>
                {item.actionLabel} →
              </span>
            )}
          </Link>
        ) : (
          <Link
            to='/repositories/$repositoryId'
            params={{ repositoryId: item.repositoryId }}
            search={{
              tab:
                item.type.startsWith('HEALTH_') ||
                item.type.startsWith('AI_SECURITY_REVIEW_')
                  ? 'health'
                  : 'assessments',
              health: item.healthAssessmentId ?? undefined,
              assessment: item.assessmentId ?? undefined,
            }}
            className='font-medium hover:underline'
          >
            {item.title ?? titles[item.type] ?? 'Engineering update'}
            {item.actionLabel && (
              <span className='mt-1 block text-xs font-normal text-primary'>
                {item.actionLabel} →
              </span>
            )}
          </Link>
        )}
        <p className='mt-1 text-sm break-words text-muted-foreground'>
          {item.repository}
          {item.sourceSha ? ' · ' : ''}
          <span className='font-mono'>{item.sourceSha?.slice(0, 7)}</span>
        </p>
        <p className='mt-2 text-sm leading-relaxed text-muted-foreground'>
          {item.message ??
            (item.type === 'AI_REVIEW_BUDGET_REACHED'
              ? 'This review was blocked by previous AI settings. Check the current model configuration in Model Router before retrying.'
              : item.type === 'AI_MODEL_UNAVAILABLE'
                ? 'Repeated model request failures were recorded. Test the primary and fallback connections.'
                : 'Open this event to review its recorded results and next steps.')}
        </p>
        {!!item.details?.length && (
          <ul className='mt-2 space-y-1 text-xs text-muted-foreground'>
            {item.details.map((detail, index) => (
              <li key={index} className='break-words'>
                {detail}
              </li>
            ))}
          </ul>
        )}

        {item.emailDelivery && (
          <div
            className='mt-2'
            title={`Email attempts: ${item.emailDelivery.attempts}`}
          >
            <StatusBadge
              tone={
                item.emailDelivery.state === 'SENT'
                  ? 'success'
                  : item.emailDelivery.state === 'FAILED'
                    ? 'error'
                    : item.emailDelivery.state === 'PENDING'
                      ? 'warning'
                      : 'neutral'
              }
            >
              {(
                {
                  SENT: 'Email sent',
                  PENDING: 'Email queued',
                  FAILED: 'Email failed',
                  SKIPPED: 'Email skipped',
                } as Record<string, string>
              )[item.emailDelivery.state] ?? 'Email queued'}
            </StatusBadge>
          </div>
        )}
        <time
          dateTime={item.createdAt}
          className='mt-1 block text-xs text-muted-foreground'
        >
          {new Date(item.createdAt).toLocaleString()}
        </time>
      </div>
      {!item.readAt && (
        <Button
          size='sm'
          variant='ghost'
          disabled={busy}
          onClick={() => onRead(item.id)}
        >
          Mark read
        </Button>
      )}
    </div>
  )
}
export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const count = useNotificationCount()
  const { query, read, session } = useInbox(
    { unread: 'true' },
    { enabled: open, preview: true }
  )
  const unreadCount = count.data?.unreadCount ?? query.data?.unreadCount ?? 0
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant='ghost'
          size='icon'
          className='relative'
          aria-label={
            count.isError || session.isError
              ? 'Notifications unavailable'
              : `Notifications, ${unreadCount} unread`
          }
        >
          <Bell className='size-4' />
          {!!unreadCount && (
            <span className='absolute end-0 top-0 min-w-4 rounded-full bg-red-600 px-1 text-xs leading-4 font-semibold text-white'>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align='end'
        className='w-[min(420px,calc(100vw-2rem))] p-4'
      >
        <div className='mb-3 flex items-center justify-between'>
          <h2 className='font-semibold'>Notifications</h2>
          <Link
            to='/notifications'
            className='text-sm text-primary hover:underline'
          >
            View inbox
          </Link>
        </div>
        {query.isError || session.isError ? (
          <p role='alert' className='text-sm text-destructive'>
            {query.error?.message ?? 'Could not load your session. Try again.'}{' '}
            <Button
              variant='link'
              onClick={() =>
                void (session.isError ? session.refetch() : query.refetch())
              }
            >
              Retry
            </Button>
          </p>
        ) : query.isPending ? (
          <p
            role='status'
            className='py-6 text-center text-sm text-muted-foreground'
          >
            Loading notifications…
          </p>
        ) : query.data?.enabled === false ? (
          <p className='py-4 text-sm text-muted-foreground'>
            Notifications are turned off for this deployment. Your administrator
            needs to enable them and restart the API and worker.
          </p>
        ) : !query.data?.items.length ? (
          <p className='py-6 text-center text-sm text-muted-foreground'>
            You’re all caught up.
          </p>
        ) : (
          <div className='max-h-96 space-y-2 overflow-y-auto'>
            {query.data.items.slice(0, 5).map((item) => (
              <NotificationItem
                key={item.id}
                item={item}
                busy={read.isPending}
                onRead={(id) => read.mutate(id)}
              />
            ))}
          </div>
        )}
        {read.isError && (
          <p role='alert' className='mt-2 text-sm text-destructive'>
            Could not mark notification read. Try again.
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}
