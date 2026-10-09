import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import { governanceRequest } from '../repositories/governance-api'
import type { AiCheck } from '../repositories/repository-queries'
import { useNavigationSession } from '../workspace/navigation-session'

type Review = {
  id: string
  state: string
  failure: string | null
  reservedCents: number
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
    context: { evidence: { ref: string; ruleId: string; result: string }[] }
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
        checks: (AiCheck & { available: boolean })[]
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
    <section className='space-y-4 rounded-xl border p-5'>
      <div className='flex items-center justify-between gap-3'>
        <h3 className='flex items-center gap-2 text-sm font-semibold'>
          <Sparkles className='size-4' />
          Code Quality · AI Review
        </h3>
        <StatusBadge tone='info'>Advisory</StatusBadge>
      </div>
      <p className='text-xs text-muted-foreground'>
        Reviews saved assessment evidence. Source code is not sent.
      </p>
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
              <label key={s.id} className='flex items-center gap-2 text-sm'>
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
                {!s.available ? ' · Unavailable' : ''}
              </label>
            ))}
          </div>
          {!eligible.length && (
            <p className='text-sm text-muted-foreground'>
              No AI Reviews are assigned in this assessment. Add them to
              Engineering Standards, adopt the version and create a new
              assessment.
            </p>
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
                void action('', { assessmentId, checkIds: selected })
              }
            >
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
        <article key={r.id} className='space-y-3 rounded-lg border p-4'>
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
          {r.failure && (
            <p className='text-sm text-muted-foreground'>{r.failure}</p>
          )}
          {r.result?.findings.map((f, i) => (
            <div key={i} className='space-y-1 border-t pt-3 text-sm'>
              <div className='flex items-center gap-2'>
                <StatusBadge tone='info'>AI suggestion</StatusBadge>
                <span>{r.checks?.find((c) => c.id === f.checkId)?.title}</span>
              </div>
              <p>{f.summary}</p>
              <p className='text-muted-foreground'>{f.recommendation}</p>
              <p className='text-xs text-muted-foreground'>
                Evidence:{' '}
                {f.evidenceRefs
                  .map(
                    (ref) =>
                      r.result?.context.evidence.find((e) => e.ref === ref)
                        ?.ruleId ?? ref
                  )
                  .join(', ')}
              </p>
            </div>
          ))}
          {r.state === 'SUCCEEDED' && !r.result?.findings.length && (
            <p className='text-sm text-muted-foreground'>
              No advisory suggestions returned. This does not change check
              results.
            </p>
          )}
          <div className='flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground'>
            <span>
              Reserved estimate: ${(r.reservedCents / 100).toFixed(4)}
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
    </section>
  )
}
