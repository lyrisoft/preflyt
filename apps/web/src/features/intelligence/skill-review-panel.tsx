import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Sparkles, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import { governanceRequest } from '../repositories/governance-api'
import type { AiCheck } from '../repositories/repository-queries'
import { useNavigationSession } from '../workspace/navigation-session'

type Review = {
  id: string
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
        costMicroCents: string | null
      }[]
    | null
  reservedCents: number | null
  latencyMs: number | null
  checks?: AiCheck[]
  skills: { id: string; name: string; version: number; digest: string }[]
  result?: {
    findings: {
      checkId: string
      summary: string
      recommendation: string
      evidenceRefs: string[]
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
              <h3 className='text-base font-semibold'>
                Code Quality · AI Review
              </h3>
              <p className='mt-1 max-w-xl text-xs leading-5 text-muted-foreground'>
                {stage === 'pull_request'
                  ? 'Reviews assessment evidence and, when enabled, verified PR changes.'
                  : 'Reviews saved assessment evidence. Source code is not sent.'}
              </p>
            </div>
          </div>
          <StatusBadge tone='info'>Suggestions only</StatusBadge>
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
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
        {data?.enabled && allowed && (
          <div className='space-y-3'>
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
        )}
        {error && (
          <p role='alert' className='text-sm text-destructive'>
            {error}
          </p>
        )}
        {data?.reviews.slice((current - 1) * 5, current * 5).map((r) => (
          <article key={r.id} className='space-y-3 border-t pt-5'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <p className='text-sm font-medium'>
                {r.checks?.length
                  ? r.checks
                      .map((c) => `${c.title} · skill v${c.skillVersion}`)
                      .join(' · ')
                  : r.skills.map((s) => `${s.name} v${s.version}`).join(' · ')}
              </p>
              <StatusBadge
                tone={
                  r.state === 'SUCCEEDED'
                    ? 'success'
                    : r.state === 'UNAVAILABLE'
                      ? 'warning'
                      : 'neutral'
                }
              >
                {r.state.replace(/_/g, ' ')}
              </StatusBadge>
            </div>
            <p className='text-xs text-muted-foreground'>
              {r.automatic
                ? 'Automatic published-policy review'
                : 'Requested review'}{' '}
              ·{' '}
              {r.sourceReviewed
                ? 'PR changes reviewed'
                : 'Assessment evidence only'}
              {r.feedbackState && r.feedbackState !== 'NOT_REQUESTED'
                ? ` · GitHub summary: ${r.feedbackState.toLowerCase()}`
                : ''}
            </p>
            {r.inlineFeedbackUrl &&
              /^https:\/\/github\.com\//.test(r.inlineFeedbackUrl) && (
                <a
                  href={r.inlineFeedbackUrl}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='text-sm underline'
                >
                  View inline feedback on GitHub
                </a>
              )}
            {r.feedbackUrl &&
              /^https:\/\/github\.com\//.test(r.feedbackUrl) && (
                <a
                  href={r.feedbackUrl}
                  target='_blank'
                  rel='noreferrer'
                  className='text-sm underline'
                >
                  View GitHub summary
                </a>
              )}
            {r.result?.context.source && (
              <p className='text-xs text-muted-foreground'>
                Reviewed {r.result.context.source.lines.length} changed lines;{' '}
                {r.result.context.source.omittedFiles} files and{' '}
                {r.result.context.source.omittedLines} lines omitted.
              </p>
            )}
            {r.failure && (
              <p className='text-sm text-muted-foreground'>{r.failure}</p>
            )}
            {r.result?.findings.map((f, i) => (
              <div key={i} className='space-y-1 border-t pt-3 text-sm'>
                <div className='flex items-center gap-2'>
                  <StatusBadge tone='info'>AI suggestion</StatusBadge>
                  <span>
                    {r.checks?.find((c) => c.id === f.checkId)?.title}
                  </span>
                </div>
                <p>{f.summary}</p>
                <p className='text-muted-foreground'>{f.recommendation}</p>
                <p className='text-xs text-muted-foreground'>
                  Evidence:{' '}
                  {f.evidenceRefs
                    .map(
                      (ref) =>
                        r.result?.context.evidence.find((e) => e.ref === ref)
                          ?.ruleId ??
                        (() => {
                          const line = r.result?.context.source?.lines.find(
                            (l) => l.ref === ref
                          )
                          return line
                            ? `${line.path}:${line.line} (${line.side.toLowerCase()})`
                            : ref
                        })()
                    )
                    .join(', ')}
                </p>
              </div>
            ))}
            {r.state === 'SUCCEEDED' && !r.result?.findings.length && (
              <p className='text-sm text-muted-foreground'>
                No AI suggestions returned. This does not change check results.
              </p>
            )}
            {r.usage?.map((u, index) => (
              <p key={index} className='text-xs text-muted-foreground'>
                Provider-reported usage: {u.inputTokens ?? 'unknown'} input /{' '}
                {u.outputTokens ?? 'unknown'} output tokens
                {u.costMicroCents !== null
                  ? ` · Estimated cost from reported usage: $${(Number(u.costMicroCents) / 100000000).toFixed(6)}`
                  : ' · Cost unavailable'}
              </p>
            ))}
            <div className='flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground'>
              <span>
                {r.reservedCents === null
                  ? 'Usage restricted'
                  : `Reserved estimate: $${(r.reservedCents / 100).toFixed(4)}`}
                {r.latencyMs !== null
                  ? ` · ${(r.latencyMs / 1000).toFixed(1)}s`
                  : ''}
              </span>
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
            </div>
          </article>
        ))}
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
