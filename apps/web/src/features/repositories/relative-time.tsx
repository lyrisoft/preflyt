import { formatDistanceToNowStrict } from 'date-fns'

/** Relative time with the exact local timestamp on hover. */
export function RelativeTime({
  value,
  className,
}: {
  value: string
  className?: string
}) {
  const date = new Date(value)
  return (
    <time
      dateTime={date.toISOString()}
      title={date.toLocaleString()}
      className={className}
    >
      {formatDistanceToNowStrict(date, { addSuffix: true })}
    </time>
  )
}
