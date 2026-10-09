import { Link } from '@tanstack/react-router'
import { Bell } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useInbox, titles, type Item } from './notification-query'

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
              : 'bg-teal-500'
        )}
        aria-label={item.severity}
      />
      <div className='min-w-0 flex-1'>
        <Link
          to='/repositories/$repositoryId'
          params={{ repositoryId: item.repositoryId }}
          search={{ tab: 'assessments', assessment: item.assessmentId }}
          className='font-medium hover:underline'
        >
          {titles[item.type] ?? 'Assessment updated'}
        </Link>
        <p className='mt-1 text-sm break-words text-muted-foreground'>
          {item.repository} ·{' '}
          <span className='font-mono'>{item.sourceSha.slice(0, 7)}</span>
        </p>
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
  const { query, read } = useInbox({ unread: 'true' })
  if (!query.data?.enabled && !query.isError) return null
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant='ghost'
          size='icon'
          className='relative'
          aria-label={
            query.isError
              ? 'Notifications unavailable'
              : `Notifications, ${query.data?.unreadCount ?? 0} unread`
          }
        >
          <Bell className='size-4' />
          {!!query.data?.unreadCount && (
            <span className='absolute end-0 top-0 min-w-4 rounded-full bg-primary px-1 text-[10px] text-primary-foreground'>
              {query.data.unreadCount > 99 ? '99+' : query.data.unreadCount}
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
        {query.isError ? (
          <p role='alert' className='text-sm text-destructive'>
            {query.error.message}{' '}
            <Button variant='link' onClick={() => void query.refetch()}>
              Retry
            </Button>
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
