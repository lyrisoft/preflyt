import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Radio } from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import { useNavigationSession } from '@/features/workspace/navigation-session'

export type ReportingState = {
  enabled: boolean
  countryReportingEnabled: boolean
  countryReportingEnvironmentDisabled: boolean
  environmentDisabled: boolean
  revision: number
  acknowledged: boolean
  destination: string | null
  configured: boolean
  lastReportedAt: string | null
  nextAttemptAt: string | null
  error: string | null
  payload: {
    countryReporting?: boolean
    schemaVersion: 1
    installationId: string
    version: string
    deploymentType: string
  }
}
async function request<T>(
  path = '',
  body?: unknown,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch(
    `${API_BASE_URL}/installation-reporting${path}`,
    {
      credentials: 'include',
      cache: 'no-store',
      signal,
      ...(body === undefined
        ? {}
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }),
    }
  )
  const data = await response.json().catch(() => null)
  if (!response.ok)
    throw new Error(
      typeof data?.message === 'string'
        ? data.message
        : 'Installation reporting is unavailable. Try again.'
    )
  return data
}
function useReporting() {
  const session = useNavigationSession(),
    client = useQueryClient()
  const query = useQuery({
    queryKey: ['installation-reporting', session.data?.identityId],
    enabled: session.isSuccess && !!session.data?.platformAdmin,
    queryFn: ({ signal }) => request<ReportingState>('', undefined, signal),
    retry: false,
    gcTime: 0,
    refetchInterval: 60000,
  })
  const save = useMutation({
    meta: { successMessage: 'Installation reporting preference saved' },
    mutationFn: (preferences: {
      enabled?: boolean
      countryReportingEnabled?: boolean
    }) =>
      request('/preferences', {
        ...preferences,
        expectedRevision: query.data?.revision,
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['installation-reporting'] }),
  })

  return { session, query, save }
}
export function InstallationReportingSettings() {
  const { session, query, save } = useReporting()
  if (!session.data?.platformAdmin) return null
  const data = query.isError ? undefined : query.data
  return (
    <Card>
      <CardHeader className='flex flex-row items-center gap-3'>
        <SurfaceIcon icon={Radio} tone='blue' />
        <CardTitle className='text-base'>Installation reporting</CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        <p className='text-sm text-muted-foreground'>
          Optional reporting helps Preflyt understand Community Edition
          adoption. It is enabled by default and applies to this whole
          installation.
        </p>
        {query.isPending && <p role='status'>Loading reporting preference…</p>}
        {query.isError && (
          <div role='alert' className='space-y-2'>
            <p>{query.error.message}</p>
            <Button
              variant='outline'
              size='sm'
              onClick={() => void query.refetch()}
            >
              Retry
            </Button>
          </div>
        )}
        {data && (
          <>
            <label className='flex items-center justify-between gap-4 text-sm font-medium'>
              <span>Send installation reports</span>
              <Switch
                checked={data.enabled}
                disabled={data.environmentDisabled || save.isPending}
                onCheckedChange={(enabled) => save.mutate({ enabled })}
              />
            </label>
            <StatusBadge tone='neutral'>
              {data.enabled
                ? data.configured
                  ? 'Enabled'
                  : 'Not configured'
                : 'Disabled'}
            </StatusBadge>
            {data.environmentDisabled && (
              <p className='text-sm'>
                Disabled by the deployment environment. It cannot be enabled
                here.
              </p>
            )}
            {!data.configured && (
              <p className='text-sm'>
                A reporting receiver has not been configured. No reports are
                being sent.
              </p>
            )}
            <div className='space-y-2 border-t pt-4'>
              <label className='flex items-center justify-between gap-4 text-sm font-medium'>
                <span>Include installation country</span>
                <Switch
                  checked={data.countryReportingEnabled}
                  disabled={
                    !data.enabled ||
                    data.environmentDisabled ||
                    data.countryReportingEnvironmentDisabled ||
                    save.isPending
                  }
                  onCheckedChange={(countryReportingEnabled) =>
                    save.mutate({ countryReportingEnabled })
                  }
                  aria-describedby='installation-country-description'
                />
              </label>
              <p
                id='installation-country-description'
                className='text-sm text-muted-foreground'
              >
                Off by default. When enabled, the receiver resolves the server’s
                outgoing IP address locally and keeps only the country code. It
                does not store the IP address, city or precise location. Proxies
                and VPNs can affect accuracy. Unresolved countries remain
                unknown.
              </p>
              {data.countryReportingEnvironmentDisabled && (
                <p className='text-sm'>
                  Country reporting is disabled by the deployment environment.
                </p>
              )}
              <p className='text-sm text-muted-foreground'>
                Turning this off removes the saved country when the receiver
                accepts the next report. If all reporting is disabled, the
                previous country remains until the record expires after 90 days
                of inactivity.
              </p>
            </div>
            <dl className='space-y-2 text-sm'>
              <div className='flex flex-wrap justify-between gap-2'>
                <dt className='text-muted-foreground'>Receiver</dt>
                <dd className='wrap-anywhere'>
                  {data.destination ?? 'Not configured'}
                </dd>
              </div>
              <div className='flex flex-wrap justify-between gap-2'>
                <dt className='text-muted-foreground'>Last accepted report</dt>
                <dd>
                  {data.lastReportedAt
                    ? new Date(data.lastReportedAt).toLocaleString()
                    : 'None'}
                </dd>
              </div>
            </dl>
            <p className='text-sm text-muted-foreground'>
              One report is attempted at startup, then about once a day. Reports
              contain no names, emails, repository identities, source code or
              findings. Turning reporting off prevents future reports; it does
              not retract a report already sent. This setting is separate from
              OpenTelemetry and update checks.
            </p>
            <details className='text-sm'>
              <summary className='cursor-pointer font-medium'>
                Exact report contents
              </summary>
              <pre className='mt-2 overflow-x-auto rounded-lg bg-muted p-3 text-xs'>
                {JSON.stringify(data.payload, null, 2)}
              </pre>
            </details>
            {data.enabled && data.error && (
              <p role='alert' className='text-sm'>
                {data.error}
              </p>
            )}
          </>
        )}
        {save.isError && (
          <p role='alert' className='text-sm text-destructive'>
            {save.error.message}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
