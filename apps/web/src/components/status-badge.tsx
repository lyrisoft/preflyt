import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

export type StatusTone = 'success' | 'warning' | 'error' | 'info' | 'neutral'

/** Shared semantics take precedence over caller tone for recognized status labels. */
export const statusTones: Readonly<Record<string, StatusTone>> = {
  synced: 'success',
  approved: 'success',
  active: 'success',
  passed: 'success',
  published: 'success',
  completed: 'success',
  'connection tested': 'success',
  failed: 'error',
  error: 'error',
  'model unavailable': 'error',
  draft: 'warning',
  pending: 'warning',
  stale: 'warning',
  'sync needed': 'warning',
  running: 'info',
  queued: 'info',
  inactive: 'neutral',
  disabled: 'neutral',
  planned: 'neutral',
  'local team': 'neutral',
}

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
    <Badge
      variant={
        typeof children === 'string'
          ? (statusTones[children.trim().toLowerCase()] ?? tone)
          : tone
      }
      className={cn('min-h-6', className)}
    >
      <span
        aria-hidden='true'
        className='size-1.5 shrink-0 rounded-full bg-current'
      />
      {children}
    </Badge>
  )
}
