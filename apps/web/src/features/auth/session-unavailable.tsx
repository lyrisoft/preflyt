import { useState } from 'react'
import { useRouter, type ErrorComponentProps } from '@tanstack/react-router'
import { SessionUnavailableError } from '@/lib/session-request'
import { Button } from '@/components/ui/button'
import { GeneralError } from '@/features/errors/general-error'

export function SessionUnavailable({ error }: ErrorComponentProps) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  if (!(error instanceof SessionUnavailableError)) return <GeneralError />
  return (
    <main className='flex min-h-svh items-center justify-center p-6'>
      <section
        className='max-w-md space-y-4 text-center'
        aria-labelledby='session-connection-title'
      >
        <h1 id='session-connection-title' className='text-xl font-semibold'>
          Reconnect to Preflyt
        </h1>
        <p role='alert' className='text-sm text-muted-foreground'>
          The API is temporarily unavailable. Your session has not been checked
          yet. Retry when the server is ready.
        </p>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await router.invalidate()
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? 'Checking session…' : 'Retry connection'}
        </Button>
      </section>
    </main>
  )
}
