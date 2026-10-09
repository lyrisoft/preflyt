import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import { useNavigationSession } from '../workspace/navigation-session'
import { canPerform } from '../workspace/scoped-access'
import { governanceRequest } from './governance-api'
import type { NativePlan } from './native-check-plan'

type RequestRow = {
  id: string
  sourceSha: string
  state: string
  reason: string
  requestedAt: string
}
type History = {
  items: RequestRow[]
  page: number
  pages: number
  total: number
}
const reasons: Record<string, string> = {
  DISPATCHER_REQUIRED: 'Execution service is not available yet.',
  TOOL_REVIEW_REQUIRED: 'The selected tools need a security review.',
  APPROVAL_REQUIRED: 'The sandbox needs an independent security review.',
}
export function NativeCheckRequests({
  repositoryId,
  plan,
}: {
  repositoryId: string
  plan: NativePlan
}) {
  const session = useNavigationSession()
  const allowed = canPerform(session.data, 'execution.run', repositoryId)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<string[]>(() =>
    plan.steps
      .filter((step) => step.adapterSupported && step.required)
      .map((step) => step.ruleId)
  )
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const attempt = useRef<{ signature: string; key: string } | null>(null)
  const base = `/github/repositories/${repositoryId}/native-execution/requests`
  const query = useQuery({
    queryKey: [
      'native-requests',
      base,
      session.data?.identityId,
      session.data?.organizationId,
      repositoryId,
      page,
    ],
    queryFn: ({ signal }) =>
      governanceRequest<History>(`${base}?page=${page}`, undefined, signal),
    enabled: !!session.data?.identityId,
    retry: false,
    staleTime: 0,
  })
  async function act(id?: string) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const signature = JSON.stringify([...selected].sort())
      if (!id && attempt.current?.signature !== signature)
        attempt.current = { signature, key: crypto.randomUUID() }
      const row = await governanceRequest<RequestRow>(
        id ? `${base}/${id}/cancel` : base,
        id
          ? {}
          : {
              requestKey: attempt.current!.key,
              expectedSourceSha: plan.sourceSha,
              expectedSelectionId: plan.selectionId,
              expectedPlanHash: plan.planHash,
              ruleIds: selected,
            }
      )
      setMessage(
        row.state === 'BLOCKED'
          ? `Request blocked. ${reasons[row.reason] ?? 'Review the execution environment before retrying.'}`
          : row.state === 'CANCEL_REQUESTED'
            ? 'Cancellation requested. Waiting for cleanup confirmation.'
            : `Request ${row.state.toLowerCase().replace(/_/g, ' ')}.`
      )
      if (!id) attempt.current = null
      await query.refetch()
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'The request could not be completed.'
      )
    } finally {
      setBusy(false)
    }
  }
  const history = query.isError ? undefined : query.data
  return (
    <div className='mt-4 space-y-3 border-t pt-4'>
      <h4 className='text-sm font-semibold'>Check requests</h4>
      {allowed && (
        <fieldset disabled={busy} className='space-y-3'>
          <legend className='text-xs text-muted-foreground'>
            Select checks for the recorded commit
          </legend>
          <div className='flex flex-wrap gap-3'>
            {plan.steps
              .filter((step) => step.adapterSupported)
              .map((step) => (
                <label
                  key={step.ruleId}
                  className='flex items-center gap-2 text-sm'
                >
                  <input
                    type='checkbox'
                    checked={selected.includes(step.ruleId)}
                    onChange={(e) =>
                      setSelected((old) =>
                        e.target.checked
                          ? [...old, step.ruleId]
                          : old.filter((id) => id !== step.ruleId)
                      )
                    }
                  />
                  {step.title}
                </label>
              ))}
          </div>
          <Button
            size='sm'
            disabled={!selected.length || busy || query.isError}
            onClick={() => void act()}
          >
            Request checks
          </Button>
        </fieldset>
      )}
      {message && (
        <p role='status' className='text-sm'>
          {message}
        </p>
      )}
      {error && (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      )}
      {query.isPending && (
        <p role='status' className='text-xs text-muted-foreground'>
          Loading requests…
        </p>
      )}
      {query.isError && (
        <div
          role='alert'
          className='flex items-center gap-3 text-sm text-destructive'
        >
          {query.error.message}
          <Button
            size='sm'
            variant='outline'
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Retry
          </Button>
        </div>
      )}
      {history && (
        <NativeRequestHistory
          history={history}
          allowed={allowed}
          busy={busy}
          onCancel={(id) => void act(id)}
          onPage={setPage}
        />
      )}
    </div>
  )
}
export function NativeRequestHistory({
  history,
  allowed,
  busy,
  onCancel,
  onPage,
}: {
  history: History
  allowed: boolean
  busy: boolean
  onCancel: (id: string) => void
  onPage: (page: number) => void
}) {
  return (
    <>
      {!history.items.length && (
        <p className='text-xs text-muted-foreground'>
          No check requests recorded.
        </p>
      )}
      <ul className='divide-y'>
        {history.items.map((row) => (
          <li
            key={row.id}
            className='flex flex-wrap items-center justify-between gap-3 py-3'
          >
            <div className='space-y-1 text-xs'>
              <div className='flex items-center gap-2'>
                <code>{row.sourceSha.slice(0, 7)}</code>
                <StatusBadge
                  tone={row.state === 'BLOCKED' ? 'warning' : 'neutral'}
                >
                  {row.state.toLowerCase().replace(/_/g, ' ')}
                </StatusBadge>
              </div>
              <p className='text-muted-foreground'>
                {reasons[row.reason] ??
                  row.reason.toLowerCase().replace(/_/g, ' ')}
              </p>
              <time dateTime={row.requestedAt}>
                {new Date(row.requestedAt).toLocaleString()}
              </time>
            </div>
            {allowed &&
              ['QUEUED', 'PREPARING', 'RUNNING'].includes(row.state) && (
                <Button
                  size='sm'
                  variant='outline'
                  disabled={busy}
                  onClick={() => onCancel(row.id)}
                >
                  Cancel request
                </Button>
              )}
          </li>
        ))}
      </ul>
      {!!history.total && (
        <nav
          aria-label='Check request pages'
          className='flex items-center justify-end gap-3 text-xs'
        >
          <span>
            Page {history.page} of {Math.max(1, history.pages)} ·{' '}
            {history.total} requests
          </span>
          <Button
            size='sm'
            variant='outline'
            disabled={busy || history.page <= 1}
            onClick={() => onPage(history.page - 1)}
          >
            Previous
          </Button>
          <Button
            size='sm'
            variant='outline'
            disabled={busy || history.page >= history.pages}
            onClick={() => onPage(history.page + 1)}
          >
            Next
          </Button>
        </nav>
      )}
    </>
  )
}
