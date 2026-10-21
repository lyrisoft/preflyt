import { statusTones, type StatusTone } from '@/lib/status-tones'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

export type { StatusTone } from '@/lib/status-tones'

/** Semantic status label: tinted tone, leading dot and visible text. */
export function StatusBadge({
  tone,
  className,
  compact = false,
  children,
}: {
  tone: StatusTone
  className?: string
  compact?: boolean
  children: React.ReactNode
}) {
  return (
    <Badge
      variant={
        typeof children === 'string'
          ? Object.prototype.hasOwnProperty.call(
              statusTones,
              children.trim().toLowerCase()
            )
            ? statusTones[children.trim().toLowerCase()]
            : tone
          : tone
      }
      className={cn(
        compact
          ? 'min-h-5 rounded-md border-transparent px-1.5 py-0.5 text-xs font-medium'
          : 'min-h-6',
        typeof children === 'string' &&
          children.trim().toLowerCase() === 'critical' &&
          'border-severity-critical/30 bg-severity-critical text-white',
        typeof children === 'string' &&
          children.trim().toLowerCase() === 'high' &&
          'border-severity-high/30 bg-severity-high/10 text-severity-high-text',
        typeof children === 'string' &&
          children.trim().toLowerCase() === 'beta' &&
          'relative -top-1.5 min-h-0 border-0 bg-transparent p-0 text-xs leading-none text-yellow-700 italic dark:text-yellow-300 [&>span]:hidden',
        className
      )}
    >
      <span
        aria-hidden='true'
        className={cn(
          'shrink-0 rounded-full bg-current',
          compact ? 'size-1' : 'size-1.5'
        )}
      />
      {children}
    </Badge>
  )
}
