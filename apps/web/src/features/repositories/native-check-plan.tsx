import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, ListChecks } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import { useNavigationSession } from '../workspace/navigation-session'
import { governanceRequest } from './governance-api'
import { NativeCheckRequests } from './native-check-requests'

type Step = {
  ruleId: string
  title: string
  required: boolean
  adapterSupported?: boolean
  reason: string
  image?: string
  toolVersion?: string
}
export type NativePlan = {
  sourceSha: string
  branch: string
  recordedAt: string
  selectionId: string
  planHash: string
  executionAvailable?: boolean
  steps: Step[]
}
const labels: Record<string, string> = {
  PROFILE_EVIDENCE: 'Uses repository inspection',
  ADAPTER_UNAVAILABLE: 'Native check not supported yet',
  TOOL_REVIEW_REQUIRED: 'Tool review required',
  DISPATCHER_REQUIRED: 'Planned · execution unavailable',
}
export function NativeCheckPlan({ repositoryId }: { repositoryId: string }) {
  const [open, setOpen] = useState(false)
  const session = useNavigationSession()
  const query = useQuery({
    queryKey: [
      'native-check-plan',
      session.data?.identityId,
      session.data?.organizationId,
      repositoryId,
    ],
    enabled: open && !!session.data?.identityId,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) =>
      governanceRequest<NativePlan>(
        `/github/repositories/${repositoryId}/native-execution/plan`,
        undefined,
        signal
      ),
  })
  return (
    <>
      <NativeCheckPlanView open={open} setOpen={setOpen} query={query} />
      {open && !query.isError && query.data && (
        <NativeCheckRequests
          key={`${repositoryId}:${query.data.planHash}`}
          repositoryId={repositoryId}
          plan={query.data}
        />
      )}
    </>
  )
}
export function NativeCheckPlanView({
  open,
  setOpen,
  query,
}: {
  open: boolean
  setOpen: (open: boolean) => void
  query: {
    isError: boolean
    isPending: boolean
    isFetching: boolean
    data?: NativePlan
    error: Error | null
    refetch: () => unknown
  }
}) {
  const plan = query.isError ? undefined : query.data
  return (
    <div className='mt-3 border-t pt-3'>
      <Button
        variant='ghost'
        size='sm'
        className='-ml-2'
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown className='size-4' aria-hidden />
        ) : (
          <ChevronRight className='size-4' aria-hidden />
        )}
        <ListChecks className='size-4' aria-hidden />
        View check plan
      </Button>
      {open && (
        <div className='mt-3 space-y-3'>
          {query.isPending && (
            <p role='status' className='text-xs text-muted-foreground'>
              Loading the check plan…
            </p>
          )}
          {query.isError && (
            <div
              role='alert'
              className='flex flex-wrap items-center gap-3 text-sm text-destructive'
            >
              {query.error?.message ?? 'The check plan could not be loaded.'}
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
          {plan && (
            <>
              <p className='text-xs text-muted-foreground'>
                Recorded commit <code>{plan.sourceSha.slice(0, 7)}</code> on{' '}
                {plan.branch}.
              </p>
              <ul className='divide-y rounded-lg border'>
                {plan.steps.map((step) => (
                  <li
                    key={step.ruleId}
                    className='flex flex-wrap items-center justify-between gap-2 px-3 py-2.5'
                  >
                    <div className='min-w-0'>
                      <p className='text-sm font-medium'>{step.title}</p>
                      {step.image && (
                        <p className='mt-1 text-xs text-muted-foreground'>
                          Reviewed tool {step.toolVersion}
                        </p>
                      )}
                    </div>
                    <div className='flex flex-wrap items-center gap-2'>
                      <StatusBadge tone={step.required ? 'info' : 'neutral'}>
                        {step.required ? 'Required' : 'Optional'}
                      </StatusBadge>
                      <span className='text-xs text-muted-foreground'>
                        {plan.executionAvailable &&
                        step.reason === 'DISPATCHER_REQUIRED'
                          ? 'Ready to run'
                          : (labels[step.reason] ?? 'Unavailable')}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              {!plan.steps.length && (
                <p className='text-xs text-muted-foreground'>
                  No checks in the saved standards selection.
                </p>
              )}
              <p className='text-xs break-all text-muted-foreground'>
                Plan ID: <code>{plan.planHash}</code>
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
