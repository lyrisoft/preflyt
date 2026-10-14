import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Sparkles, Play, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ResultTimestamp } from '@/components/result-timestamp'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import { governanceRequest } from '../repositories/governance-api'
import type { AiCheck } from '../repositories/repository-queries'
import { useNavigationSession } from '../workspace/navigation-session'

type Review = {
  id: string
  assessmentId?: string
  relatedAssessment?: boolean
  createdAt?: string | null
  finishedAt?: string | null
  automatic?: boolean
  sourceReviewed?: boolean
  feedbackState?: string
  feedbackUrl?: string | null
  inlineFeedbackUrl?: string | null
  state: string
  failure: string | null
  usage?:
    | {
        providerId: string
        inputTokens: number | null
        outputTokens: number | null
      }[]
    | null
  latencyMs: number | null
  checks?: AiCheck[]
  skills: { id: string; name: string; version: number; digest: string }[]
  result?: {
    findings: {
      checkId: string
      findingId?: string | null
      summary: string
      recommendation: string
      evidenceRefs: string[]
      severity?: string
      impact?: string
    }[]
    context: {
      evidence: { ref: string; ruleId: string; result: string }[]
      source?: {
        omittedFiles: number
        omittedLines: number
        lines: { ref: string; path: string; line: number; side: string }[]
      }
    }
  }
}
export function SkillReviewPanel({
  repositoryId,
  assessmentId,
  stage,
}: {
  repositoryId: string
  assessmentId: string
  stage: 'repository' | 'pull_request'
}) {
  const session = useNavigationSession(),
    client = useQueryClient(),
    allowed =
      session.data?.permissions?.includes('ai.review.run') ??
      [
        'OWNER',
        'ADMIN',
        'DEVELOPER',
        'ENGINEERING_LEAD',
        'SECURITY_ENGINEER',
        'POLICY_MANAGER',
      ].includes(session.data?.role ?? '')
  const scope = [session.data?.identityId, session.data?.organizationId],
    key = ['skill-reviews', ...scope, repositoryId, assessmentId]
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      governanceRequest<{
        enabled: boolean
        reviews: Review[]
        checks: (AiCheck & {
          available: boolean
          selection?: { eligible: boolean; reason: string | null }
        })[]
      }>(
        `/github/repositories/${repositoryId}/ai-reviews?assessmentId=${encodeURIComponent(assessmentId)}`,
        undefined,
        signal
      ),
    retry: false,
    refetchInterval: (q) =>
      q.state.data?.reviews.some((r) => ['QUEUED', 'RUNNING'].includes(r.state))
        ? 2000
        : stage === 'pull_request' &&
            q.state.data?.enabled &&
            q.state.data?.checks.length &&
            !q.state.data?.reviews.length
          ? 5000
          : false,
  })
  const [includeSource, setIncludeSource] = useState(false)
  const [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [page, setPage] = useState(1)
  const eligible = query.isError
    ? []
    : (query.data?.checks ?? []).filter((c) => c.stages.includes(stage))
  const data = query.isError ? undefined : query.data,
    pages = Math.max(1, Math.ceil((data?.reviews.length ?? 0) / 5)),
    current = Math.min(page, pages)
  async function action(path: string, body: unknown) {
    setBusy(true)
    setError('')
    try {
      await governanceRequest(
        `/github/repositories/${repositoryId}/ai-reviews${path}`,
        body
      )
      await client.invalidateQueries({ queryKey: key })
      if (path.endsWith('/retry')) toast.success('AI review queued')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review unavailable')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className='gap-4'>
      <CardHeader>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='flex items-center gap-3'>
            <SurfaceIcon icon={Sparkles} tone='violet' />
            <div>
              <h3 className='text-base font-semibold'>AI review</h3>
              <p className='mt-1 max-w-xl text-xs leading-5 text-muted-foreground'>
                {stage === 'pull_request'
                  ? 'Suggestions to help you review this change.'
                  : 'Suggestions based on the saved assessment.'}
              </p>
            </div>
          </div>
          <div className='flex items-center gap-2'>
            <StatusBadge tone='info'>Suggestions only</StatusBadge>
            <Button
              size='sm'
              variant='outline'
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
              aria-label='Refresh AI reviews'
            >
              <RefreshCw className='size-4' />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        {query.isPending && (
          <p role='status' className='text-sm text-muted-foreground'>
            Loading saved AI reviews…
          </p>
        )}
        {data && !data.reviews.length && (
          <p className='text-sm text-muted-foreground'>
            No saved AI review for this assessment or matching PR revision yet.
          </p>
        )}
        {query.isError && (
          <p role='alert' className='text-sm text-destructive'>
            Review history unavailable.
          </p>
        )}
        {data && !data.enabled && (
          <p className='text-sm text-muted-foreground'>
            AI reviews are disabled for this deployment.
          </p>
        )}
        {error && (
          <p role='alert' className='text-sm text-destructive'>
            {error}
          </p>
        )}
        {data?.reviews.slice((current - 1) * 5, current * 5).map((r) => (
          <article key={r.id} className='space-y-3 border-t pt-5'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <div>
                <h4 className='text-base font-semibold'>
                  {r.state === 'SUCCEEDED'
                    ? `${r.result?.findings.length ?? 0} suggestion${r.result?.findings.length === 1 ? '' : 's'}`
                    : 'Review progress'}
                </h4>
                <p className='mt-1 text-xs text-muted-foreground'>
                  Reviewed{' '}
                  <ResultTimestamp value={r.finishedAt ?? r.createdAt} />
                </p>
              </div>
              <StatusBadge
                tone={r.state === 'UNAVAILABLE' ? 'warning' : 'neutral'}
              >
                {r.state === 'SUCCEEDED'
                  ? 'Completed'
                  : r.state === 'UNAVAILABLE'
                    ? 'Result unavailable'
                    : r.state.replace(/_/g, ' ')}
              </StatusBadge>
            </div>
            {r.relatedAssessment && r.assessmentId && (
              <p className='text-xs text-muted-foreground'>
                Same PR revision ·{' '}
                <Link
                  to='/repositories/$repositoryId'
                  params={{ repositoryId }}
                  search={{ tab: 'assessments', assessment: r.assessmentId }}
                  className='underline underline-offset-4'
                >
                  Open original assessment
                </Link>
              </p>
            )}
            {r.failure && (
              <p className='text-sm text-muted-foreground'>{r.failure}</p>
            )}
            {allowed && data.enabled && r.state === 'UNAVAILABLE' && (
              <Button
                variant='outline'
                size='sm'
                disabled={busy}
                onClick={() => void action(`/${r.id}/retry`, {})}
              >
                Retry AI review
              </Button>
            )}
            {!!r.result?.findings.length && (
              <div className='overflow-hidden rounded-lg border'>
                <Table aria-label='AI suggestions'>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Suggestion</TableHead>
                      <TableHead className='w-24'>Severity</TableHead>
                      <TableHead className='w-24'>
                        <span className='sr-only'>Details</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {r.result.findings.map((f, i) => (
                      <TableRow key={f.findingId ?? i}>
                        <TableCell className='min-w-64 py-4 whitespace-normal'>
                          <p className='line-clamp-2 text-sm leading-6 font-medium'>
                            {f.summary}
                          </p>
                          {f.impact && (
                            <p className='mt-1 line-clamp-1 text-xs text-muted-foreground'>
                              Potential impact: {f.impact}
                            </p>
                          )}
                          {!f.findingId && (
                            <details className='mt-2 text-xs text-muted-foreground'>
                              <summary className='cursor-pointer'>
                                Recommendation and evidence
                              </summary>
                              <p className='mt-2'>{f.recommendation}</p>
                              <p className='mt-1'>
                                Evidence:{' '}
                                {f.evidenceRefs
                                  .map((ref) => {
                                    const line =
                                      r.result?.context.source?.lines.find(
                                        (l) => l.ref === ref
                                      )
                                    return line
                                      ? `${line.path}:${line.line} (${line.side.toLowerCase()})`
                                      : (r.result?.context.evidence.find(
                                          (e) => e.ref === ref
                                        )?.ruleId ?? ref)
                                  })
                                  .join(', ')}
                              </p>
                            </details>
                          )}
                        </TableCell>
                        <TableCell>
                          {f.severity ? (
                            <StatusBadge tone='neutral'>
                              {f.severity}
                            </StatusBadge>
                          ) : (
                            <span title='Not rated in this saved review'>
                              -
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {f.findingId && r.assessmentId && (
                            <Button asChild variant='outline' size='sm'>
                              <Link
                                to='/findings/$findingId'
                                params={{ findingId: f.findingId }}
                                search={{
                                  assessment: r.assessmentId,
                                  origin: 'ai',
                                  back: `source=ai&kind=ai&repository=${repositoryId}`,
                                }}
                              >
                                Details
                              </Link>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {r.state === 'SUCCEEDED' && !r.result?.findings.length && (
              <p className='text-sm text-muted-foreground'>
                No AI suggestions returned. This does not change check results.
              </p>
            )}
            <details className='text-xs text-muted-foreground'>
              <summary className='cursor-pointer py-1'>Review details</summary>
              <div className='mt-3 space-y-2'>
                <p>
                  {r.checks?.length
                    ? r.checks
                        .map((c) => `${c.title} · skill v${c.skillVersion}`)
                        .join(' · ')
                    : r.skills
                        .map((s) => `${s.name} v${s.version}`)
                        .join(' · ')}
                </p>
                <p>
                  {r.automatic
                    ? 'Automatic published-policy review'
                    : 'Requested review'}{' '}
                  ·{' '}
                  {r.sourceReviewed
                    ? 'PR changes reviewed'
                    : 'Assessment evidence only'}
                </p>
                {r.feedbackState && r.feedbackState !== 'NOT_REQUESTED' && (
                  <p>GitHub publication: {r.feedbackState.toLowerCase()}</p>
                )}
                {r.result?.context.source && (
                  <p>
                    Reviewed {r.result.context.source.lines.length} changed
                    lines; {r.result.context.source.omittedFiles} files and{' '}
                    {r.result.context.source.omittedLines} lines omitted.
                  </p>
                )}
                {r.inlineFeedbackUrl &&
                  /^https:\/\/github\.com\//.test(r.inlineFeedbackUrl) && (
                    <a
                      href={r.inlineFeedbackUrl}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='block underline'
                    >
                      View inline feedback on GitHub
                    </a>
                  )}
                {r.feedbackUrl &&
                  /^https:\/\/github\.com\//.test(r.feedbackUrl) && (
                    <a
                      href={r.feedbackUrl}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='block underline'
                    >
                      View GitHub summary
                    </a>
                  )}
                {r.usage?.map((u, i) => (
                  <p key={i}>
                    Provider-reported usage: {u.inputTokens ?? 'unknown'} input
                    / {u.outputTokens ?? 'unknown'} output tokens
                  </p>
                ))}
                {r.latencyMs !== null && (
                  <p>Duration: {(r.latencyMs / 1000).toFixed(1)}s</p>
                )}
              </div>
            </details>
            {allowed && ['QUEUED', 'RUNNING'].includes(r.state) && (
              <Button
                variant='outline'
                size='sm'
                disabled={busy}
                onClick={() => void action(`/${r.id}/cancel`, {})}
              >
                Cancel
              </Button>
            )}
          </article>
        ))}
        {data?.enabled && allowed && (
          <details
            className='rounded-lg border p-4'
            open={!data.reviews.length}
          >
            <summary className='cursor-pointer text-sm font-medium'>
              New review
            </summary>
            <div className='mt-4 space-y-3'>
              <div className='flex flex-wrap gap-3'>
                {eligible.map((s) => (
                  <label
                    key={s.id}
                    className='flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2.5 text-sm'
                  >
                    <input
                      type='checkbox'
                      checked={selected.includes(s.id)}
                      disabled={
                        busy ||
                        !s.available ||
                        (!selected.includes(s.id) && selected.length >= 3)
                      }
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, s.id]
                            : selected.filter((id) => id !== s.id)
                        )
                      }
                    />
                    {s.title} · skill v{s.skillVersion}
                    {!s.available
                      ? ` · ${s.selection?.reason ?? 'Unavailable'}`
                      : ''}
                  </label>
                ))}
              </div>
              {!eligible.length && (
                <p className='text-sm text-muted-foreground'>
                  No AI Reviews are assigned in this assessment. Add them to
                  Standards, adopt the version and create a new assessment.
                </p>
              )}
              {stage === 'pull_request' && (
                <label className='flex items-center gap-2 text-sm'>
                  <input
                    type='checkbox'
                    checked={includeSource}
                    disabled={busy}
                    onChange={(e) => setIncludeSource(e.target.checked)}
                  />
                  Include PR changes (requires source sharing)
                </label>
              )}
              <div className='flex justify-end'>
                <Button
                  size='sm'
                  disabled={
                    busy ||
                    !selected.length ||
                    selected.some(
                      (id) => !eligible.some((c) => c.id === id && c.available)
                    )
                  }
                  onClick={() =>
                    void action('', {
                      assessmentId,
                      checkIds: selected,
                      ...(includeSource ? { includeSource: true } : {}),
                    })
                  }
                >
                  <Play className='size-3.5' aria-hidden='true' />
                  Run review
                </Button>
              </div>
            </div>
          </details>
        )}
        {pages > 1 && (
          <nav aria-label='AI review pages' className='flex justify-end gap-2'>
            <Button
              size='sm'
              variant='outline'
              disabled={current === 1}
              onClick={() => setPage(current - 1)}
            >
              Previous
            </Button>
            <span className='self-center text-sm'>
              {current} / {pages}
            </span>
            <Button
              size='sm'
              variant='outline'
              disabled={current === pages}
              onClick={() => setPage(current + 1)}
            >
              Next
            </Button>
          </nav>
        )}
      </CardContent>
    </Card>
  )
}
