import {
  ChevronDown,
  CircleAlert,
  MessageSquareText,
  Sparkles,
  Wrench,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { AiLoadingIcon } from '@/components/ai-loading-icon'
import { SurfaceIcon } from '@/components/surface-icon'
import { findingGuidanceText } from './finding-guidance-text'
import type { Finding } from './finding-types'
import { VaptFindingAnalysis } from './vapt-finding-analysis'

/** Saved explanations sit beside their source; generic advice never claims a diagnosed cause. */
export function FindingGuidance({
  finding,
  aiState,
  aiReason,
  onRetryAi,
}: {
  finding: Finding
  aiState?: string
  aiReason?: string
  onRetryAi?: () => void
}) {
  if (finding.aiReview)
    return <VaptFindingAnalysis analysis={finding.aiReview} />
  const preparing = aiState === 'QUEUED' || aiState === 'RUNNING'

  const guide = finding.guidance
  const {
    title,
    explanation,
    solution,
    attribution,
    sourceLabel,
    impactLabel,
  } = findingGuidanceText(finding)
  const location = finding.line
    ? finding.endLine && finding.endLine > finding.line
      ? `Lines ${finding.line}–${finding.endLine}`
      : `Line ${finding.line}`
    : null
  if (preparing || aiState === 'LOADING') {
    return (
      <section
        aria-label='Problem and solution'
        className='min-w-0 border-t bg-muted/10 p-4'
      >
        <div
          role='status'
          aria-live='polite'
          className='flex items-center gap-3'
        >
          <AiLoadingIcon />
          <div className='min-w-0 space-y-1'>
            <h2 className='text-sm font-semibold'>
              {preparing ? 'Preparing AI guidance' : 'Loading guidance'}
            </h2>
            <p className='text-xs leading-relaxed text-muted-foreground'>
              {preparing
                ? 'The explanation and suggested solution will appear here when ready.'
                : 'Checking for recommendations for this finding.'}
            </p>
          </div>
        </div>
        <div
          aria-hidden='true'
          data-slot='ai-guidance-skeleton'
          className='mt-5 space-y-5'
        >
          <div className='space-y-3'>
            <Skeleton className='h-3.5 w-24 motion-reduce:animate-none' />
            <div className='space-y-2'>
              <Skeleton className='h-3 w-full motion-reduce:animate-none' />
              <Skeleton className='h-3 w-5/6 motion-reduce:animate-none' />
              <Skeleton className='h-3 w-2/3 motion-reduce:animate-none' />
            </div>
          </div>
          <div className='space-y-3 border-t pt-5'>
            <Skeleton className='h-3.5 w-36 motion-reduce:animate-none' />
            <div className='space-y-2'>
              <Skeleton className='h-3 w-full motion-reduce:animate-none' />
              <Skeleton className='h-3 w-3/4 motion-reduce:animate-none' />
            </div>
          </div>
        </div>
      </section>
    )
  }
  return (
    <Collapsible defaultOpen asChild>
      <section
        aria-label='Problem and solution'
        className='min-w-0 border-t bg-muted/10'
      >
        <h2>
          <CollapsibleTrigger className='group flex w-full items-center gap-3 p-4 text-start hover:bg-muted/30 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring'>
            <SurfaceIcon
              icon={sourceLabel.startsWith('AI') ? Sparkles : MessageSquareText}
              tone={sourceLabel.startsWith('AI') ? 'violet' : 'blue'}
              size='sm'
            />
            <span className='min-w-0 flex-1'>
              <span className='block text-sm font-semibold'>
                Problem and solution
              </span>
              <span className='mt-0.5 block text-xs text-muted-foreground'>
                {location ? `${location} · ` : ''}
                {sourceLabel}
              </span>
            </span>
            <ChevronDown
              aria-hidden
              className='size-4 shrink-0 text-muted-foreground group-data-[state=open]:rotate-180'
            />
          </CollapsibleTrigger>
        </h2>
        <CollapsibleContent className='space-y-4 px-4 pb-4 text-sm leading-relaxed'>
          {(aiState === 'FAILED' || aiState === 'UNAVAILABLE') && (
            <div
              role='status'
              className='flex flex-wrap items-center justify-between gap-2'
            >
              <span>
                {aiReason ??
                  'AI could not complete a recommendation. Showing saved rule guidance.'}
              </span>
              {onRetryAi && (
                <Button variant='outline' size='sm' onClick={onRetryAi}>
                  Retry AI guidance
                </Button>
              )}
            </div>
          )}

          <section aria-labelledby='finding-problem' className='space-y-2'>
            <h3
              id='finding-problem'
              className='flex items-center gap-2 font-semibold'
            >
              <CircleAlert
                aria-hidden
                className='size-4 shrink-0 text-destructive'
              />
              Problem
            </h3>
            <p className='wrap-anywhere whitespace-pre-line text-muted-foreground'>
              {title}
            </p>
            {explanation && (
              <div className='space-y-1'>
                {impactLabel && (
                  <h4 className='font-semibold'>{impactLabel}</h4>
                )}
                <p className='wrap-anywhere whitespace-pre-line text-muted-foreground'>
                  {explanation}
                </p>
              </div>
            )}
          </section>
          <section
            aria-labelledby='finding-solution'
            className='space-y-2 border-t pt-4'
          >
            <h3
              id='finding-solution'
              className='flex items-center gap-2 font-semibold'
            >
              <Wrench
                aria-hidden
                className='size-4 shrink-0 text-muted-foreground'
              />
              Suggested solution
            </h3>
            <p className='wrap-anywhere whitespace-pre-line text-muted-foreground'>
              {solution}
            </p>
          </section>
          <div className='space-y-2 border-t pt-3 text-xs text-muted-foreground'>
            <p className='wrap-anywhere'>{attribution}</p>
            {guide?.reference &&
              /^https:\/\/(?:developer\.mozilla\.org|docs\.python\.org|eslint\.org)\//.test(
                guide.reference
              ) && (
                <a
                  className='inline-block font-medium text-foreground underline underline-offset-4'
                  href={guide.reference}
                  target='_blank'
                  rel='noopener noreferrer'
                >
                  Language reference
                </a>
              )}
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  )
}
