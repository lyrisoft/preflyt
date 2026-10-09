import { useQuery } from '@tanstack/react-query'
import { ShieldCheck, ExternalLink } from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { StatusBadge } from '@/components/status-badge'
import { engineeringRead } from './engineering-queries'

type GatePreview = {
  evaluatorVersion: number
  sourceSha: string
  status: 'PASS' | 'WARN' | 'INCOMPLETE'
  evaluationHash: string
  requiredRules: number
  requiredRulesSatisfied: number
  advisoryIncomplete: number
  reasons: string[]
  rules: {
    ruleId: string
    title: string
    required: boolean
    status: string
    reasons: string[]
    deliveryId: string | null
  }[]
}
const label = (reason: string) => reason.toLowerCase().replace(/_/g, ' ')
export function GatePreviewPanel({
  repositoryId,
  assessmentId,
}: {
  repositoryId: string
  assessmentId: string
}) {
  const query = useQuery({
    queryKey: ['gate-preview', repositoryId, assessmentId],
    retry: false,
    queryFn: ({ signal }) =>
      engineeringRead<GatePreview>(
        repositoryId,
        `/assessments/${encodeURIComponent(assessmentId)}/gate-preview`,
        signal
      ),
  })
  return (
    <Card className='border-info/20 bg-info/5'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <ShieldCheck className='size-5 text-info' aria-hidden='true' />
          Policy gate preview
        </CardTitle>
        <CardDescription>
          Historical evaluation of this snapshot. GitHub publication and merge
          blocking are disabled.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {query.isPending ? (
          <p role='status'>Evaluating frozen policy…</p>
        ) : query.isError ? (
          <div role='alert'>
            <p>{query.error.message}</p>
            <Button
              variant='outline'
              size='sm'
              onClick={() => void query.refetch()}
            >
              Retry preview
            </Button>
          </div>
        ) : (
          <>
            <div className='flex flex-wrap items-center justify-between gap-4'>
              <div className='flex items-center gap-3'>
                <StatusBadge
                  tone={query.data.status === 'PASS' ? 'success' : 'warning'}
                >
                  {query.data.status}
                </StatusBadge>
                <code className='text-xs'>
                  {query.data.sourceSha.slice(0, 12)}
                </code>
              </div>
              <p className='text-sm tabular-nums'>
                {query.data.requiredRulesSatisfied} / {query.data.requiredRules}{' '}
                required rules satisfied · {query.data.advisoryIncomplete}{' '}
                advisory incomplete
              </p>
            </div>
            <p className='text-xs text-muted-foreground'>
              Configuration PASS confirms only the frozen configuration
              requirement. Provider success or signed report provenance cannot
              establish verified execution.
            </p>
            {query.data.reasons.map((r) => (
              <p key={r} role='status' className='text-sm text-warning'>
                {label(r)}
              </p>
            ))}
            <details className='rounded-lg border bg-background/60 p-3'>
              <summary className='cursor-pointer text-sm font-medium'>
                Rule outcomes and evidence gaps ({query.data.rules.length})
              </summary>
              <ul className='mt-3 space-y-3'>
                {query.data.rules.map((rule) => (
                  <li key={rule.ruleId} className='rounded-md border p-3'>
                    <div className='flex flex-wrap items-center justify-between gap-2'>
                      <span className='text-sm font-medium'>
                        {rule.title}{' '}
                        <span className='font-normal text-muted-foreground'>
                          · {rule.required ? 'Required' : 'Advisory'}
                        </span>
                      </span>
                      <StatusBadge
                        tone={rule.status === 'PASS' ? 'success' : 'warning'}
                      >
                        {rule.status}
                      </StatusBadge>
                    </div>
                    <p className='mt-2 text-xs text-muted-foreground'>
                      {rule.reasons.length
                        ? rule.reasons.map(label).join(' · ')
                        : 'Revision-bound configuration observed.'}
                    </p>
                    {rule.deliveryId && (
                      <a
                        className='mt-2 inline-flex items-center gap-1 text-xs text-info underline'
                        href={`${API_BASE_URL}/github/repositories/${encodeURIComponent(repositoryId)}/ci-evidence?sha=${query.data.sourceSha}`}
                        target='_blank'
                        rel='noreferrer'
                      >
                        Exact-revision CI evidence{' '}
                        <ExternalLink className='size-3' aria-hidden='true' />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </details>
            <details className='text-xs text-muted-foreground'>
              <summary className='cursor-pointer'>Evaluation identity</summary>
              <p className='mt-2'>Evaluator v{query.data.evaluatorVersion}</p>
              <code className='block break-all'>
                {query.data.evaluationHash}
              </code>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  )
}
