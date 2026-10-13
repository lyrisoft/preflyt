import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'
import {
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { StatusTone } from '@/components/status-badge'
import { toneFill, toneTrack } from './repository-vocabulary'

export type Segment = {
  key: string
  label: string
  value: number
  tone: StatusTone
}

/** Part-to-whole status bar: 2px surface gaps, hover tooltip per segment. */
export function StackedBar({
  segments,
  label,
}: {
  segments: Segment[]
  label: string
}) {
  const visible = segments.filter((segment) => segment.value > 0)
  const total = visible.reduce((sum, segment) => sum + segment.value, 0)
  return (
    <TooltipProvider>
      <div
        role='img'
        aria-label={`${label}: ${segments.map((s) => `${s.value} ${s.label.toLowerCase()}`).join(', ')}`}
        className='flex h-5 w-full mark-grow-x items-center gap-0.5'
      >
        {total === 0 ? (
          <div className='h-2.5 w-full rounded-sm bg-muted' />
        ) : (
          visible.map((segment) => (
            <TooltipPrimitive.Root key={segment.key}>
              <TooltipTrigger asChild>
                <div
                  className='flex h-5 min-w-1.5 items-center'
                  style={{ flexGrow: segment.value }}
                >
                  <div
                    className={cn(
                      'h-2.5 w-full rounded-sm chart-mark-motion',
                      toneFill[segment.tone]
                    )}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent className='motion-reduce:animate-none motion-reduce:transition-none'>
                {segment.label}: {segment.value} of {total} (
                {Math.round((segment.value / total) * 100)}%)
              </TooltipContent>
            </TooltipPrimitive.Root>
          ))
        )}
      </div>
    </TooltipProvider>
  )
}

/** Legend with counts; identity never rests on color alone. */
export function Legend({
  segments,
  onSelect,
  active,
}: {
  segments: Segment[]
  onSelect?: (key: string) => void
  active?: string
}) {
  return (
    <ul className='flex flex-wrap gap-x-3 gap-y-1 text-xs'>
      {segments.map((segment) => {
        const content = (
          <>
            <span
              aria-hidden='true'
              className={cn(
                'size-2 shrink-0 rounded-full',
                toneFill[segment.tone]
              )}
            />
            <span className='text-muted-foreground'>{segment.label}</span>
            <span className='font-semibold tabular-nums'>{segment.value}</span>
          </>
        )
        return (
          <li key={segment.key}>
            {onSelect ? (
              <button
                type='button'
                aria-pressed={active === segment.key}
                onClick={() => onSelect(segment.key)}
                className='touch-target -mx-1 inline-flex min-h-6 items-center gap-1.5 rounded px-1 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-muted'
              >
                {content}
              </button>
            ) : (
              <span className='inline-flex items-center gap-1.5 py-0.5'>
                {content}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** Ratio against a limit; the track is a lighter step of the fill's hue. */
export function Meter({
  value,
  max,
  tone,
  label,
}: {
  value: number
  max: number
  tone: StatusTone
  label: string
}) {
  const percent = max ? Math.round((value / max) * 100) : 0
  return (
    <div
      role='meter'
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn('h-2.5 w-full overflow-hidden rounded-sm', toneTrack[tone])}
    >
      <div
        className={cn(
          'h-full w-full mark-grow-x rounded-sm chart-scale-motion',
          toneFill[tone]
        )}
        style={{ transform: `scaleX(${percent / 100})` }}
      />
    </div>
  )
}

export type Run = {
  key: string
  tone: StatusTone
  label: string
  /** 1 = tallest; failures stand out by height as well as hue. */
  weight: number
}

/** Chronological run history, oldest to newest. */
export function RunStrip({ runs, label }: { runs: Run[]; label: string }) {
  return (
    <TooltipProvider>
      <div role='img' aria-label={label} className='flex h-8 items-end gap-0.5'>
        {runs.map((run, index) => (
          <TooltipPrimitive.Root key={run.key}>
            <TooltipTrigger asChild>
              <div className='flex h-8 w-2 shrink-0 items-end'>
                <div
                  className={cn(
                    'h-full w-full mark-grow-y rounded-sm chart-scale-motion',
                    toneFill[run.tone]
                  )}
                  style={{
                    transform: `scaleY(${run.weight})`,
                    animationDelay: `${Math.min(index * 12, 100)}ms`,
                  }}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent className='motion-reduce:animate-none motion-reduce:transition-none'>
              {run.label}
            </TooltipContent>
          </TooltipPrimitive.Root>
        ))}
      </div>
    </TooltipProvider>
  )
}
