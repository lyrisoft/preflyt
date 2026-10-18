import { Link } from '@tanstack/react-router'
import { TestTubeDiagonal } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import type { HealthData } from './health-api'

const reasons: Record<string, string> = {
  CI_COVERAGE_NOT_RECEIVED:
    'The workflow has not supplied a coverage report for this commit.',
  REPORT_PROOF_UNVERIFIED:
    'The supplied report signature could not be verified. Review the CI report signing configuration.',
  CI_REPORT_UNVERIFIED:
    'A report was received, but its source could not be verified.',
  CI_REPORTS_AMBIGUOUS:
    'More than one coverage report matched. Review the workflow reports.',
  CI_EVIDENCE_LIMIT:
    'Too many CI results matched this commit to verify coverage.',
  COVERAGE_NOT_RECEIVED:
    'The latest workflow did not supply coverage. Check the LCOV path and test command in CI setup.',
  GITHUB_RATE_LIMITED:
    'GitHub requests are paused. Verification will retry automatically.',
  REPORT_JOB_FAILED:
    'The job that supplied this report did not complete successfully. Review its workflow logs.',
  CONFIGURATION_CHANGED:
    'The policy or repository access changed. Run the branch workflow again.',
  RUN_CHANGED: 'The workflow attempt changed. Waiting for a new report.',
  WORKFLOW_COMPLETION_TIMEOUT:
    'The workflow did not finish within 24 hours. Review its workflow logs.',
  VERIFICATION_FAILED:
    'Coverage verification could not finish. Review the latest workflow run.',
}
export function BranchCoverageCard({
  coverage,
  exact,
  branch,
  healthSha,
  repositoryId,
  assessmentId,
}: {
  coverage?: HealthData['branchCoverage']
  exact?: HealthData['ciCoverage']
  branch: string
  healthSha: string | null
  repositoryId?: string
  assessmentId?: string
}) {
  const result = coverage?.result ?? exact
  const latest = coverage?.latestAttempt
  const pending = latest && ['PENDING', 'PROCESSING'].includes(latest.state)
  const different =
    !!result?.sourceSha && !!healthSha && result.sourceSha !== healthSha
  const older =
    !!result?.measurement && !!latest && latest.sourceSha !== result.sourceSha
  const measurement =
    result?.state === 'VERIFIED' ? result.measurement : undefined
  return (
    <Card className='gap-0 py-0' aria-label='Branch test coverage'>
      <CardContent className='flex flex-wrap items-start gap-4 p-4'>
        <SurfaceIcon icon={TestTubeDiagonal} tone='teal' />
        <div className='min-w-0 flex-1 space-y-2'>
          <div className='flex flex-wrap items-center gap-3'>
            <h2 className='text-base font-semibold'>Test coverage</h2>
            <p
              aria-label={`Test coverage: ${measurement ? ((100 * measurement.coveredLines) / Math.max(1, measurement.analyzedLines)).toFixed(1) + '%' : 'Unavailable'}`}
              className='text-xl font-semibold tabular-nums'
            >
              {measurement && measurement.analyzedLines > 0
                ? `${((100 * measurement.coveredLines) / measurement.analyzedLines).toFixed(1)}%`
                : '—'}
            </p>
            {pending ? (
              <StatusBadge tone='info'>Updating</StatusBadge>
            ) : latest?.state === 'FAILED' ? (
              <StatusBadge tone='error'>Update failed</StatusBadge>
            ) : measurement ? (
              <StatusBadge tone='success'>Verified CI coverage</StatusBadge>
            ) : (
              <StatusBadge tone='warning'>
                {result?.state === 'UNVERIFIED'
                  ? 'Source not verified'
                  : 'Coverage not received'}
              </StatusBadge>
            )}
            {older && <StatusBadge tone='warning'>Earlier commit</StatusBadge>}
          </div>
          <p className='text-xs break-words text-muted-foreground'>
            {branch}
            {result?.sourceSha ? ` · ${result.sourceSha.slice(0, 7)}` : ''}
            {result?.receivedAt
              ? ` · Received ${new Date(result.receivedAt).toLocaleString()}`
              : ''}
          </p>
          {different && (
            <p className='text-sm text-muted-foreground'>
              Coverage and Health describe different commits. Each result keeps
              its own source and date.
            </p>
          )}
          {pending && (
            <p role='status' className='text-sm text-muted-foreground'>
              Verifying the latest CI report.{' '}
              {measurement
                ? 'Previous coverage stays visible.'
                : 'This updates automatically.'}
            </p>
          )}
          {(latest?.failureCode || !measurement) && (
            <p className='text-sm text-muted-foreground'>
              {reasons[
                latest?.failureCode ??
                  result?.reason ??
                  'CI_COVERAGE_NOT_RECEIVED'
              ] ??
                'Coverage could not be verified. Review the workflow report.'}
            </p>
          )}
          {pending && latest.retryAt && (
            <p className='text-xs text-muted-foreground'>
              Next verification attempt:{' '}
              {new Date(latest.retryAt).toLocaleString()}
            </p>
          )}
        </div>
        <div className='flex flex-wrap gap-4 text-sm'>
          {repositoryId && assessmentId && !different && (
            <Link
              className='underline underline-offset-4'
              to='/findings'
              search={{
                origin: 'health',
                health: assessmentId,
                repository: repositoryId,
                category: 'coverage',
                kind: 'gaps',
                page: 1,
              }}
            >
              Open test coverage details
            </Link>
          )}
          {result?.runUrl && (
            <a
              className='underline underline-offset-4'
              href={result.runUrl}
              target='_blank'
              rel='noreferrer'
            >
              View coverage run
            </a>
          )}
          {latest?.runUrl && latest.runUrl !== result?.runUrl && (
            <a
              className='underline underline-offset-4'
              href={latest.runUrl}
              target='_blank'
              rel='noreferrer'
            >
              View latest run
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
