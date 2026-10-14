import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, RefreshCw, TestTubeDiagonal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { ResultTimestamp } from '@/components/result-timestamp'
import { StatusBadge } from '@/components/status-badge'
import { useNavigationSession } from '@/features/workspace/navigation-session'
import { canPerform } from '@/features/workspace/scoped-access'
import {
  healthLabel,
  healthReasons,
  healthRequest,
  healthTone,
  useHealth,
  type HealthAssessment,
} from './health-api'
import { HealthTestSettings } from './health-test-settings'

export function HealthCoverageDetails({
  repositoryId,
  assessmentId,
}: {
  repositoryId: string
  assessmentId: string
}) {
  const session = useNavigationSession()
  const cache = useQueryClient()
  const query = useHealth(repositoryId, assessmentId)
  const data = query.data
  const row = data?.assessment
  const report = row?.report
  const analysis = report?.analyses.find((item) => item.id === 'tests.coverage')
  const coverage = report?.measurements?.coverage
  const allowed = canPerform(session.data, 'execution.run', repositoryId)
  const run = useMutation({
    mutationFn: () =>
      healthRequest<HealthAssessment>(
        `repositories/${repositoryId}/health`,
        undefined,
        {
          branch: row!.branch,
          category: 'coverage',
          requestKey: crypto.randomUUID(),
        }
      ),
    meta: { successMessage: 'Test coverage assessment queued.' },
    onSuccess: () =>
      cache.invalidateQueries({ queryKey: ['repository-health'] }),
  })
  const percentage = coverage?.analyzedLines
    ? `${((100 * coverage.coveredLines) / coverage.analyzedLines).toFixed(1)}%`
    : '—'

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
        title='Test coverage'
        section='Repository health'
        icon={TestTubeDiagonal}
        tone='teal'
        description='Measured test coverage for one saved repository assessment.'
        actions={
          <>
            {data && (
              <HealthTestSettings
                key={`${repositoryId}:${data.testSettingsRevision ?? 0}`}
                repositoryId={repositoryId}
                data={data}
                allowed={allowed}
              />
            )}
            {allowed && row && (
              <Button
                size='sm'
                disabled={
                  run.isPending || ['QUEUED', 'RUNNING'].includes(row.state)
                }
                onClick={() => run.mutate()}
              >
                <RefreshCw /> Run test coverage
              </Button>
            )}
          </>
        }
      />
      {run.isError && (
        <p
          role='alert'
          className='rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive'
        >
          {run.error.message}
        </p>
      )}
      {run.data && (
        <p role='status' className='rounded-lg border bg-muted/20 p-4 text-sm'>
          Test coverage is queued for the current head of {run.data.branch}.{' '}
          <Link
            to='/repositories/$repositoryId'
            params={{ repositoryId }}
            search={{ tab: 'health', health: run.data.id }}
            className='font-medium underline underline-offset-4'
          >
            View the running assessment
          </Link>
        </p>
      )}
      {query.isPending && (
        <Skeleton
          className='h-64 rounded-xl'
          aria-label='Loading test coverage'
        />
      )}
      {query.isError && (
        <p
          role='alert'
          className='rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive'
        >
          {query.error.message}
        </p>
      )}
      {row && (
        <Card className='gap-0 overflow-hidden py-0'>
          <CardHeader className='gap-3 border-b p-5'>
            <div className='flex flex-wrap items-start justify-between gap-3'>
              <div>
                <CardTitle>Coverage result</CardTitle>
                <p className='mt-1 text-sm text-muted-foreground'>
                  {row.branch} · commit{' '}
                  <code>{row.sourceSha?.slice(0, 12) ?? 'not pinned yet'}</code>{' '}
                  · assessed <ResultTimestamp value={row.finishedAt} />
                </p>
              </div>
              {analysis && (
                <StatusBadge tone={healthTone(analysis.state)}>
                  {healthLabel(analysis.state)}
                </StatusBadge>
              )}
            </div>
          </CardHeader>
          <CardContent className='space-y-4 p-5'>
            <div>
              <p className='text-3xl font-semibold tabular-nums'>
                {percentage}
              </p>
              <p className='mt-1 text-sm text-muted-foreground'>
                {coverage?.analyzedLines
                  ? `${coverage.coveredLines} of ${coverage.analyzedLines} measured lines covered · ${coverage.tests} tests passed`
                  : analysis
                    ? (healthReasons[analysis.reason] ??
                      'No completed test coverage measurement is available.')
                    : 'Test coverage was not included in this saved assessment.'}
              </p>
            </div>
            {analysis?.testResults?.length ? (
              <div>
                <h2 className='text-sm font-semibold'>Package results</h2>
                <ul className='mt-2 grid gap-3 sm:grid-cols-2'>
                  {analysis.testResults.map((result) => (
                    <li
                      key={result.directory}
                      className='rounded-lg border p-3 text-sm'
                    >
                      <p className='font-medium'>
                        <code>{result.directory}</code> · {result.framework}
                      </p>
                      <p className='mt-1 text-muted-foreground'>
                        {result.state === 'PASS'
                          ? 'Tests passed; coverage collected.'
                          : (healthReasons[result.reason] ??
                            'Test execution was incomplete.')}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className='text-xs text-muted-foreground'>
              Coverage measures the configured tests at the saved commit. A new
              run assesses the current head of {row.branch}; missing coverage is
              never treated as zero.
            </p>
          </CardContent>
        </Card>
      )}
    </Main>
  )
}
