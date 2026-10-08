import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

export type StatusTone = 'success' | 'warning' | 'error' | 'info' | 'neutral'

/** Semantic status label: tinted tone, leading dot and visible text. */
export function StatusBadge({
  tone,
  className,
  children,
}: {
  tone: StatusTone
  className?: string
  children: React.ReactNode
}) {
  return (
    <Badge variant={tone} className={cn('min-h-6', className)}>
      <span
        aria-hidden='true'
        className='size-1.5 shrink-0 rounded-full bg-current'
      />
      {children}
    </Badge>
  )
}
