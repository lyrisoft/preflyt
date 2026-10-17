import type { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { Link, getRouteApi } from '@tanstack/react-router'
import { ArrowLeft, ArrowUpRight, RefreshCw, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AppHeader } from '@/components/layout/app-header'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { PageHelpDrawer } from '@/components/page-help-drawer'
import { StatusBadge } from '@/components/status-badge'
import type { HealthData } from '@/features/health/health-api'
import { HotspotReview } from '@/features/health/hotspot-review'
import { useNavigationSession } from '@/features/workspace/navigation-session'
import { DuplicateCodeComparison } from './duplicate-code-comparison'
import { useFindingAiGuidance } from './finding-ai-api'
import { findingRequest, useFindingSource } from './finding-api'
import {
  FindingContext,
  FindingEvidence,
  FindingTriage,
} from './finding-detail-sections'
import { FindingIgnore } from './finding-ignore'
import { findingsSearch, type findingDetailSearch } from './finding-search'
import { FindingSourceViewer } from './finding-source'
import { severityTone, type Finding } from './finding-types'

export function FindingDetailsPage({
  findingId,
  search,
}: {
  findingId: string
  search: z.infer<typeof findingDetailSearch>
}) {
  const session = useNavigationSession()
  const health = search.origin === 'health'
  const valid =
    /^[a-f0-9]{64}$/.test(findingId) &&
    (!health ||
      (!!search.health && !!search.repository && search.repository !== 'all'))
  const params = new URLSearchParams(
    search.assessment ? { assessment: search.assessment } : {}
  )
  if (search.origin === 'ai') params.set('origin', 'ai')
  const path = health
    ? `github/repositories/${search.repository}/health?assessment=${search.health}`
    : `findings/${findingId}?${params}`
  const sourcePath = health
    ? `github/repositories/${search.repository}/health/${search.health}/findings/${findingId}/source`
    : `findings/${findingId}/source?${params}`
  const source = useFindingSource(sourcePath, valid)
  const result = useQuery({
    queryKey: [
      'finding-detail',
      session.data?.organizationId,
      session.data?.identityId,
      findingId,
      path,
      health,
      search.repository,
    ],
    enabled: session.isSuccess && valid,
    retry: false,
    gcTime: 0,
    queryFn: async ({
      signal,
    }): Promise<{ finding: Finding; canManage: boolean }> => {
      if (!health) return findingRequest(path, signal)
      const data = await findingRequest<HealthData>(path, signal)
      const row = data.assessment
      const finding = row?.report?.findings.find(
        (f) => f.fingerprint === findingId
      )
      if (!row?.sourceSha || !finding || !data.repository)
        throw new Error(
          'This finding is unavailable in the selected health report.'
        )
      return {
        canManage: false,
        finding: {
          id: findingId,
          title: finding.title,
          repositoryId: search.repository!,
          repository: data.repository,
          sourceSha: row.sourceSha,
          assessmentId: row.id,
          observedAt: row.finishedAt ?? row.createdAt,
          severity: finding.severity,
          status: 'Reported',
          path: finding.path,
          line: finding.line,
          endLine: finding.endLine,
          ruleId: finding.ruleId,
          evidence: [finding.evidence],
          verification: 'Verified analyzer receipt',
          occurrences: 1,
          category: finding.category,
          guidance: finding.guidance,
          referenceGuidance: finding.referenceGuidance,
          reportGuidance: finding.reportGuidance,
          relatedLocations: finding.relatedLocations,
        },
      }
    },
  })
  const data = result.isError || session.isError ? undefined : result.data
  const finding = data?.finding
  const ai = useFindingAiGuidance(
    finding && finding.origin !== 'ai'
      ? {
          origin: health ? 'health' : 'ci',
          repositoryId: finding.repositoryId,
          assessmentId: finding.assessmentId,
          findingId: finding.id,
        }
      : null
  )
  const displayedFinding =
    finding &&
    ai.data?.available &&
    ai.data.state === 'SUCCEEDED' &&
    ai.data.result?.sourceSha === finding.sourceSha
      ? { ...finding, aiGuidance: { ...ai.data.result, model: ai.data.model } }
      : finding
  const back = findingsSearch.parse(
    Object.fromEntries(new URLSearchParams(search.back ?? ''))
  )
  return (
    <>
      <AppHeader
        breadcrumbs={[
          { label: 'Findings', to: '/findings' },
          { label: 'Finding details' },
        ]}
      />
      <Main className='space-y-5'>
        <div>
          <Button variant='ghost' size='sm' asChild>
            {health && !search.back ? (
              <Link
                to='/repositories/$repositoryId'
                params={{ repositoryId: search.repository ?? '' }}
                search={{ tab: 'health', health: search.health }}
              >
                <ArrowLeft />
                Back to Health report
              </Link>
            ) : (
              <Link to='/findings' search={back}>
                <ArrowLeft />
                Back to findings
              </Link>
            )}
          </Button>
        </div>
        <PageHeader
          title={
            finding?.category === 'duplication'
              ? 'Duplicate code block'
              : (finding?.title ?? 'Finding details')
          }
          section='Workspace'
          description={
            finding
              ? `${finding.repository} · commit ${finding.sourceSha.slice(0, 12)}`
              : 'Source code and evidence for a saved finding.'
          }
          icon={ShieldAlert}
          tone='amber'
          actions={
            <>
              <Button
                variant='outline'
                size='sm'
                onClick={() => window.location.reload()}
              >
                <RefreshCw />
                Refresh
              </Button>
              <PageHelpDrawer
                title='Finding details'
                sections={[
                  {
                    title: 'Source code',
                    content:
                      'The source viewer loads a saved, verified code excerpt from Preflyt after checking repository access. Existing findings without an excerpt fetch and save it once at the exact assessed commit. Highlighted lines are coordinates supplied by the report and verified to exist in that file. File-only findings show a bounded excerpt without highlighting. Check summaries and missing evidence may have no file or line.',
                  },
                  {
                    title: 'Ignoring and reopening',
                    content:
                      'Ignoring persists across scans for the same source, rule, file, line range and message in this repository. A reason is required for ignoring or reopening; an optional expiry automatically reopens the finding. Saved assessments and merge policies remain unchanged. Review decisions and reasons are kept in the review history.',
                  },
                  {
                    title: 'Evidence and review',
                    content:
                      'A source location identifies where an analyzer reported an issue; it does not independently confirm a defect or exploit. Report source verification and original evidence remain visible. Review notes and human triage do not change the assessment or merge result. Secret excerpts and credential-looking context lines are hidden.',
                  },
                ]}
              />
            </>
          }
        >
          {finding && (
            <div className='flex flex-wrap items-center gap-2'>
              {finding.origin === 'ai' && finding.severity === 'unknown' ? (
                <span className='text-xs text-muted-foreground'>
                  Severity: - (not rated in this saved review)
                </span>
              ) : (
                <StatusBadge
                  tone={severityTone[finding.severity] ?? 'neutral'}
                  className='capitalize'
                >
                  {finding.severity}
                </StatusBadge>
              )}
              <StatusBadge tone='neutral'>{finding.status}</StatusBadge>
              {finding.origin === 'ai' && (
                <StatusBadge tone='info'>Suggestions only</StatusBadge>
              )}
              {health && (
                <StatusBadge tone='neutral'>Health assessment</StatusBadge>
              )}
            </div>
          )}
        </PageHeader>
        {!valid || session.isError || result.isError ? (
          <Card>
            <CardHeader>
              <CardTitle>Finding unavailable</CardTitle>
            </CardHeader>
            <CardContent>
              <p role='alert' className='text-sm'>
                {!valid
                  ? 'This finding link is incomplete or invalid.'
                  : (session.error?.message ?? result.error?.message)}
              </p>
            </CardContent>
          </Card>
        ) : result.isPending ? (
          <div
            role='status'
            aria-label='Loading finding details'
            className='grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]'
          >
            <Skeleton className='h-96 rounded-xl' />
            <Skeleton className='h-96 rounded-xl' />
          </div>
        ) : (
          finding && (
            <div className='grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]'>
              <div className='min-w-0 space-y-5'>
                {finding.category === 'duplication' &&
                finding.path &&
                finding.line ? (
                  <DuplicateCodeComparison
                    key={sourcePath}
                    finding={displayedFinding!}
                    source={source}
                    sourcePath={sourcePath}
                    aiState={
                      ai.generationFailed
                        ? 'FAILED'
                        : ai.data?.available
                          ? ai.data.state
                          : undefined
                    }
                    onRetryAi={
                      ai.data?.canGenerate &&
                      (ai.data.state === 'FAILED' || ai.generationFailed)
                        ? ai.retryGeneration
                        : undefined
                    }
                  />
                ) : (
                  <FindingSourceViewer
                    key={sourcePath}
                    finding={displayedFinding!}
                    source={source}
                    aiState={
                      ai.generationFailed
                        ? 'FAILED'
                        : ai.data?.available
                          ? ai.data.state
                          : undefined
                    }
                    onRetryAi={
                      ai.data?.canGenerate &&
                      (ai.data.state === 'FAILED' || ai.generationFailed)
                        ? ai.retryGeneration
                        : undefined
                    }
                  />
                )}
                <Card>
                  <CardHeader>
                    <CardTitle>Finding evidence</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <FindingEvidence
                      evidence={
                        finding.origin === 'ai'
                          ? (finding.evidenceLocations?.map((e) =>
                              e.path
                                ? `${e.path}:${e.line} (${e.side?.toLowerCase()})`
                                : (e.label ?? e.ref)
                            ) ?? finding.evidence)
                          : finding.evidence
                      }
                    />
                  </CardContent>
                </Card>
              </div>
              <aside
                className='min-w-0 space-y-5'
                aria-label='Finding context and review'
              >
                <Card>
                  <CardContent>
                    <FindingContext finding={finding} />
                    <div className='mt-4 border-t pt-4'>
                      <Button variant='outline' size='sm' asChild>
                        <Link
                          to='/repositories/$repositoryId'
                          params={{ repositoryId: finding.repositoryId }}
                          search={
                            health
                              ? { tab: 'health', health: finding.assessmentId }
                              : {
                                  tab: 'assessments',
                                  assessment: finding.assessmentId,
                                }
                          }
                        >
                          View assessment <ArrowUpRight />
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
                <FindingIgnore
                  key={sourcePath}
                  scope={`${session.data?.organizationId}:${session.data?.identityId}`}
                  path={`findings/${findingId}/ignore?${health ? new URLSearchParams({ origin: 'health', repository: search.repository!, assessment: search.health! }) : params}`}
                />
                {health && finding.category === 'hotspot' && (
                  <HotspotReview
                    repositoryId={finding.repositoryId}
                    assessmentId={finding.assessmentId}
                    fingerprint={finding.id}
                  />
                )}
                {!health && (
                  <FindingTriage
                    key={finding.id}
                    finding={finding}
                    canManage={data.canManage}
                    onSaved={() => void result.refetch()}
                  />
                )}
              </aside>
            </div>
          )
        )}
      </Main>
    </>
  )
}

export function FindingRoutePage() {
  const route = getRouteApi('/_authenticated/findings/$findingId')
  const { findingId } = route.useParams()
  const search = route.useSearch()
  return (
    <FindingDetailsPage
      key={findingId + (search.health ?? search.assessment ?? '')}
      findingId={findingId}
      search={search}
    />
  )
}
