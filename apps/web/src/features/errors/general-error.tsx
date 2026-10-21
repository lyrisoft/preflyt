import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type GeneralErrorProps = React.HTMLAttributes<HTMLDivElement> & {
  minimal?: boolean
  reset?: () => void
}

export function GeneralError({
  className,
  minimal = false,
  reset,
}: GeneralErrorProps) {
  const router = useRouter()
  const [retrying, setRetrying] = useState(false)
  return (
    <div
      className={cn('flex min-h-svh w-full items-center px-4 py-8', className)}
    >
      <div className='m-auto flex w-full max-w-lg flex-col items-center gap-3 text-center'>
        {!minimal && (
          <p className='text-6xl leading-tight font-bold text-muted-foreground'>
            500
          </p>
        )}
        <h1 className='max-w-full text-2xl font-semibold break-words'>
          This page could not load
        </h1>
        <p className='text-center text-muted-foreground'>
          Try loading it again. If the problem continues, open Preflyt to return
          to your workspace.
        </p>
        <div className='mt-3 flex flex-wrap justify-center gap-3'>
          <Button
            disabled={retrying}
            onClick={async () => {
              setRetrying(true)
              try {
                await router.invalidate()
                reset?.()
              } catch {
                window.location.reload()
              } finally {
                setRetrying(false)
              }
            }}
          >
            {retrying ? 'Loading page…' : 'Try again'}
          </Button>
          <Button variant='outline' asChild>
            <a href='/'>Open Preflyt</a>
          </Button>
        </div>
      </div>
    </div>
  )
}
