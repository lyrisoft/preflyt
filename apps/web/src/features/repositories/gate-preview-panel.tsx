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
  status: 'PASS' | 'WARN' | 'BLOCK' | 'INCOMPLETE'
  evaluationHash: string
  requiredRules: number
  requiredRulesSatisfied: number
  advisoryIncomplete: number
  advisoryFailed: number
  requiredRulesBlocked: number
  requiredRulesIncomplete: number
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
const reasonLabels: Record<string, string> = {
  COLLECTION_INCOMPLETE: 'Not all CI results were collected.',
  CONFIGURATION_NOT_ESTABLISHED:
    'The required configuration could not be confirmed.',
  PROFILE_NOT_COMPLETE_AT_REVISION:
    'Repository inspection was incomplete for this commit.',
  CONFIGURATION_EVIDENCE_MISSING:
    'The required configuration evidence is missing.',
  RULE_ADAPTER_UNSUPPORTED:
    'Preflyt does not support evaluating this check yet.',
  TRUSTED_EXECUTION_NOT_ESTABLISHED:
    'The tools and checks that ran have not been verified.',
  EVIDENCE_INTEGRITY_INVALID: 'The saved evidence failed verification.',
  SOURCE_AMBIGUOUS: 'More than one CI result could match this check.',
  SOURCE_SUPERSEDED: 'A newer CI result has replaced this one.',
  APPROVED_CI_SOURCE_FAILED: 'The approved CI check or workflow failed.',
  SNAPSHOT_SCHEMA_UNSUPPORTED:
    'This saved assessment format cannot be evaluated.',
  NO_REQUIRED_RULES: 'This assessment has no required checks.',
}
const label = (reason: string) =>
  reasonLabels[reason] ?? reason.toLowerCase().replace(/_/g, ' ')
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
          Merge review result
        </CardTitle>
        <CardDescription>
          Results for this saved assessment. GitHub check publication and merge
          protection are configured separately in Quality Gates.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {query.isPending ? (
          <p role='status'>Checking saved requirements…</p>
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
                  tone={
                    query.data.status === 'PASS'
                      ? 'success'
                      : query.data.status === 'BLOCK'
                        ? 'error'
                        : 'warning'
                  }
                >
                  {query.data.status}
                </StatusBadge>
                <code className='text-xs'>
                  {query.data.sourceSha.slice(0, 12)}
                </code>
              </div>
              <p className='text-sm tabular-nums'>
                {query.data.requiredRulesSatisfied} / {query.data.requiredRules}{' '}
                required checks passed · {query.data.requiredRulesBlocked}{' '}
                blocked · {query.data.requiredRulesIncomplete} incomplete
              </p>
            </div>
            <p className='text-xs text-muted-foreground'>
              PASS for a configuration check means the required files were
              found. A successful CI result or a verified report signature does
              not prove which tools and checks ran. BLOCK means an approved CI
              check or workflow failed; it does not confirm a specific defect.
            </p>
            {query.data.reasons.map((r) => (
              <p key={r} role='status' className='text-sm text-warning'>
                {label(r)}
              </p>
            ))}
            <details className='rounded-lg border bg-background/60 p-3'>
              <summary className='cursor-pointer text-sm font-medium'>
                Check results and missing evidence ({query.data.rules.length})
              </summary>
              <ul className='mt-3 space-y-3'>
                {query.data.rules.map((rule) => (
                  <li key={rule.ruleId} className='rounded-md border p-3'>
                    <div className='flex flex-wrap items-center justify-between gap-2'>
                      <span className='text-sm font-medium'>
                        {rule.title}{' '}
                        <span className='font-normal text-muted-foreground'>
                          · {rule.required ? 'Required' : 'Optional'}
                        </span>
                      </span>
                      <StatusBadge
                        tone={
                          rule.status === 'PASS'
                            ? 'success'
                            : rule.status === 'BLOCK'
                              ? 'error'
                              : 'warning'
                        }
                      >
                        {rule.status}
                      </StatusBadge>
                    </div>
                    <p className='mt-2 text-xs text-muted-foreground'>
                      {rule.reasons.length
                        ? rule.reasons.map(label).join(' · ')
                        : 'Required configuration found at this commit.'}
                    </p>
                    {rule.deliveryId && (
                      <a
                        className='mt-2 inline-flex items-center gap-1 text-xs text-info underline'
                        href={`${API_BASE_URL}/github/repositories/${encodeURIComponent(repositoryId)}/ci-evidence?sha=${query.data.sourceSha}`}
                        target='_blank'
                        rel='noreferrer'
                      >
                        Check results and reports for this commit{' '}
                        <ExternalLink className='size-3' aria-hidden='true' />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </details>
            <details className='text-xs text-muted-foreground'>
              <summary className='cursor-pointer'>Evaluation details</summary>
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
