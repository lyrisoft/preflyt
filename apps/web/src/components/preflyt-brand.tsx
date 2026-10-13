import { cn } from '@/lib/utils'

/** Supplied Preflyt assets; theme styles preserve contrast without altering files. */
export function PreflytLogo({ className }: { className?: string }) {
  return (
    <span
      role='img'
      aria-label='Preflyt'
      className={cn('relative block overflow-hidden', className)}
    >
      <img
        src='/images/brand/logo-white.png'
        alt=''
        aria-hidden='true'
        width={2172}
        height={724}
        className='absolute inset-0 h-full w-full object-contain invert dark:hidden'
      />
      <img
        src='/images/brand/logo-color.png'
        alt=''
        aria-hidden='true'
        width={2172}
        height={724}
        className='absolute inset-0 hidden h-full w-full object-contain dark:block'
      />
    </span>
  )
}
export function PreflytMark({ className }: { className?: string }) {
  return (
    <span
      className={cn('relative inline-block shrink-0', className)}
      aria-hidden='true'
    >
      <img
        src='/images/brand/mark-color.png'
        alt=''
        width={1254}
        height={1254}
        className='h-full w-full object-contain brightness-0 dark:brightness-100'
      />
    </span>
  )
}
