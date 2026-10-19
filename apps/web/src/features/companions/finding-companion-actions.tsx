import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { AgentLogo } from '@/assets/brand-icons/agent-logo'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { StatusBadge } from '@/components/status-badge'
import { useNavigationSession } from '@/features/workspace/navigation-session'
import {
  companionCall,
  companionStatus,
  useCompanions,
  type CompanionJob,
} from './companion-api'
import type { ManualScope } from './companion-integrations'

export function FindingCompanionActions({
  scope,
  canRun,
  onChanged,
}: {
  scope: ManualScope
  canRun: boolean
  onChanged: () => void
}) {
  const connections = useCompanions(),
    session = useNavigationSession(),
    [choice, setChoice] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null)
  const options =
    connections.data
      ?.filter(
        (c) =>
          companionStatus(c) === 'Online' &&
          c.repositories.includes(scope.repositoryId)
      )
      .flatMap((c) =>
        c.agents.map((agent) => ({
          key: `${c.id}:${agent}`,
          id: c.id,
          name: c.name,
          agent,
        }))
      ) ?? []
  const selected = options.find((x) => x.key === choice) ?? options[0]
  const jobs = useQuery({
    queryKey: [
      'companion-jobs',
      session.data?.identityId,
      session.data?.organizationId,
      scope,
    ],
    queryFn: () =>
      companionCall<CompanionJob[]>(`/jobs?${new URLSearchParams(scope)}`),
    retry: false,
    refetchInterval: 3000,
    gcTime: 0,
  })
  const latest = jobs.data?.[0],
    active = jobs.data?.find((j) => ['QUEUED', 'RUNNING'].includes(j.state))
  async function run(mode: 'verify' | 'fix') {
    if (!selected) return
    setBusy(true)
    setError(null)
    try {
      await companionCall('/jobs', {
        scope,
        connectionId: selected.id,
        agent: selected.agent,
        mode,
        requestKey: crypto.randomUUID(),
      })
      await jobs.refetch()
      toast.success(
        mode === 'fix'
          ? 'Verification and fix task queued.'
          : 'Verification task queued.'
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The task could not start.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className='space-y-3 border-t pt-4'>
      <div className='flex flex-wrap items-center gap-2'>
        {selected ? (
          <>
            <Select value={selected.key} onValueChange={setChoice}>
              <SelectTrigger
                aria-label='Agent and computer'
                className='w-full sm:w-auto sm:min-w-60'
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.key} value={o.key}>
                    <span className='flex items-center gap-2'>
                      <AgentLogo agent={o.agent} className='size-4' />
                      {o.agent === 'codex' ? 'Codex' : 'Claude Code'}{' '}
                      <span className='text-muted-foreground'>· {o.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size='sm'
              disabled={
                !canRun || busy || !!active || jobs.isPending || jobs.isError
              }
              onClick={() => void run('verify')}
            >
              Verify
            </Button>
            <Button
              variant='outline'
              size='sm'
              disabled={
                !canRun || busy || !!active || jobs.isPending || jobs.isError
              }
              onClick={() => void run('fix')}
            >
              Verify and fix
            </Button>
          </>
        ) : null}
        <a
          className='text-xs underline underline-offset-4'
          href={`/integrations?integration=mcp&repository=${scope.repositoryId}&assessment=${scope.assessmentId}&finding=${scope.findingId}&origin=${scope.origin}`}
        >
          Manage agent connections
        </a>
      </div>
      {connections.isPending && (
        <p role='status' className='text-xs text-muted-foreground'>
          Checking connected computers…
        </p>
      )}
      {connections.error && (
        <p role='alert' className='text-sm text-destructive'>
          {connections.error.message}
        </p>
      )}
      {!canRun && (
        <p className='text-xs text-muted-foreground'>
          You need permission to run AI reviews in this repository.
        </p>
      )}
      {jobs.error && (
        <p role='alert' className='text-sm text-destructive'>
          Task status could not be loaded. Refresh to check before starting
          another task.
        </p>
      )}
      {latest && (
        <div className='flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm'>
          {active && (
            <LoaderCircle className='size-4 animate-spin' aria-hidden='true' />
          )}
          <StatusBadge tone='neutral'>
            {(
              {
                QUEUED: 'Queued',
                RUNNING: 'Running',
                COMPLETED: 'Completed',
                FAILED: 'Failed',
                CANCELLED: 'Cancelled',
              } as Record<string, string>
            )[latest.state] ?? 'Unknown'}
          </StatusBadge>
          <span>
            {latest.agent === 'codex' ? 'Codex' : 'Claude Code'} ·{' '}
            {latest.mode === 'fix' ? 'Verify and fix' : 'Verification'}
          </span>
          {latest.failure && (
            <p className='basis-full text-sm text-destructive'>
              {latest.failure}
            </p>
          )}
          {active && (
            <Button
              size='sm'
              variant='outline'
              disabled={busy}
              onClick={() => {
                setBusy(true)
                void companionCall('/cancel', { id: active.id })
                  .then(async () => {
                    await jobs.refetch()
                    onChanged()
                    toast.success('Agent task cancelled.')
                  })
                  .catch((e) => setError(e.message))
                  .finally(() => setBusy(false))
              }}
            >
              Cancel task
            </Button>
          )}
          {latest.state === 'COMPLETED' && (
            <Button size='sm' variant='ghost' onClick={onChanged}>
              Refresh review evidence
            </Button>
          )}
        </div>
      )}
      {error && (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      )}
    </div>
  )
}
