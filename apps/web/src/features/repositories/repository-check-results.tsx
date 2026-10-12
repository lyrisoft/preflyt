import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  CircleX,
  FileSearch,
  GitCommitHorizontal,
  ListChecks,
  RefreshCw,
} from 'lucide-react'
import type { SurfaceTone } from '@/lib/surface-tones'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import { checkReview, reviewReason } from './assessment-result'
import { useGatePreview } from './engineering-queries'
import { RelativeTime } from './relative-time'
import {
  useAssessmentList,
  useStandards,
  type Profile,
} from './repository-queries'
import type { RepositoryTab } from './repository-tabs'

export function RepositoryCheckResults({
  repositoryId,
  profile,
  onOpenTab,
}: {
  repositoryId: string
  profile: Profile | null | undefined
  onOpenTab: (tab: RepositoryTab) => void
}) {
  const standards = useStandards(repositoryId)
  const selection =
    !standards.isError && standards.data?.selectionIntegrity
      ? standards.data.selection
      : null
  const history = useAssessmentList(repositoryId, {
    selectionId: selection?.id,
    selectionRevision: selection?.revision,
    enabled: !!selection,
  })
  const assessment =
    selection && !history.isError ? history.data?.assessments[0] : undefined
  const evaluation = useGatePreview(
    repositoryId,
    assessment?.id,
    !!selection && !history.isError
  )
  // Saved evaluation, selected policy revision and exact commit must agree.
  // Provider successes and repository setup hints cannot establish a pass.
  const result =
    !evaluation.isError &&
    evaluation.data?.sourceSha === assessment?.sourceSha &&
    !evaluation.data?.reasons.includes('SNAPSHOT_SCHEMA_UNSUPPORTED')
      ? evaluation.data
      : undefined
  const controls =
    standards.isError || standards.data?.selectionIntegrity === false
      ? []
      : (standards.data?.controls ?? [])
  const rules =
    result?.rules ??
    controls.map((control) => ({
      ruleId: control.id,
      title: control.title,
      required: control.required,
      status: 'INCOMPLETE',
      reasons: [] as string[],
      deliveryId: null,
    }))
  const counts = result
    ? {
        passed: rules.filter((rule) => rule.status === 'PASS').length,
        failed: rules.filter((rule) => rule.status === 'BLOCK').length,
        incomplete: rules.filter(
          (rule) => !['PASS', 'BLOCK'].includes(rule.status)
        ).length,
      }
    : null
  const loading =
    standards.isPending ||
    (!!selection && history.isPending) ||
    (!!assessment && evaluation.isPending)
  const error =
    standards.error ??
    (selection && history.error) ??
    (assessment && evaluation.error)
  const invalid =
    standards.data?.selectionIntegrity === false ||
    (!!assessment && !loading && !error && !result)
  const reportHref = assessment
    ? `/assessments?${new URLSearchParams({
        repository: repositoryId,
        assessment: assessment.id,
      })}`
    : undefined
  const reload = async () => {
    await standards.refetch()
    await history.refetch()
    if (assessment) await evaluation.refetch()
  }
  const metrics = [
    {
      label: 'Selected checks',
      value: loading || error || invalid ? null : rules.length,
      description: selection
        ? `Saved ${selection.policyId ? 'policy' : 'standards'} v${selection.revision}`
        : 'Choose standards first',
      icon: ListChecks,
      tone: 'blue' as SurfaceTone,
    },
    {
      label: 'Passed',
      value: counts?.passed,
      description: 'Verified saved requirements',
      icon: CheckCircle2,
      tone: 'teal' as SurfaceTone,
    },
    {
      label: 'Failed',
      value: counts?.failed,
      description: 'Failed saved requirements',
      icon: CircleX,
      tone: 'violet' as SurfaceTone,
    },
    {
      label: 'Missing evidence',
      value: counts?.incomplete,
      description: 'Missing or unverified results',
      icon: FileSearch,
      tone: 'amber' as SurfaceTone,
    },
  ]
  return (
    <div className='space-y-4'>
      <div
        className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'
        aria-label='Saved check counts'
      >
        {metrics.map((metric) => (
          <Card key={metric.label} className='gap-0'>
            <CardHeader className='flex flex-row items-center justify-between gap-3 pb-3'>
              <CardTitle className='text-sm font-medium'>
                {metric.label}
              </CardTitle>
              <SurfaceIcon icon={metric.icon} tone={metric.tone} />
            </CardHeader>
            <CardContent>
              <p
                aria-label={`${metric.label}: ${metric.value ?? 'Unavailable'}`}
                className='text-2xl font-semibold tabular-nums'
              >
                {metric.value ?? '—'}
              </p>
              <p className='mt-1 text-xs text-muted-foreground'>
                {metric.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card
        className='gap-0 overflow-hidden py-0'
        aria-label='Repository check results'
      >
        <CardHeader className='flex flex-wrap items-center justify-between gap-3 border-b p-4'>
          <div className='flex min-w-0 items-center gap-3'>
            <SurfaceIcon icon={ListChecks} tone='blue' />
            <div className='min-w-0'>
              <CardTitle>Check results</CardTitle>
              <p className='mt-1 text-xs text-muted-foreground'>
                {selection
                  ? `${selection.branchRef?.replace(/^refs\/heads\//, '') ?? 'Repository standards'} · ${selection.policyId ? 'policy' : 'standards'} v${selection.revision}`
                  : 'Select standards to define the repository requirements.'}
              </p>
            </div>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Button
              size='sm'
              variant='outline'
              onClick={() => onOpenTab('standards')}
            >
              Check sources
              <ArrowUpRight />
            </Button>
            <Button
              size='icon'
              variant='outline'
              className='size-8'
              aria-label='Reload check results'
              disabled={
                loading ||
                standards.isFetching ||
                history.isFetching ||
                evaluation.isFetching
              }
              onClick={() => void reload()}
            >
              <RefreshCw />
            </Button>
          </div>
        </CardHeader>
        {assessment && !history.isError && (
          <div className='flex flex-wrap items-center justify-between gap-3 border-b bg-muted/15 px-4 py-3 text-xs'>
            <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
              <span className='inline-flex items-center gap-1.5'>
                <GitCommitHorizontal className='size-4' />
                Assessed commit{' '}
                <code title={assessment.sourceSha}>
                  {assessment.sourceSha.slice(0, 12)}
                </code>
              </span>
              <span className='text-muted-foreground'>
                Saved <RelativeTime value={assessment.createdAt} />
              </span>
            </div>
            <Button asChild variant='outline' size='sm'>
              <a href={reportHref}>
                View assessment
                <ArrowUpRight />
              </a>
            </Button>
            {profile && profile.sourceSha !== assessment.sourceSha && (
              <p className='w-full text-muted-foreground'>
                These results apply to the assessed commit, which differs from
                the inspected commit {profile.sourceSha.slice(0, 7)}.
              </p>
            )}
          </div>
        )}
        {loading ? (
          <CardContent
            role='status'
            aria-label='Loading check results'
            className='space-y-3 p-4'
          >
            <Skeleton className='h-12 w-full' />
            <Skeleton className='h-12 w-full' />
          </CardContent>
        ) : error || invalid ? (
          <CardContent className='space-y-3 p-4'>
            <p role='alert' className='text-sm'>
              {error?.message ??
                'The saved selection or assessment could not be verified. Refresh before relying on these results.'}
            </p>
            <Button variant='outline' size='sm' onClick={() => void reload()}>
              Retry
            </Button>
          </CardContent>
        ) : !selection ? (
          <CardContent className='space-y-3 p-4'>
            <p className='text-sm'>
              No standards selected. Choose the checks this repository should
              satisfy.
            </p>
            <Button
              variant='outline'
              size='sm'
              onClick={() => onOpenTab('standards')}
            >
              Choose standards
            </Button>
          </CardContent>
        ) : (
          <>
            {!assessment && (
              <div className='flex items-start gap-3 border-b bg-muted/15 p-4'>
                <AlertTriangle className='mt-0.5 size-4 shrink-0 text-warning-text' />
                <p className='text-sm'>
                  No saved assessment for this selection and revision. Run the
                  connected CI workflow or open Assessments to save an
                  evaluation.
                </p>
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className='ps-4'>Check</TableHead>
                  <TableHead>Requirement</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead className='min-w-52'>Evidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => {
                  const status = checkReview(result ? rule : undefined)
                  return (
                    <TableRow key={rule.ruleId}>
                      <TableCell className='ps-4 align-top font-medium'>
                        <span className='block'>{rule.title}</span>
                        <code className='mt-1 block text-xs font-normal text-muted-foreground'>
                          {rule.ruleId}
                        </code>
                      </TableCell>
                      <TableCell className='align-top'>
                        <StatusBadge tone='neutral'>
                          {rule.required ? 'Required' : 'Optional'}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className='align-top'>
                        <StatusBadge tone={status.tone}>
                          {status.label}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className='max-w-lg space-y-2 align-top text-xs whitespace-normal'>
                        {!result ? (
                          <p>No saved result to verify this check.</p>
                        ) : rule.status === 'PASS' ? (
                          <p>Required evidence recorded at this commit.</p>
                        ) : (
                          <div>
                            <p className='font-medium'>
                              {rule.status === 'BLOCK'
                                ? 'The approved check failed.'
                                : 'Evidence missing or unverified.'}
                            </p>
                            <ul className='mt-1 space-y-1 text-muted-foreground'>
                              {rule.reasons.map((reason) => (
                                <li key={reason}>{reviewReason(reason)}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {reportHref && (
                          <a
                            href={reportHref}
                            aria-label={`View evidence for ${rule.title}`}
                            className='inline-flex items-center gap-1 font-medium underline underline-offset-4'
                          >
                            View evidence
                            <ArrowUpRight className='size-3' />
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            <div className='flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground'>
              <p>
                Saved results apply to this commit. GitHub decides whether
                merging is allowed.
              </p>
              <Button
                size='sm'
                variant='ghost'
                onClick={() => onOpenTab('activity')}
              >
                CI activity
                <ArrowUpRight />
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
