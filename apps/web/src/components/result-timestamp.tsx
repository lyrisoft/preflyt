import { cn } from '@/lib/utils'

/** An absolute date and time for recorded evidence, using the viewer's time zone. */
export function ResultTimestamp({
  value,
  stacked = false,
  className,
}: {
  value?: string | null
  stacked?: boolean
  className?: string
}) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime()))
    return <span className={className}>-</span>
  return (
    <time
      dateTime={date.toISOString()}
      title={date.toISOString()}
      className={cn('tabular-nums', className)}
    >
      <span className={stacked ? 'block whitespace-nowrap' : undefined}>
        {date.toLocaleDateString(undefined, {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })}
      </span>{' '}
      <span
        className={
          stacked
            ? 'mt-1 block text-xs whitespace-nowrap text-muted-foreground'
            : undefined
        }
      >
        {date.toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
          timeZoneName: 'short',
        })}
      </span>
    </time>
  )
}
