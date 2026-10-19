import { Sparkles } from 'lucide-react'
import { SurfaceIcon } from '@/components/surface-icon'

/** Keep the AI mark stationary while its surrounding ring shows progress. */
export function AiLoadingIcon({ compact = false }: { compact?: boolean }) {
  return (
    <span
      aria-hidden='true'
      className={`relative inline-flex shrink-0 items-center justify-center ${compact ? 'size-4' : 'size-10'}`}
    >
      {compact ? (
        <Sparkles className='size-2.5!' />
      ) : (
        <SurfaceIcon
          icon={Sparkles}
          tone='violet'
          className='rounded-full border-transparent'
        />
      )}
      <span
        data-slot='ai-loading-ring'
        className='absolute inset-0 animate-spin rounded-full border-2 border-violet-500/20 border-t-violet-500 motion-reduce:animate-none dark:border-violet-400/20 dark:border-t-violet-400'
      />
    </span>
  )
}
