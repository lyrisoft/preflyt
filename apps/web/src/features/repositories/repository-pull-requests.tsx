import { useState } from 'react'
import {
  ArrowRight,
  Clock3,
  GitBranch,
  GitPullRequest,
  Layers,
  RefreshCw,
  ShieldQuestion,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardAction,
} from '@/components/ui/card'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { StatusBadge } from '@/components/status-badge'
import { AssessmentSnapshotDialog } from './assessment-context'
import { usePullRequests, usePullRequest } from './engineering-queries'
import { RelativeTime } from './relative-time'
import { Legend, StackedBar, type Segment } from './status-charts'

const reasons: Record<string, string> = {
  CURRENT_STATE_UNVERIFIED:
    'Waiting for a recent GitHub confirmation. Saved context may be out of date.',
  CONTEXT_CHANGED:
    'PR or policy context changed during this read. Reload to review it.',
  PR_CLOSED:
    'This pull request is closed. Current assessment links are hidden.',
  FORK_HEAD_UNSUPPORTED: 'Fork-head assessments are not supported yet.',
  STANDARDS_NOT_ADOPTED: 'Adopt repository standards to create assessments.',
  NO_APPLICABLE_ASSESSMENT:
    'No assessment matches the current revision and policy. A PR or CI event will create another assessment.',
  EXECUTION_NOT_VERIFIED:
    'Matching assessments are available. Their evidence does not establish verified execution or a passing merge review result.',
}

export function RepositoryPullRequests({
  repositoryId,
}: {
  repositoryId: string
}) {
  const list = usePullRequests(repositoryId)
  const [selected, setSelected] = useState<number | null>(null)
  const [snapshot, setSnapshot] = useState<string | null>(null)
  const number = selected ?? list.data?.pullRequests[0]?.number ?? null
  const detail = usePullRequest(repositoryId, number)
  const data = detail.data
  const context = data?.pullRequest.context
  const prs = list.data?.pullRequests ?? []
  const segments: Segment[] = [
    {
      key: 'open',
      label: 'Open',
      value: prs.filter(
        ({ context }) =>
          context.state === 'open' && !context.draft && !context.merged
      ).length,
      tone: 'info',
    },
    {
      key: 'draft',
      label: 'Draft',
      value: prs.filter(
        ({ context }) =>
          context.state === 'open' && context.draft && !context.merged
      ).length,
      tone: 'neutral',
    },
    {
      key: 'merged',
      label: 'Merged',
      value: prs.filter(({ context }) => context.merged).length,
      tone: 'success',
    },
    {
      key: 'closed',
      label: 'Closed',
      value: prs.filter(
        ({ context }) => context.state !== 'open' && !context.merged
      ).length,
      tone: 'warning',
    },
  ]
  return (
    <Card className='gap-4'>
      <CardHeader>
        <CardTitle asChild>
          <h2>Pull requests</h2>
        </CardTitle>
        <CardDescription>
          Current revisions and their matching assessments.
        </CardDescription>
        <CardAction>
          <Button
            size='icon'
            variant='outline'
            className='size-8'
            aria-label='Reload pull requests'
            disabled={list.isFetching || detail.isFetching}
            onClick={() => {
              void list.refetch()
              if (number !== null) void detail.refetch()
            }}
          >
            <RefreshCw className={list.isFetching ? 'animate-spin' : ''} />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className='space-y-4'>
        {list.isPending ? (
          <p role='status' className='text-sm text-muted-foreground'>
            Loading pull requests…
          </p>
        ) : list.isError ? (
          <p role='alert' className='text-sm text-destructive'>
            {list.error.message}
          </p>
        ) : !prs.length ? (
          <div className='rounded-lg border bg-muted/15 p-5'>
            <div className='flex items-start gap-3'>
              <span className='rounded-lg border bg-background p-2.5 text-info'>
                <GitPullRequest className='size-5' aria-hidden='true' />
              </span>
              <div>
                <p className='text-sm font-semibold'>
                  No tracked pull requests
                </p>
                <p className='mt-1 text-xs text-muted-foreground'>
                  Open or update a PR with signed webhooks and the worker
                  enabled. Existing PRs are not automatically backfilled.
                </p>
              </div>
            </div>
            <div className='mt-4 flex flex-wrap items-center gap-2 border-t pt-4 text-xs text-muted-foreground'>
              <span className='inline-flex items-center gap-1.5'>
                <GitBranch className='size-3.5' aria-hidden='true' />
                Track revision
              </span>
              <ArrowRight className='size-3.5' aria-hidden='true' />
              <span className='inline-flex items-center gap-1.5'>
                <Layers className='size-3.5' aria-hidden='true' />
                Find matching assessments
              </span>
              <ArrowRight className='size-3.5' aria-hidden='true' />
              <span className='inline-flex items-center gap-1.5'>
                <ShieldQuestion className='size-3.5' aria-hidden='true' />
                Review evidence
              </span>
            </div>
          </div>
        ) : (
          <>
            <div className='rounded-lg border bg-muted/10 px-4 py-3'>
              <div className='mb-2 flex items-center justify-between gap-3'>
                <p className='text-xs font-medium text-muted-foreground'>
                  Tracked PR state
                </p>
                <span className='text-xs font-semibold tabular-nums'>
                  {prs.length} pull requests
                </span>
              </div>
              <StackedBar
                segments={segments}
                label='Tracked pull request states'
              />
              <div className='mt-1'>
                <Legend segments={segments} />
              </div>
            </div>
            <Select
              value={number === null ? '' : String(number)}
              onValueChange={(value) => setSelected(Number(value))}
            >
              <SelectTrigger
                aria-label='Tracked pull request'
                className='w-full sm:w-96'
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {prs.map((pr) => (
                  <SelectItem key={pr.id} value={String(pr.number)}>
                    #{pr.number} · {pr.context.head.ref} · {pr.context.state}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {list.data.truncated && (
              <p role='status' className='text-xs text-muted-foreground'>
                Showing the latest 50 tracked PR numbers.
              </p>
            )}
            {detail.isPending ? (
              <p role='status' className='text-sm text-muted-foreground'>
                Loading PR context…
              </p>
            ) : detail.isError ? (
              <p role='alert' className='text-sm text-destructive'>
                {detail.error.message}
              </p>
            ) : data && context ? (
              <>
                <div className='flex flex-wrap items-center justify-between gap-3'>
                  <div className='flex flex-wrap gap-2'>
                    <StatusBadge
                      tone={
                        data.verification === 'RECENTLY_VERIFIED'
                          ? 'info'
                          : 'warning'
                      }
                    >
                      {data.verification === 'RECENTLY_VERIFIED'
                        ? 'Recently verified'
                        : 'Current state unverified'}
                    </StatusBadge>
                    <StatusBadge tone='neutral'>
                      {context.draft ? 'Draft · ' : ''}
                      {context.merged
                        ? 'Merged'
                        : context.state === 'closed'
                          ? 'Closed'
                          : 'Open'}
                    </StatusBadge>
                  </div>
                  <span className='inline-flex items-center gap-1.5 text-xs text-muted-foreground'>
                    <Clock3 className='size-3.5' aria-hidden='true' />
                    Confirmed{' '}
                    {data.pullRequest.verifiedAt ? (
                      <RelativeTime value={data.pullRequest.verifiedAt} />
                    ) : (
                      'never'
                    )}
                  </span>
                </div>
                <div className='grid items-center gap-3 rounded-lg border bg-muted/10 p-4 sm:grid-cols-[1fr_auto_1fr]'>
                  <div className='min-w-0'>
                    <p className='mb-2 text-[10px] font-medium tracking-wider text-muted-foreground uppercase'>
                      Head branch
                    </p>
                    <p className='flex items-center gap-2 text-sm font-semibold'>
                      <GitBranch
                        className='size-4 shrink-0 text-info'
                        aria-hidden='true'
                      />
                      <span className='truncate' title={context.head.ref}>
                        {context.head.ref}
                      </span>
                    </p>
                    <code
                      className='mt-1.5 block text-xs text-muted-foreground'
                      title={context.head.sha}
                    >
                      {context.head.sha.slice(0, 12)}
                    </code>
                  </div>
                  <ArrowRight
                    className='hidden size-4 text-muted-foreground sm:block'
                    aria-hidden='true'
                  />
                  <div className='min-w-0'>
                    <p className='mb-2 text-[10px] font-medium tracking-wider text-muted-foreground uppercase'>
                      Base branch
                    </p>
                    <p className='flex items-center gap-2 text-sm font-semibold'>
                      <GitBranch
                        className='size-4 shrink-0 text-muted-foreground'
                        aria-hidden='true'
                      />
                      <span className='truncate' title={context.base.ref}>
                        {context.base.ref}
                      </span>
                    </p>
                    <code
                      className='mt-1.5 block text-xs text-muted-foreground'
                      title={context.base.sha}
                    >
                      {context.base.sha.slice(0, 12)}
                    </code>
                  </div>
                </div>
                <div className='grid gap-3 sm:grid-cols-3'>
                  {[
                    { label: 'PR context', link: data.prAssessment },
                    { label: 'Exact-head CI', link: data.ciAssessment },
                  ].map(({ label, link }) => (
                    <div key={label} className='rounded-lg border p-3'>
                      <p className='flex items-center gap-2 text-xs font-medium'>
                        <Layers
                          className='size-3.5 text-muted-foreground'
                          aria-hidden='true'
                        />
                        {label}
                      </p>
                      {link ? (
                        <Button
                          variant='ghost'
                          className='mt-2 h-7 px-0 text-xs text-info hover:bg-transparent'
                          onClick={() => setSnapshot(link.id)}
                        >
                          View assessment <ArrowRight className='size-3' />
                        </Button>
                      ) : (
                        <p className='mt-3 text-xs text-muted-foreground'>
                          No matching assessment
                        </p>
                      )}
                    </div>
                  ))}
                  <div className='rounded-lg border p-3'>
                    <p className='flex items-center gap-2 text-xs font-medium'>
                      <ShieldQuestion
                        className='size-3.5 text-muted-foreground'
                        aria-hidden='true'
                      />
                      Merge review result
                    </p>
                    <p className='mt-3 text-xs text-muted-foreground'>
                      Not evaluated
                    </p>
                  </div>
                </div>
                <p
                  role='status'
                  className='rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground'
                >
                  {reasons[data.reason] ??
                    'Preflyt has not evaluated whether this change is ready to merge.'}
                </p>
                {data.collectionTruncated && (
                  <p role='alert' className='text-xs text-warning'>
                    Assessment lookup reached its 100-candidate limit.
                  </p>
                )}
                <details className='rounded-md border text-xs'>
                  <summary className='cursor-pointer px-3 py-2.5 font-medium'>
                    Revision and synchronization details
                  </summary>
                  <dl className='grid gap-x-4 gap-y-2 border-t px-3 py-3 sm:grid-cols-[max-content_1fr]'>
                    <dt className='text-muted-foreground'>Head SHA</dt>
                    <dd className='font-mono break-all'>{context.head.sha}</dd>
                    <dt className='text-muted-foreground'>Base SHA</dt>
                    <dd className='font-mono break-all'>{context.base.sha}</dd>
                    <dt className='text-muted-foreground'>Synchronization</dt>
                    <dd>
                      {data.pullRequest.syncState.toLowerCase()} · revision{' '}
                      {data.pullRequest.revision}
                    </dd>
                    <dt className='text-muted-foreground'>
                      GitHub confirmation
                    </dt>
                    <dd>
                      {data.pullRequest.verifiedAt ? (
                        <RelativeTime value={data.pullRequest.verifiedAt} />
                      ) : (
                        'Not verified yet'
                      )}
                    </dd>
                  </dl>
                  <p className='border-t px-3 py-3 text-muted-foreground'>
                    Reads use saved data. The worker confirms tracked PRs with
                    GitHub; confirmation expires after five minutes. Readiness
                    is not evaluated.
                  </p>
                </details>
              </>
            ) : null}
          </>
        )}
      </CardContent>
      <AssessmentSnapshotDialog
        repositoryId={repositoryId}
        id={snapshot}
        onClose={() => setSnapshot(null)}
      />
    </Card>
  )
}
