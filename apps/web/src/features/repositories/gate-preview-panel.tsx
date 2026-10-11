import { ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import { reviewReason, reviewStatuses } from './assessment-result'
import type { useGatePreview } from './engineering-queries'

type PreviewQuery = ReturnType<typeof useGatePreview>

export function GatePreviewPanel({
  preview,
  onReviewChecks,
}: {
  preview: PreviewQuery
  onReviewChecks: () => void
}) {
  const result = preview.isError ? undefined : preview.data
  const status = result && reviewStatuses[result.status]
  return (
    <section
      aria-label='Merge review result'
      className={cn(
        'space-y-3 rounded-lg border bg-muted/20 p-4',
        status?.tone === 'success'
          ? 'border-success/30'
          : status?.tone === 'error'
            ? 'border-destructive/30'
            : status?.tone === 'warning'
              ? 'border-warning/30'
              : 'border-border'
      )}
    >
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex items-center gap-2.5'>
          <SurfaceIcon icon={ShieldCheck} tone='teal' size='sm' />
          <h3 className='text-sm font-semibold'>Merge review result</h3>
        </div>
        {status && <StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
      </div>
      {preview.isError ? (
        <div role='alert' className='flex flex-wrap items-center gap-3 text-sm'>
          <p>{preview.error.message}</p>
          <Button
            variant='outline'
            size='sm'
            disabled={preview.isFetching}
            onClick={() => void preview.refetch()}
          >
            Retry result
          </Button>
        </div>
      ) : !result ? (
        <p role='status' className='text-sm text-muted-foreground'>
          Checking saved requirements…
        </p>
      ) : status ? (
        <>
          <p className='text-sm tabular-nums'>
            <span className='font-medium'>
              {result.requiredRulesSatisfied} of {result.requiredRules}
            </span>{' '}
            required checks passed
            <span className='text-muted-foreground'>
              {' '}
              · {result.requiredRulesBlocked} failed ·{' '}
              {result.requiredRulesIncomplete} incomplete
            </span>
          </p>
          <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
            <p className='text-sm sm:min-w-0 sm:flex-1'>
              {result.status === 'BLOCK'
                ? 'Fix the failed CI results and rerun the workflow.'
                : result.reasons.includes('NO_REQUIRED_RULES')
                  ? 'Choose required checks in the repository standards before relying on this result.'
                  : result.reasons.includes('SNAPSHOT_SCHEMA_UNSUPPORTED')
                    ? 'Ask your administrator to review this assessment format.'
                    : result.status === 'INCOMPLETE'
                      ? 'Open an incomplete check to see what is missing.'
                      : result.status === 'WARN'
                        ? 'Required checks passed. Review the optional checks for remaining gaps.'
                        : 'No required checks need attention in this saved assessment.'}
            </p>
            {result.rules.some((rule) => rule.status !== 'PASS') && (
              <Button size='sm' variant='outline' onClick={onReviewChecks}>
                {result.status === 'WARN'
                  ? 'Review optional checks'
                  : 'Review required checks'}
              </Button>
            )}
          </div>
        </>
      ) : null}
      <p className='text-xs text-muted-foreground'>
        GitHub decides whether merging is allowed.
      </p>
    </section>
  )
}

export function GateEvaluationDetails({ preview }: { preview: PreviewQuery }) {
  const result = preview.isError ? undefined : preview.data
  if (!result) return null
  return (
    <details className='rounded-lg border text-sm'>
      <summary className='cursor-pointer px-4 py-3 font-medium'>
        Merge evaluation details
      </summary>
      <div className='space-y-3 border-t p-4 text-xs text-muted-foreground'>
        <p>
          Result: {result.status} · Evaluator v{result.evaluatorVersion}
        </p>
        {!!result.reasons.length && (
          <ul className='list-disc space-y-1 pl-4'>
            {result.reasons.map((reason) => (
              <li key={reason}>{reviewReason(reason)}</li>
            ))}
          </ul>
        )}
        <p>
          A configuration check passes when its saved configuration requirement
          is satisfied. Successful CI or a signed report alone does not prove
          which tools and checks ran. A failed approved CI source does not
          identify a specific defect.
        </p>
        <p>
          {result.advisoryFailed} optional checks failed ·{' '}
          {result.advisoryIncomplete} incomplete
        </p>
        <code className='block break-all'>{result.evaluationHash}</code>
      </div>
    </details>
  )
}
