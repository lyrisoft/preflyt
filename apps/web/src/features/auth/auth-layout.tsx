import { ShieldCheck } from 'lucide-react'

type AuthLayoutProps = {
  children: React.ReactNode
  footer?: React.ReactNode
}

export function AuthLayout({ children, footer }: AuthLayoutProps) {
  return (
    <div className='dark relative isolate grid min-h-svh place-items-center overflow-hidden bg-background px-4 py-12 text-foreground'>
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0 overflow-hidden'
      >
        <div className='absolute inset-x-0 top-0 h-105 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.13),transparent_68%)]' />
        <div className='absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] [mask-image:linear-gradient(to_bottom,black,transparent_78%)] bg-size-[56px_56px]' />
      </div>

      <main className='relative z-10 flex w-full max-w-md flex-col items-center gap-7'>
        <div className='flex flex-col items-center gap-3 text-center'>
          <div className='flex size-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 shadow-lg shadow-black/20'>
            <ShieldCheck
              aria-hidden='true'
              className='size-5 text-sky-300'
              strokeWidth={1.8}
            />
          </div>
          <div>
            <h1 className='text-xl font-semibold tracking-tight'>Preflyt</h1>
            <p className='mt-1 text-[10px] font-medium tracking-[0.22em] text-muted-foreground uppercase'>
              Engineering control plane
            </p>
          </div>
        </div>

        {children}

        {footer ?? (
          <p className='max-w-sm text-center text-xs leading-relaxed text-muted-foreground'>
            Access is managed by your organization. Contact a Preflyt Owner or
            Admin if you need an account.
          </p>
        )}
      </main>
    </div>
  )
}
