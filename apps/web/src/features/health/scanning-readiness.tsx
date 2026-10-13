import { Link } from '@tanstack/react-router'
import { ArrowUpRight, RefreshCw, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import type { NativeStatus } from '@/features/repositories/native-execution-api'

const remedies: Record<string, { cause: string; action: string }> = {
  PREFLIGHT_DISABLED: {
    cause: 'Scanning environment verification is disabled in this deployment.',
    action:
      'Configure the reviewed scanning environment, then enable Native runtime preflight.',
  },
  REVIEW_REQUIRED: {
    cause:
      'No valid signed scanning environment approval covers this workspace. It may be missing, expired or no longer match the deployment.',
    action:
      'Install or renew the signed runtime approval and trusted reviewer keys, covering this workspace and the deployed runtime.',
  },
  CONTROLLER_UNAVAILABLE: {
    cause: 'Preflyt cannot connect to or verify its scanning controller.',
    action:
      'Check the controller service, HTTPS connection, shared API credential and signed approval.',
  },
  DISPATCHER_REQUIRED: {
    cause:
      'The scanning environment was verified, but running scanners is disabled.',
    action:
      'After completing runtime and tool review, enable Native execution in Preflyt and on the controller.',
  },
  RUNTIME_CONTROLS_CHANGED: {
    cause:
      'The scanning environment no longer matches its approved security controls.',
    action:
      'Restore the approved controls or obtain a new review for the changed runtime. Do not disable verification.',
  },
}

export function ScanningReadiness({
  status,
  pending,
  error,
  platformAdmin,
  refresh,
}: {
  status?: NativeStatus
  pending: boolean
  error: boolean
  platformAdmin: boolean
  refresh: () => void
}) {
  if (pending && !status)
    return (
      <p role='status' className='text-sm text-muted-foreground'>
        Checking whether repository scanning is available…
      </p>
    )
  if (!error && status?.executionAvailable) return null
  const remedy = status ? remedies[status.reason] : undefined
  return (
    <section
      aria-label='Scanning readiness'
      role='status'
      className='rounded-xl border border-warning/20 bg-warning/10 p-4'
    >
      <div className='flex items-start gap-3'>
        <SurfaceIcon icon={ShieldAlert} tone='amber' />
        <div className='min-w-0 flex-1 space-y-3'>
          <div className='flex flex-wrap items-center gap-2'>
            <h2 className='text-base font-semibold'>
              {error
                ? 'Scanning readiness is unavailable'
                : 'Repository scanning is blocked'}
            </h2>
            <StatusBadge tone='warning'>
              {error ? 'Readiness unverified' : 'Scanning blocked'}
            </StatusBadge>
          </div>
          <div className='grid gap-4 lg:grid-cols-2'>
            <div className='space-y-3'>
              <p className='max-w-prose text-sm'>
                {error
                  ? 'Preflyt could not check the scanning environment. Retry before starting an assessment; no new request has been sent.'
                  : (remedy?.cause ??
                    'The scanning environment is unavailable. Your Preflyt administrator needs to review the deployment setup.')}
              </p>
              {!error && (
                <p className='max-w-prose text-sm text-muted-foreground'>
                  Assessment is unavailable until scanning is ready. Existing
                  inspection-only reports contain a file inventory, with no
                  scanner findings or metrics. This is a Preflyt deployment
                  issue, not a request for additional repository approval.
                </p>
              )}
            </div>
            <div className='max-w-prose space-y-1 text-sm'>
              <p className='font-medium'>
                {platformAdmin
                  ? 'How to fix it'
                  : 'Ask your Preflyt administrator to fix it'}
              </p>
              <p>
                {error
                  ? 'Check API connectivity and repository access. If retrying still fails, ask the deployment operator to check the API and controller logs.'
                  : (remedy?.action ??
                    'Follow the scanning setup guide to configure and verify the runtime and reviewed scanner images.')}
              </p>
              {!error && (
                <p className='text-muted-foreground'>
                  Use Settings → Configuration → Native execution for deployment
                  settings. Signed approvals and reviewer keys are installed by
                  the deployment operator outside the app. After applying
                  changes, return here and select Check again.
                </p>
              )}
            </div>
          </div>
          <div className='flex flex-wrap gap-2'>
            {platformAdmin && (
              <Button variant='outline' size='sm' asChild>
                <Link
                  to='/organization-settings'
                  search={{ tab: 'configuration' }}
                >
                  Open configuration <ArrowUpRight />
                </Link>
              </Button>
            )}
            <Button variant='outline' size='sm' asChild>
              <a
                href='https://docs.preflytlabs.com/user-guide/native-execution#health-scanning-blocked'
                target='_blank'
                rel='noreferrer'
              >
                Scanning setup guide <ArrowUpRight />
              </a>
            </Button>
            <Button
              variant='outline'
              size='sm'
              disabled={pending}
              onClick={refresh}
            >
              <RefreshCw />
              {pending ? 'Checking…' : 'Check again'}
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
