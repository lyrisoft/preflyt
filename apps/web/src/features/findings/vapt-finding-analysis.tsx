import { Sparkles } from 'lucide-react'
import { SurfaceIcon } from '@/components/surface-icon'
import type { VaptAnalysis } from './finding-types'

export function VaptFindingAnalysis({ analysis }: { analysis: VaptAnalysis }) {
  const sections = [
    ['Reasoning', analysis.reasoning],
    ['Potential impact', analysis.impact],
    ['Preconditions and assumptions', analysis.preconditions],
    ['Existing protections and counterevidence', analysis.counterevidence],
    ['Suggested remediation', analysis.remediation],
    ['How to verify', analysis.verificationSteps],
  ]
  return (
    <section
      aria-label='AI security analysis'
      className='min-w-0 border-t bg-muted/10 p-4'
    >
      <div className='flex items-center gap-3'>
        <SurfaceIcon icon={Sparkles} tone='violet' size='sm' />
        <div>
          <h2 className='text-sm font-semibold'>AI security analysis</h2>
          <p className='mt-1 text-xs text-muted-foreground'>
            Source-backed concern. Needs human review; exploit execution has not
            been verified.
          </p>
        </div>
      </div>
      <div className='mt-5 space-y-5'>
        {sections.map(([title, text]) => (
          <section key={title} className='max-w-[80ch] space-y-2'>
            <h3 className='text-sm font-semibold'>{title}</h3>
            <p className='text-sm leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap text-muted-foreground'>
              {text}
            </p>
          </section>
        ))}
      </div>
    </section>
  )
}
