import {
  ChevronDown,
  CircleAlert,
  MessageSquareText,
  Sparkles,
  Wrench,
} from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { SurfaceIcon } from '@/components/surface-icon'
import { findingGuidanceText } from './finding-guidance-text'
import type { Finding } from './finding-types'

/** Saved explanations sit beside their source; generic advice never claims a diagnosed cause. */
export function FindingGuidance({ finding }: { finding: Finding }) {
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
