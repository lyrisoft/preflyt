import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
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
    'No snapshot matches the current revision and policy. A PR or CI event will create another snapshot.',
  EXECUTION_NOT_VERIFIED:
    'Matching snapshots are available. Their evidence does not establish verified execution or a quality gate.',
}
export function RepositoryPullRequests({
  repositoryId,
}: {
  repositoryId: string
}) {
  const list = usePullRequests(repositoryId)
  const [selected, setSelected] = useState<number | null>(null),
    [snapshot, setSnapshot] = useState<string | null>(null)
  const number = selected ?? list.data?.pullRequests[0]?.number ?? null
  const detail = usePullRequest(repositoryId, number)
  const data = detail.data,
    context = data?.pullRequest.context
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pull requests</CardTitle>
        <CardDescription>
          Tracked PR revisions and their matching assessment snapshots.
        </CardDescription>
        <CardAction>
          <Button
            size='icon'
            variant='outline'
            aria-label='Reload pull requests'
            disabled={list.isFetching || detail.isFetching}
            onClick={() => {
              void list.refetch()
              if (number !== null) void detail.refetch()
            }}
          >
            <RefreshCw />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className='space-y-4'>
        {list.isPending ? (
          <p role='status'>Loading pull requests…</p>
        ) : list.isError ? (
          <p role='alert' className='text-destructive'>
            {list.error.message}
          </p>
        ) : !list.data.pullRequests.length ? (
          <div className='rounded-md border border-dashed p-6 text-sm'>
            <p className='font-medium'>No tracked pull requests yet</p>
            <p className='mt-1 text-muted-foreground'>
              Open or update a PR in a selected repository with signed webhooks
              and the worker enabled. Existing PRs are not automatically
              backfilled.
            </p>
          </div>
        ) : (
          <>
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
                {list.data.pullRequests.map((pr) => (
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
              <p role='status'>Loading PR context…</p>
            ) : detail.isError ? (
              <p role='alert' className='text-destructive'>
                {detail.error.message}
              </p>
            ) : data && context ? (
              <>
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
                <dl className='grid gap-4 rounded-md border p-4 text-sm sm:grid-cols-2'>
                  <div>
                    <dt className='text-muted-foreground'>Head branch</dt>
                    <dd className='break-all'>
                      {context.head.ref}
                      <code className='block text-xs'>{context.head.sha}</code>
                    </dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground'>Base branch</dt>
                    <dd className='break-all'>
                      {context.base.ref}
                      <code className='block text-xs'>{context.base.sha}</code>
                    </dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground'>
                      Last GitHub confirmation
                    </dt>
                    <dd>
                      {data.pullRequest.verifiedAt ? (
                        <RelativeTime value={data.pullRequest.verifiedAt} />
                      ) : (
                        'Not verified yet'
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground'>Synchronization</dt>
                    <dd>
                      {data.pullRequest.syncState.toLowerCase()} · revision{' '}
                      {data.pullRequest.revision}
                    </dd>
                  </div>
                </dl>
                <p role='status' className='text-sm text-muted-foreground'>
                  {reasons[data.reason] ??
                    'Current readiness has not been evaluated.'}
                </p>
                <div className='grid gap-3 sm:grid-cols-2'>
                  {[
                    { label: 'PR context snapshot', link: data.prAssessment },
                    {
                      label: 'Exact-head CI snapshot',
                      link: data.ciAssessment,
                    },
                  ].map(({ label, link }) => (
                    <div
                      key={label}
                      className='space-y-2 rounded-md border p-3'
                    >
                      <p className='text-sm font-medium'>{label}</p>
                      {link ? (
                        <Button
                          variant='outline'
                          size='sm'
                          onClick={() => setSnapshot(link.id)}
                        >
                          View assessment
                        </Button>
                      ) : (
                        <p className='text-xs text-muted-foreground'>
                          No applicable link
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                {data.collectionTruncated && (
                  <p role='alert' className='text-sm text-muted-foreground'>
                    Assessment lookup reached its 100-candidate limit.
                  </p>
                )}
                <p className='text-xs text-muted-foreground'>
                  Reads use saved data. The worker confirms tracked PRs with
                  GitHub; confirmation expires after five minutes. Readiness is
                  not evaluated.
                </p>
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
