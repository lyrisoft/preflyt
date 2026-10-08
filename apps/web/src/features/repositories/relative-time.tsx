import { useSyncExternalStore } from 'react'
import { formatDistanceToNowStrict } from 'date-fns'

// One shared minute tick keeps every relative time current without a timer each.
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined
function subscribe(listener: () => void) {
  listeners.add(listener)
  timer ??= setInterval(() => listeners.forEach((notify) => notify()), 60_000)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer) {
      clearInterval(timer)
      timer = undefined
    }
  }
}
const currentMinute = () => Math.floor(Date.now() / 60_000)

/** Relative time with the exact local timestamp on hover. */
export function RelativeTime({
  value,
  className,
}: {
  value: string
  className?: string
}) {
  useSyncExternalStore(subscribe, currentMinute)
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
