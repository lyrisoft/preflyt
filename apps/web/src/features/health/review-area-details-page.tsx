import { Link } from '@tanstack/react-router'
import { ArrowLeft, FileSearch, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AppHeader } from '@/components/layout/app-header'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { PageHelpDrawer } from '@/components/page-help-drawer'
import { ResultTimestamp } from '@/components/result-timestamp'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import { useHealth } from './health-api'
import { reviewAreaOutcomes, sourceReviewAreas } from './source-review-areas'

export function ReviewAreaDetailsPage({
  repositoryId,
  assessmentId,
  areaId,
}: {
  repositoryId?: string
  assessmentId: string
  areaId: string
}) {
  const valid =
    !!repositoryId &&
    /^[1-9][0-9]{0,15}$/.test(repositoryId) &&
    /^[a-f0-9-]{36}$/i.test(assessmentId) &&
    /^(0|[1-9][0-9]{0,2})$/.test(areaId)
  const query = useHealth(repositoryId ?? '', assessmentId, 1, valid)
  const data = query.isError ? undefined : query.data
  const assessment = data?.assessment
  const report = assessment?.id === assessmentId ? assessment.report : null
  const coverage = report?.sourceReviewCoverage
  const entry =
    report?.analyses.some((a) => a.id === 'security.strix') &&
    coverage?.available
      ? sourceReviewAreas(coverage)[Number(areaId)]
      : undefined
  const outcome = entry ? reviewAreaOutcomes[entry.outcome] : undefined
  return (
    <>
      <AppHeader
        breadcrumbs={[
          { label: 'Repositories', to: '/repositories' },
          { label: 'AI review details' },
        ]}
      />
      <Main className='space-y-5'>
        {repositoryId && (
          <Button variant='ghost' size='sm' asChild>
            <Link
              to='/repositories/$repositoryId'
              params={{ repositoryId }}
              search={{
                tab: 'health',
                health: assessmentId,
                branch: assessment?.branch,
              }}
            >
              <ArrowLeft />
              Back to security report
            </Link>
          </Button>
        )}
        <PageHeader
          title='AI review details'
          section='Workspace'
          icon={FileSearch}
          tone='blue'
          description={data?.repository}
          actions={
            <>
              <Button
                variant='outline'
                size='sm'
                onClick={() => void query.refetch()}
                disabled={!valid || query.isFetching}
              >
                <RefreshCw />
                Refresh
              </Button>
              <PageHelpDrawer
                title='AI review details'
                sections={[
                  {
                    title: 'Review areas and findings',
                    content:
                      'Review areas describe what the AI examined or left unresolved. A follow-up is not a confirmed vulnerability. Saved findings are separate records with supporting evidence.',
                  },
                  {
                    title: 'Scope and evidence',
                    content:
                      'This review reads repository source only. Source references and notes are AI-reported. No live API test or exploit execution is established by these records.',
                  },
                ]}
              />
            </>
          }
        >
          {outcome && (
            <div className='flex flex-wrap gap-2'>
              <StatusBadge tone={outcome.tone}>{outcome.label}</StatusBadge>
              <StatusBadge tone='info'>Suggestions only</StatusBadge>
            </div>
          )}
        </PageHeader>
        {!valid || query.isError ? (
          <Card>
            <CardHeader>
              <CardTitle asChild>
                <h2>Review details unavailable</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p role='alert' className='text-sm'>
                {!valid
                  ? 'This review link is incomplete or invalid.'
                  : query.error?.message}
              </p>
            </CardContent>
          </Card>
        ) : query.isPending ? (
          <Skeleton
            aria-label='Loading review details'
            className='h-64 rounded-xl'
          />
        ) : !entry ? (
          <Card>
            <CardHeader>
              <CardTitle asChild>
                <h2>Review area unavailable</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p role='alert' className='text-sm'>
                This area is not present in the saved security report.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle
                  asChild
                  className='max-w-[72ch] leading-relaxed [overflow-wrap:anywhere]'
                >
                  <h2>{entry.riskArea || 'Review area not specified'}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-5'>
                <dl className='grid gap-4 text-sm sm:grid-cols-3'>
                  <div>
                    <dt className='text-xs text-muted-foreground'>Branch</dt>
                    <dd className='mt-1 [overflow-wrap:anywhere]'>
                      {assessment?.branch}
                    </dd>
                  </div>
                  <div>
                    <dt className='text-xs text-muted-foreground'>Commit</dt>
                    <dd className='mt-1 font-mono text-xs [overflow-wrap:anywhere]'>
                      {assessment?.sourceSha ?? 'Not recorded'}
                    </dd>
                  </div>
                  <div>
                    <dt className='text-xs text-muted-foreground'>
                      Review completed
                    </dt>
                    <dd className='mt-1'>
                      <ResultTimestamp value={assessment?.finishedAt} />
                    </dd>
                  </div>
                </dl>
                <p className='text-sm text-muted-foreground'>
                  Source review only. This record does not establish that a test
                  ran or that the area is secure.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className='flex flex-row items-center gap-3'>
                <SurfaceIcon icon={FileSearch} tone='blue' />
                <CardTitle asChild>
                  <h2>Source references</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className='max-w-[100ch] font-mono text-xs leading-6 [overflow-wrap:anywhere]'>
                  {entry.surface || 'No source reference was recorded.'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle asChild>
                  <h2>
                    {entry.notes.length
                      ? 'What needs review'
                      : 'Recorded result'}
                  </h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className='max-w-[80ch] space-y-3 text-sm leading-relaxed'>
                  {(entry.notes.length
                    ? entry.notes
                    : [outcome?.label ?? 'No review notes were recorded.']
                  ).map((note, index) => (
                    <li key={index} className='[overflow-wrap:anywhere]'>
                      {note}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            {coverage?.truncated && (
              <p role='status' className='text-sm text-muted-foreground'>
                Some review details were omitted from this saved report.
              </p>
            )}
            {coverage?.caveats.map((caveat, index) => (
              <p
                key={index}
                className='text-sm [overflow-wrap:anywhere] text-muted-foreground'
              >
                {caveat}
              </p>
            ))}
          </>
        )}
      </Main>
    </>
  )
}
