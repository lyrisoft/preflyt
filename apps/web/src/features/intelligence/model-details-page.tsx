import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, BrainCircuit, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table } from '@/components/ui/table'
import { AppHeader } from '@/components/layout/app-header'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { PageHelpDrawer } from '@/components/page-help-drawer'
import { ResultTimestamp } from '@/components/result-timestamp'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import { TablePagination } from '@/components/table-pagination'
import { governanceRequest } from '../repositories/governance-api'
import {
  useNavigationSession,
  canAdminister,
} from '../workspace/navigation-session'

type Repository = { githubId: string; fullName: string }
type ModelDetails = {
  provider: {
    id: string
    name: string
    modelId: string
    revision: number
    enabled: boolean
    testStatus: string
    testedAt: string | null
    baseUrl: string | null
  }
  totals: {
    inputTokens: number | null
    outputTokens: number | null
    cachedTokens: number | null
    requests: number
    unreportedInput: number
    unreportedOutput: number
  }
  byModel: {
    modelId: string
    inputTokens: number | null
    outputTokens: number | null
    requests: number
  }[]
  activity: {
    sourceId: string
    workload: string
    modelId: string
    repository: Repository
    requests: number
    failedRequests: number
    unreportedRequests: number
    inputTokens: number | null
    outputTokens: number | null
    lastUsedAt: string
  }[]
  legacyVapt: {
    assessmentId: string
    providerRevision: number
    modelId: string | null
    repository: Repository
    inputTokens: number
    outputTokens: number
    modelCalls: number
    createdAt: string
  }[]
  total: number
}
const count = (value: number | null) =>
  value === null ? '—' : value.toLocaleString()
const workloads: Record<string, string> = {
  VAPT: 'AI security review',
  AI_REVIEW: 'AI review',
  FINDING_GUIDANCE: 'Finding guidance',
  WORKFLOW: 'Workflow generation',
}
const help = [
  {
    title: 'What is counted',
    content:
      'Input and output totals use token counts returned by the provider. Cached input is included in input totals where reported. Missing counts stay unknown, including failed or interrupted requests. These are recorded model requests, not a provider billing statement. Requests rejected by a scan limit before inference are not counted.',
  },
  {
    title: 'History and model changes',
    content:
      'Per-request tracking starts with this version. Older security reviews retain allowance counters only; those estimates are shown separately and are not added to provider-reported totals. Each new request keeps the model name and connection revision used at the time. Editing a connection does not rename its recorded usage. Only usage for repositories you can access is shown.',
  },
  {
    title: 'Scan and request outcomes',
    content:
      'Activity groups model requests by scan, review or workflow request. A failed scan can still consume tokens. Failed requests can have reported usage; requests without provider counts remain unknown. Open the source scan to see its assessment outcome.',
  },
]

export function ModelDetailsPage({ providerId }: { providerId: string }) {
  const session = useNavigationSession()
  return (
    <>
      <AppHeader
        breadcrumbs={[
          { label: 'AI Intelligence', to: '/intelligence' },
          { label: 'Model details' },
        ]}
      />
      <Main>
        {session.isPending ? (
          <p role='status'>Checking access…</p>
        ) : session.isError ? (
          <p role='alert'>Access details unavailable. Refresh and try again.</p>
        ) : !canAdminister(session.data?.role) ? (
          <p role='status'>
            Only organization administrators can view model details.
          </p>
        ) : (
          <ModelDetailsContent
            key={`${session.data?.identityId}:${session.data?.organizationId}:${providerId}`}
            providerId={providerId}
            identityId={session.data?.identityId ?? ''}
            organizationId={session.data?.organizationId ?? ''}
          />
        )}
      </Main>
    </>
  )
}
function ModelDetailsContent({
  providerId,
  identityId,
  organizationId,
}: {
  providerId: string
  identityId: string
  organizationId: string
}) {
  const [days, setDays] = useState(30),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(10)
  const query = useQuery({
    queryKey: [
      'ai-model-details',
      identityId,
      organizationId,
      providerId,
      days,
      page,
      pageSize,
    ],
    queryFn: ({ signal }) =>
      governanceRequest<ModelDetails>(
        `/ai/configuration/providers/${encodeURIComponent(providerId)}/usage?days=${days}&page=${page}&pageSize=${pageSize}`,
        undefined,
        signal
      ),
    retry: false,
    refetchOnWindowFocus: false,
  })
  const data = query.isError ? undefined : query.data
  return (
    <div className='space-y-5'>
      <PageHeader
        title={data?.provider.name ?? 'Model details'}
        description={
          data?.provider.modelId ?? 'Connection details and recorded AI usage.'
        }
        section='AI Intelligence'
        icon={BrainCircuit}
        tone='violet'
        actions={
          <div className='flex flex-wrap gap-2'>
            <Button size='sm' variant='outline' asChild>
              <Link to='/intelligence' search={{ tab: 'connections' }}>
                <ArrowLeft aria-hidden='true' />
                Models
              </Link>
            </Button>
            <Button
              size='sm'
              variant='outline'
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              <RefreshCw
                aria-hidden='true'
                className={
                  query.isFetching ? 'motion-safe:animate-spin' : undefined
                }
              />
              Refresh
            </Button>
            <PageHelpDrawer title='Model details' sections={help} />
          </div>
        }
      />
      {query.isPending && <p role='status'>Loading model usage…</p>}
      {query.isError && <p role='alert'>{query.error.message}</p>}
      {data && (
        <>
          <div className='flex flex-wrap items-center gap-3 text-sm'>
            <StatusBadge tone={data.provider.enabled ? 'success' : 'neutral'}>
              {data.provider.enabled ? 'Active' : 'Disabled'}
            </StatusBadge>
            <StatusBadge
              tone={
                data.provider.testStatus === 'CONNECTED' ? 'success' : 'neutral'
              }
            >
              {data.provider.testStatus === 'CONNECTED'
                ? 'Connection tested'
                : 'Not tested'}
            </StatusBadge>
            <span className='text-muted-foreground'>
              {data.provider.baseUrl ?? 'Endpoint unavailable'}
            </span>
          </div>
          <section
            aria-labelledby='model-usage-title'
            className='overflow-hidden rounded-xl border'
          >
            <div className='flex flex-wrap items-center justify-between gap-3 border-b p-4'>
              <div className='flex items-center gap-3'>
                <SurfaceIcon icon={BrainCircuit} tone='violet' />
                <h2 id='model-usage-title' className='text-base font-semibold'>
                  Recorded usage
                </h2>
              </div>
              <Select
                value={String(days)}
                onValueChange={(value) => {
                  setDays(Number(value))
                  setPage(1)
                }}
              >
                <SelectTrigger aria-label='Usage period' className='w-40'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[7, 30, 90].map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      Last {value} days
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <dl className='grid gap-4 p-4 sm:grid-cols-3'>
              {[
                ['Input tokens', count(data.totals.inputTokens)],
                ['Output tokens', count(data.totals.outputTokens)],
                ['Model requests', count(data.totals.requests)],
              ].map(([label, value]) => (
                <div key={label} className='space-y-1'>
                  <dt className='text-xs text-muted-foreground'>{label}</dt>
                  <dd className='text-lg font-semibold tabular-nums'>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            {!!data.totals.cachedTokens && (
              <p className='px-4 pb-3 text-xs text-muted-foreground'>
                Cached input: {count(data.totals.cachedTokens)} tokens reported.
              </p>
            )}
            {(data.totals.unreportedInput > 0 ||
              data.totals.unreportedOutput > 0) && (
              <p
                role='status'
                className='px-4 pb-3 text-sm text-muted-foreground'
              >
                Some requests did not return token counts. Totals include
                reported counts only.
              </p>
            )}
            <p className='px-4 pb-4 text-xs text-muted-foreground'>
              Provider-reported counts for new requests. Earlier estimates are
              listed separately.
            </p>
          </section>
          {data.byModel.length > 1 && (
            <section
              className='overflow-x-auto rounded-xl border'
              aria-label='Usage by model'
            >
              <Table>
                <thead>
                  <tr>
                    <th className='p-3 text-left'>Model</th>
                    <th>Input tokens</th>
                    <th>Output tokens</th>
                    <th>Requests</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byModel.map((row) => (
                    <tr key={row.modelId}>
                      <td className='p-3'>{row.modelId}</td>
                      <td>{count(row.inputTokens)}</td>
                      <td>{count(row.outputTokens)}</td>
                      <td>{count(row.requests)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </section>
          )}
          <section
            aria-labelledby='usage-activity-title'
            className='overflow-hidden rounded-xl border'
          >
            <h2
              id='usage-activity-title'
              className='border-b p-4 text-base font-semibold'
            >
              Usage by scan and review
            </h2>
            {data.activity.length ? (
              <div className='overflow-x-auto'>
                <Table className='text-sm' pagination={false}>
                  <thead>
                    <tr>
                      {[
                        'Activity / repository',
                        'Model',
                        'Input tokens',
                        'Output tokens',
                        'Requests',
                        'Last used',
                      ].map((label) => (
                        <th key={label} className='p-3 text-left'>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.activity.map((row) => (
                      <tr
                        key={`${row.workload}:${row.sourceId}:${row.modelId}`}
                      >
                        <td className='p-3'>
                          <p className='font-medium'>
                            {workloads[row.workload] ?? 'AI request'}
                          </p>
                          <Link
                            to='/repositories/$repositoryId'
                            params={{ repositoryId: row.repository.githubId }}
                            search={
                              row.workload === 'VAPT'
                                ? { health: row.sourceId }
                                : undefined
                            }
                            className='text-xs text-muted-foreground underline underline-offset-4'
                          >
                            {row.repository.fullName}
                          </Link>
                        </td>
                        <td className='p-3'>{row.modelId}</td>
                        <td className='p-3 tabular-nums'>
                          {count(row.inputTokens)}
                        </td>
                        <td className='p-3 tabular-nums'>
                          {count(row.outputTokens)}
                        </td>
                        <td className='p-3 tabular-nums'>
                          {row.requests}
                          {row.failedRequests > 0 && (
                            <p className='text-xs text-muted-foreground'>
                              {row.failedRequests} failed
                            </p>
                          )}
                          {row.unreportedRequests > 0 && (
                            <p className='text-xs text-muted-foreground'>
                              {row.unreportedRequests} without full token counts
                            </p>
                          )}
                        </td>
                        <td className='p-3'>
                          <ResultTimestamp value={row.lastUsedAt} stacked />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            ) : (
              <p className='p-4 text-sm text-muted-foreground'>
                No model usage recorded for this period. New requests will
                appear here.
              </p>
            )}
            <TablePagination
              page={page}
              pageSize={pageSize}
              total={data.total}
              onPageChange={setPage}
              onPageSizeChange={(value) => {
                setPageSize(value)
                setPage(1)
              }}
            />
          </section>
          {data.legacyVapt.length > 0 && (
            <section
              aria-labelledby='earlier-vapt-title'
              className='overflow-hidden rounded-xl border'
            >
              <div className='space-y-1 border-b p-4'>
                <h2 id='earlier-vapt-title' className='text-base font-semibold'>
                  Earlier security reviews
                </h2>
                <p className='text-xs text-muted-foreground'>
                  Last 10 scans with allowance counters only. These estimates
                  are excluded from recorded usage above.
                </p>
              </div>
              <div className='overflow-x-auto'>
                <Table className='text-sm'>
                  <thead>
                    <tr>
                      {[
                        'Repository / model',
                        'Estimated input allowance used',
                        'Output allowance used',
                        'Requests',
                        'Started',
                      ].map((label) => (
                        <th key={label} className='p-3 text-left'>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.legacyVapt.map((row) => (
                      <tr key={row.assessmentId}>
                        <td className='p-3'>
                          <Link
                            to='/repositories/$repositoryId'
                            params={{ repositoryId: row.repository.githubId }}
                            search={{ health: row.assessmentId }}
                            className='font-medium underline underline-offset-4'
                          >
                            {row.repository.fullName}
                          </Link>
                          <p className='text-xs text-muted-foreground'>
                            {row.modelId ??
                              `Model name not recorded (revision ${row.providerRevision})`}
                          </p>
                        </td>
                        <td className='p-3 tabular-nums'>
                          {count(row.inputTokens)}
                        </td>
                        <td className='p-3 tabular-nums'>
                          {count(row.outputTokens)}
                        </td>
                        <td className='p-3 tabular-nums'>{row.modelCalls}</td>
                        <td className='p-3'>
                          <ResultTimestamp value={row.createdAt} stacked />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
