import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { SurfaceTone } from '@/lib/surface-tones'
import { cn } from '@/lib/utils'
import { SurfaceIcon } from './surface-icon'

const headerTones: Record<SurfaceTone, string> = {
  blue: 'border-info/15 bg-info/[0.035]',
  teal: 'border-chart-2/20 bg-chart-2/[0.035]',
  violet: 'border-chart-4/20 bg-chart-4/[0.035]',
  amber: 'border-warning/20 bg-warning/[0.035]',
}

export function PageHeader({
  title,
  description,
  section,
  icon,
  tone = 'teal',
  actions,
  className,
  leading,
  children,
}: {
  title: string
  description?: string
  section?: string
  icon: LucideIcon
  tone?: SurfaceTone
  actions?: ReactNode
  className?: string
  leading?: ReactNode
  children?: ReactNode
}) {
  return (
    <header
      data-slot='page-header'
      className={cn(
        'flex flex-wrap items-center justify-between gap-5 rounded-xl border p-5 sm:px-6',
        headerTones[tone],
        className
      )}
    >
      <div className='flex w-full min-w-0 flex-none items-center gap-4 sm:w-auto sm:flex-[1_1_20rem]'>
        {leading ?? <SurfaceIcon icon={icon} tone={tone} size='lg' />}
        <div className='min-w-0'>
          {section && (
            <p className='mb-1 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase'>
              {section}
            </p>
          )}
          <h1 className='text-xl font-semibold tracking-tight break-words sm:text-2xl'>
            {title}
          </h1>
          {description && (
            <p className='mt-1 max-w-[72ch] text-sm leading-relaxed text-muted-foreground'>
              {description}
            </p>
          )}
          {children && <div className='mt-2'>{children}</div>}
        </div>
      </div>
      {actions && (
        <div className='flex w-full max-w-full flex-wrap items-center gap-2 sm:w-auto'>
          {actions}
        </div>
      )}
    </header>
  )
}
