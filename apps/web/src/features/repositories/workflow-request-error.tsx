import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ResultTimestamp } from '@/components/result-timestamp'

/** Keep the server's shared GitHub cooldown visible without issuing retries. */
export function WorkflowRequestError({
  error,
  retry,
  label = 'Retry',
}: {
  error: Error | null
  retry: () => void
  label?: string
}) {
  const details = error as (Error & { code?: string; retryAt?: string }) | null
  const retryAt =
    details?.code === 'GITHUB_RATE_LIMITED' ? details.retryAt : undefined
  const deadline = retryAt ? Date.parse(retryAt) : NaN
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!Number.isFinite(deadline)) return
    const timer = setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (current >= deadline) clearInterval(timer)
    }, 1000)
    return () => clearInterval(timer)
  }, [deadline])
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000))
  const paused = Number.isFinite(seconds) && seconds > 0
  return (
    <>
      <div role='alert' className='min-w-0 space-y-1 text-sm'>
        <p>
          {retryAt
            ? 'GitHub is temporarily limiting requests.'
            : (error?.message ?? 'Workflow setup is unavailable')}
        </p>
        {retryAt && (
          <p className='text-muted-foreground'>
            Retry after <ResultTimestamp value={retryAt} />
            {paused ? (
              <span aria-hidden='true'>{` (${Math.floor(seconds / 60)}m ${seconds % 60}s remaining).`}</span>
            ) : (
              '. You can retry now.'
            )}
          </p>
        )}
      </div>
      <Button size='sm' variant='outline' disabled={paused} onClick={retry}>
        {label}
      </Button>
    </>
  )
}
