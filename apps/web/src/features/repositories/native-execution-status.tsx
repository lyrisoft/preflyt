import { useQuery } from '@tanstack/react-query'
import { RefreshCw, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHelpDrawer } from '@/components/page-help-drawer'
import { StatusBadge } from '@/components/status-badge'
import { useNavigationSession } from '../workspace/navigation-session'
import { governanceRequest } from './governance-api'
import { NativeCheckPlan } from './native-check-plan'

type NativeStatus = {
  mode: string
  executionAvailable: boolean
  preflightVerified: boolean
  checkedAt: string
  message: string
  reason: string
  failed?: string[]
}
export function NativeExecutionStatus({
  repositoryId,
}: {
  repositoryId: string
}) {
  const session = useNavigationSession()
  const query = useQuery({
    queryKey: [
      'native-execution-status',
      session.data?.identityId,
      session.data?.organizationId,
      repositoryId,
    ],
    queryFn: ({ signal }) =>
      governanceRequest<NativeStatus>(
        `/github/repositories/${repositoryId}/native-execution/status`,
        undefined,
        signal
      ),
    enabled: !!session.data?.identityId,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 0,
  })
  const data = query.isError ? undefined : query.data
  return (
    <section
      aria-label='Execution environment'
      className='rounded-xl border bg-muted/10 p-4'
    >
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='min-w-0 space-y-2'>
          <h3 className='flex items-center gap-2 text-sm font-semibold'>
            <ShieldCheck className='size-4 text-info' aria-hidden='true' />
            Execution environment
          </h3>
          {query.isPending && (
            <p role='status' className='text-xs text-muted-foreground'>
              Checking the execution environment…
            </p>
          )}
          {query.isError && (
            <p role='alert' className='text-sm text-destructive'>
              {query.error.message}
            </p>
          )}
          {data && (
            <>
              <div className='flex flex-wrap gap-2'>
                <StatusBadge
                  tone={data.executionAvailable ? 'success' : 'info'}
                >
                  {data.executionAvailable
                    ? 'Run checks available'
                    : 'Imported CI only'}
                </StatusBadge>
                {data.preflightVerified && (
                  <StatusBadge tone='info'>
                    Sandbox preflight verified
                  </StatusBadge>
                )}
              </div>
              <p className='max-w-2xl text-xs text-muted-foreground'>
                {data.message}
              </p>
              {!!data.failed?.length && (
                <p className='text-xs text-warning'>
                  Review needed: {data.failed.join(', ')}
                </p>
              )}
            </>
          )}
        </div>
        <div className='flex shrink-0 items-center gap-2'>
          <Button
            type='button'
            size='sm'
            variant='outline'
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw
              className={
                query.isFetching
                  ? 'size-4 animate-spin motion-reduce:animate-none'
                  : 'size-4'
              }
              aria-hidden='true'
            />
            Check sandbox
          </Button>
          <PageHelpDrawer
            title='Execution environment'
            sections={[
              {
                title: 'Imported CI',
                content:
                  'Your existing checks and reports remain available. This status does not change a saved assessment or GitHub quality gate.',
              },
              {
                title: 'Sandbox verification',
                content:
                  'Preflyt requires an independent security review and checks current isolation, networking, quotas and sandbox credentials against that review. A missing, expired or changed review blocks repository execution. A successful preflight is a configuration observation, not a passing code check.',
              },
              {
                title: 'Current support',
                content:
                  'The check plan lists saved rules against the recorded commit. Tool versions, image digests and configuration must be reviewed before execution. Requests are recorded with the exact commit and saved standards. Source export verifies Git objects without running repository code. Requests remain blocked until a reviewed execution service is available; a recorded request is not a completed check. A reviewed dedicated Docker controller can run supported checks and return signed results. Unsupported or partial coverage remains incomplete. A reviewed Kubernetes controller can create scoped jobs with verified runtime isolation and signed results. Live runtime acceptance remains required before enabling execution. Preflyt does not run repository commands on the API or integration worker.',
              },
            ]}
          />
        </div>
      </div>
      {data && <NativeCheckPlan repositoryId={repositoryId} />}
      {data && (
        <p className='mt-3 text-xs text-muted-foreground'>
          Checked {new Date(data.checkedAt).toLocaleString()}
        </p>
      )}
    </section>
  )
}
