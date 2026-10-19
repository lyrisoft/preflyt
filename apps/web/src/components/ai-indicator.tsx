import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Identify AI assistance without suggesting that its output is verified. */
export function AiIndicator({
  decorative = false,
  className,
}: {
  decorative?: boolean
  className?: string
}) {
  return (
    <span
      data-slot='ai-indicator'
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : 'AI-assisted'}
      aria-hidden={decorative || undefined}
      title='AI-assisted'
      className={cn('inline-flex size-4 shrink-0 text-chart-4', className)}
    >
      <Sparkles aria-hidden='true' className='size-full' />
    </span>
  )
}
