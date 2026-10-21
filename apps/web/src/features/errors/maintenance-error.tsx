import { Button } from '@/components/ui/button'

export function MaintenanceError() {
  return (
    <div className='flex min-h-svh items-center px-4 py-8'>
      <div className='m-auto flex w-full max-w-lg flex-col items-center gap-3 text-center'>
        <p className='text-6xl leading-tight font-bold text-muted-foreground'>
          503
        </p>
        <h1 className='max-w-full text-2xl font-semibold break-words'>
          Preflyt is temporarily unavailable
        </h1>
        <p className='text-center text-muted-foreground'>
          Try opening Preflyt again. If it is still unavailable, contact your
          deployment administrator.
        </p>
        <div className='mt-3 flex flex-wrap justify-center gap-3'>
          <Button asChild>
            <a href='/'>Try Preflyt again</a>
          </Button>
        </div>
      </div>
    </div>
  )
}
