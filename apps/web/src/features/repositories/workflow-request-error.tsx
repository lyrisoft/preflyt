import { useEffect, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ResultTimestamp } from '@/components/result-timestamp'

/** Keep the server's shared GitHub cooldown visible without issuing retries. */
export function WorkflowRequestError({
  error,
  retry,
  label = 'Retry',
  automatic = false,
  checking = false,
}: {
  error: Error | null
  retry: () => void
  label?: string
  automatic?: boolean
  checking?: boolean
}) {
  const details = error as (Error & { code?: string; retryAt?: string }) | null
  const retryAt = [
    'GITHUB_RATE_LIMITED',
    'GITHUB_SYNC_PENDING',
    'GITHUB_SYNC_STALLED',
    'GITHUB_SYNC_FAILED',
  ].includes(details?.code ?? '')
    ? details?.retryAt
    : undefined
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
  const pending = details?.code === 'GITHUB_SYNC_PENDING'
  const heading = pending
    ? 'Loading GitHub data'
    : details?.code === 'GITHUB_SYNC_STALLED'
      ? 'Background refresh is delayed'
      : details?.code === 'GITHUB_SYNC_FAILED'
        ? 'GitHub refresh failed'
        : undefined
  const paused = Number.isFinite(seconds) && seconds > 0
  return (
    <>
      <div
        role={pending ? 'status' : 'alert'}
        className='min-w-0 flex-1 space-y-1 text-sm'
      >
        {heading && (
          <p className='flex items-center gap-2 font-medium'>
            {pending && (
              <LoaderCircle
                aria-hidden='true'
                className='size-4 shrink-0 animate-spin motion-reduce:animate-none'
              />
            )}
            {heading}
          </p>
        )}
        <p>
          {retryAt && details?.code === 'GITHUB_RATE_LIMITED'
            ? 'GitHub is temporarily limiting requests.'
            : (error?.message ?? 'Workflow setup is unavailable')}
        </p>
        {retryAt && (
          <p className='text-muted-foreground'>
            {automatic ? 'Next automatic check: ' : 'Retry after '}
            <ResultTimestamp value={retryAt} />
            {paused ? (
              <span aria-hidden='true'>{` (${Math.floor(seconds / 60)}m ${seconds % 60}s remaining).`}</span>
            ) : automatic ? (
              '. Checking for an update…'
            ) : (
              '. You can retry now.'
            )}
          </p>
        )}
      </div>
      <Button
        size='sm'
        variant='outline'
        disabled={paused || checking}
        onClick={retry}
      >
        {checking ? 'Checking…' : automatic ? 'Check again' : label}
      </Button>
    </>
  )
}
