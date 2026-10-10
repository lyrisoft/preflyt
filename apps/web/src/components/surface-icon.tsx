import type { LucideIcon } from 'lucide-react'
import { surfaceTones, type SurfaceTone } from '@/lib/surface-tones'
import { cn } from '@/lib/utils'

/** Decorative section identity; status colors remain owned by StatusBadge. */
export function SurfaceIcon({
  icon: Icon,
  tone = 'blue',
  size = 'md',
  className,
}: {
  icon: LucideIcon
  tone?: SurfaceTone
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  return (
    <span
      data-slot='surface-icon'
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-xl border',
        surfaceTones[tone],
        size === 'sm' ? 'size-8' : size === 'lg' ? 'size-11' : 'size-10',
        className
      )}
    >
      <Icon
        className={size === 'sm' ? 'size-4' : 'size-5'}
        aria-hidden='true'
      />
    </span>
  )
}
