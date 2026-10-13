import { Link } from '@tanstack/react-router'
import { FileCheck2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ResultTimestamp } from '@/components/result-timestamp'
import { SurfaceIcon } from '@/components/surface-icon'
import type { HealthReport } from './health-api'

export function HealthPolicyEvidence({
  report,
  repositoryId,
}: {
  report: HealthReport
  repositoryId: string
}) {
  const context = report.policyContext
  return (
    <Card className='gap-0 py-0'>
      <CardHeader className='p-5'>
        <div className='flex items-center gap-3'>
          <SurfaceIcon icon={FileCheck2} tone='teal' size='sm' />
          <CardTitle>Policy evidence</CardTitle>
        </div>
      </CardHeader>
      <CardContent className='space-y-3 px-5 pb-5 text-xs leading-relaxed text-muted-foreground'>
        {!context ? (
          <p>Policy context was not recorded in this saved report.</p>
        ) : context.state === 'NO_PUBLISHED_POLICY' ? (
          <p>No published policy for this branch at assessment time.</p>
        ) : context.state === 'POLICY_INVALID' ? (
          <p role='alert'>
            The published policy could not be verified at assessment time.
          </p>
        ) : (
          <>
            <p className='font-medium text-foreground'>
              Policy revision {context.revision} · {context.requirements}{' '}
              requirements
            </p>
            {context.evidence.state === 'HISTORICAL_PREVIEW' ? (
              <>
                <p className='text-lg font-semibold text-foreground tabular-nums'>
                  {context.evidence.covered} / {context.requirements} evaluated
                </p>
                <p>
                  {context.evidence.passing} passing ·{' '}
                  {context.evidence.blocked} blocked ·{' '}
                  {context.evidence.incomplete} incomplete
                </p>
                <p>
                  Historical evidence at this commit. Evaluated includes both
                  passing and failed requirements; it does not mean the policy
                  passed. Configuration evidence and execution evidence retain
                  their original scopes.
                </p>
                {context.evidence.assessmentId && (
                  <Link
                    className='font-medium text-foreground underline underline-offset-4'
                    to='/repositories/$repositoryId'
                    params={{ repositoryId }}
                    search={{
                      tab: 'assessments',
                      assessment: context.evidence.assessmentId,
                    }}
                  >
                    View policy assessment
                  </Link>
                )}
              </>
            ) : (
              <p>
                No matching, verified historical CI assessment was captured.
                Policy evidence coverage is unavailable.
              </p>
            )}
            <details>
              <summary className='cursor-pointer'>
                Captured policy details
              </summary>
              <div className='mt-2 space-y-1 break-all'>
                <p>{context.branchRef}</p>
                <p>
                  Captured <ResultTimestamp value={context.capturedAt} />
                </p>
                <p>Policy: {context.policyId}</p>
                <p className='font-mono'>
                  Definition checksum: {context.definitionHash}
                </p>
              </div>
            </details>
          </>
        )}
        <p className='border-t pt-3'>
          Separate from file analysis. Health findings do not satisfy CI checks
          or establish current merge readiness.
        </p>
      </CardContent>
    </Card>
  )
}
