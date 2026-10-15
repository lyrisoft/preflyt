import { Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  RefreshCw,
  TestTubeDiagonal,
  ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { ResultTimestamp } from '@/components/result-timestamp'
import { StatusBadge } from '@/components/status-badge'
import { useHealth, healthLabel, healthTone } from './health-api'

export function HealthCoverageDetails({
  repositoryId,
  assessmentId,
}: {
  repositoryId: string
  assessmentId: string
}) {
  const query = useHealth(repositoryId, assessmentId),
    row = query.data?.assessment,
    ci = query.data?.ciCoverage,
    coverage = ci?.measurement
  return (
    <Main className='space-y-5'>
      <Button variant='ghost' size='sm' asChild>
        <Link
          to='/repositories/$repositoryId'
          params={{ repositoryId }}
          search={{ tab: 'health', health: assessmentId }}
        >
          <ArrowLeft /> Back to Health report
        </Link>
      </Button>
      <PageHeader
        title='Tests and coverage'
        section='Repository health'
        icon={TestTubeDiagonal}
        tone='teal'
        description='Verified CI reports for the assessed commit.'
        actions={
          <Button
            variant='outline'
            size='sm'
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw /> Refresh
          </Button>
        }
      />
      {query.isPending && (
        <Skeleton
          className='h-64 rounded-xl'
          aria-label='Loading test coverage'
        />
      )}
      {query.isError && (
        <p
          role='alert'
          className='rounded-lg border border-destructive/30 p-4 text-sm text-destructive'
        >
          {query.error.message}
        </p>
      )}
      {row && (
        <Card className='gap-0 overflow-hidden py-0'>
          <CardHeader className='gap-3 border-b p-5'>
            <div className='flex flex-wrap items-start justify-between gap-3'>
              <div>
                <CardTitle>CI test results and coverage</CardTitle>
                <p className='mt-1 text-sm text-muted-foreground'>
                  {row.branch} · commit{' '}
                  <code>{row.sourceSha?.slice(0, 12) ?? 'not pinned yet'}</code>
                </p>
              </div>
              <StatusBadge tone='neutral'>
                {ci?.state === 'VERIFIED'
                  ? 'Verified CI coverage'
                  : ci?.state === 'UNVERIFIED'
                    ? 'Unverified'
                    : 'Coverage not received'}
              </StatusBadge>
            </div>
          </CardHeader>
          <CardContent className='space-y-5 p-5'>
            <div>
              <p className='text-3xl font-semibold tabular-nums'>
                {coverage
                  ? `${((100 * coverage.coveredLines) / coverage.analyzedLines).toFixed(1)}%`
                  : '—'}
              </p>
              <p className='mt-1 text-sm text-muted-foreground'>
                {coverage
                  ? `${coverage.coveredLines} of ${coverage.analyzedLines} reported lines covered across ${coverage.analyzedFiles} files`
                  : ci?.state === 'UNVERIFIED'
                    ? ci.reason === 'CI_REPORTS_AMBIGUOUS'
                      ? 'Multiple reports match this run. Submit one combined report for tests and one for coverage.'
                      : ci.reason === 'CI_EVIDENCE_LIMIT'
                        ? 'This commit exceeds the CI evidence limit. Review duplicate workflow submissions.'
                        : 'A coverage report was received, but its integrity, workflow execution or required signature has not been verified. Check the report proof and CI run.'
                    : 'No verified coverage report has been received for this commit.'}
              </p>
            </div>
            {ci?.tests && (
              <div className='space-y-2'>
                <div className='flex items-center gap-2'>
                  <h2 className='text-sm font-semibold'>Test results</h2>
                  <StatusBadge tone={healthTone(ci.testsState ?? 'INCOMPLETE')}>
                    {healthLabel(ci.testsState ?? 'INCOMPLETE')}
                  </StatusBadge>
                </div>
                <p className='text-sm'>
                  {ci.tests.passed} passed ·{' '}
                  {ci.tests.failures + ci.tests.errors} failed ·{' '}
                  {ci.tests.skipped} skipped
                </p>
              </div>
            )}
            {ci?.receivedAt && (
              <p className='text-xs text-muted-foreground'>
                Received <ResultTimestamp value={ci.receivedAt} />
              </p>
            )}
            {ci?.runUrl && (
              <Button variant='outline' size='sm' asChild>
                <a href={ci.runUrl} target='_blank' rel='noreferrer'>
                  View CI run and logs <ExternalLink />
                </a>
              </Button>
            )}
            {!coverage && (
              <div className='rounded-lg border bg-muted/20 p-4 text-sm'>
                <h2 className='font-semibold'>Connect coverage reporting</h2>
                <p className='mt-2 text-muted-foreground'>
                  Run your existing test and coverage command in GitHub Actions,
                  then submit its JUnit results and coverage report through
                  Preflyt. Reports must match this repository, commit and
                  workflow attempt.
                </p>
                <a
                  href='https://docs.preflytlabs.com/user-guide/repository-health'
                  target='_blank'
                  rel='noreferrer'
                  className='mt-3 inline-flex items-center gap-1 font-medium underline underline-offset-4'
                >
                  CI coverage setup <ExternalLink className='size-4' />
                </a>
              </div>
            )}
            <p className='text-xs text-muted-foreground'>
              CI owns test execution and its service setup. Coverage applies to
              the files included by your CI configuration. Missing reports are
              never counted as zero. These results do not change the saved
              static analysis report or authorize merging.
            </p>
          </CardContent>
        </Card>
      )}
    </Main>
  )
}
