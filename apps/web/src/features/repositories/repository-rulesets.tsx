import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight, RefreshCw, ShieldCheck } from 'lucide-react'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import { governanceRequest } from './governance-api'
import { RulesetDeployments } from './ruleset-deployments'
import { RulesetDrafts } from './ruleset-drafts'
import { RulesetInsights } from './ruleset-insights'
import { workflowRefreshInterval } from './workflow-refresh-polling'
import { WorkflowRequestError } from './workflow-request-error'

type Summary = {
  id: number
  name: string
  target: string
  sourceType: string
  source: string
  enforcement: 'active' | 'disabled' | 'evaluate'
  htmlUrl: string
}
type RulesetList = {
  rulesets: Summary[]
  hasMore: boolean
  page: number
  fetchedAt: string
}
type Detail = Summary & {
  branches: { include: string[]; exclude: string[] }
  rules: {
    type: string
    requiredApprovals: number | null
    checks: { context: string; integrationId: number | null }[]
  }[]
}
async function read<T>(path: string, signal: AbortSignal): Promise<T> {
  return governanceRequest<T>(path, undefined, signal)
}
const tone = {
  active: 'success',
  disabled: 'neutral',
  evaluate: 'info',
} as const
const stateLabel = {
  active: 'Active',
  disabled: 'Disabled',
  evaluate: 'Evaluate',
}
const ruleLabel = (value: string) =>
  value.replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase())
export function RulesetDetail({
  repositoryId,
  actorId,
  id,
  canRead,
}: {
  repositoryId: string
  actorId?: string
  id: number
  canRead: boolean
}) {
  const detail = useQuery({
    queryKey: ['github-ruleset', actorId, repositoryId, id],
    queryFn: ({ signal }) =>
      read<{ ruleset: Detail; fetchedAt: string }>(
        `/github/repositories/${repositoryId}/rulesets/${id}`,
        signal
      ),
    enabled: canRead,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      if (query.state.status === 'error')
        return workflowRefreshInterval(query.state.error)
      const fetchedAt = Date.parse(query.state.data?.fetchedAt ?? '')
      // Schedule from GitHub fetch time, not the time this tab read the cache.
      return Number.isFinite(fetchedAt)
        ? Math.max(5_000, 5 * 60_000 - (Date.now() - fetchedAt))
        : 5 * 60_000
    },
    retry: false,
  })
  const ruleset = detail.isError ? undefined : detail.data?.ruleset
  if (!canRead)
    return (
      <p role='alert' className='rounded-xl border p-4 text-sm'>
        You need permission to view policies for this repository.
      </p>
    )
  return (
    <RulesetInsights
      repositoryId={repositoryId}
      actorId={actorId}
      rulesetId={id}
      configuration={
        <Card className='min-w-0 gap-3'>
          <CardHeader className='flex items-center gap-3'>
            <SurfaceIcon icon={ShieldCheck} tone='blue' />
            <div className='min-w-0'>
              <CardTitle>Configuration</CardTitle>
              <p className='mt-1 text-xs font-medium break-words text-muted-foreground'>
                {ruleset?.name ?? 'GitHub ruleset'}
              </p>
            </div>
          </CardHeader>
          <CardContent className='space-y-4'>
            {detail.isPending && <Skeleton className='h-48' />}
            {detail.isError && (
              <div className='flex flex-wrap items-start gap-3'>
                <WorkflowRequestError
                  error={detail.error}
                  retry={() => void detail.refetch()}
                  automatic
                  checking={detail.isFetching}
                />
              </div>
            )}
            {ruleset && (
              <>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <StatusBadge tone={tone[ruleset.enforcement]}>
                    {stateLabel[ruleset.enforcement]}
                  </StatusBadge>
                  <Button asChild variant='outline' size='sm'>
                    <a href={ruleset.htmlUrl} target='_blank' rel='noreferrer'>
                      View on GitHub
                      <ArrowUpRight className='size-3.5' />
                    </a>
                  </Button>
                </div>
                <dl className='space-y-2 text-xs'>
                  {[
                    ['Source', ruleset.source],
                    ['Level', ruleset.sourceType],
                    ['Target', ruleLabel(ruleset.target)],
                    [
                      'Fetched',
                      new Date(detail.data!.fetchedAt).toLocaleString(),
                    ],
                  ].map(([name, value]) => (
                    <div
                      key={name}
                      className='grid grid-cols-[5rem_minmax(0,1fr)] gap-3'
                    >
                      <dt className='text-muted-foreground'>{name}</dt>
                      <dd className='text-right font-medium break-words'>
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <section className='space-y-2 border-t pt-3'>
                  <h3 className='text-sm font-semibold'>Branches</h3>
                  {(['include', 'exclude'] as const).map((kind) => (
                    <div
                      key={kind}
                      className='grid grid-cols-[5rem_minmax(0,1fr)] gap-3 text-xs'
                    >
                      <p className='text-muted-foreground'>
                        {kind === 'include' ? 'Included' : 'Excluded'}
                      </p>
                      <div className='flex flex-wrap justify-end gap-1'>
                        {ruleset.branches[kind].length ? (
                          ruleset.branches[kind].map((ref, index) => (
                            <code
                              key={`${ref}-${index}`}
                              className='rounded-md bg-muted/30 px-1.5 py-0.5 break-all'
                            >
                              {ref}
                            </code>
                          ))
                        ) : (
                          <span className='text-muted-foreground'>None</span>
                        )}
                      </div>
                    </div>
                  ))}
                </section>
                <section className='space-y-2 border-t pt-3'>
                  <h3 className='text-sm font-semibold'>
                    Rules · {ruleset.rules.length}
                  </h3>
                  <div className='divide-y'>
                    {ruleset.rules.map((rule, index) => (
                      <div
                        key={`${rule.type}-${index}`}
                        className='space-y-1.5 py-2 first:pt-0 last:pb-0'
                      >
                        <p className='text-sm font-medium'>
                          {ruleLabel(rule.type)}
                        </p>
                        {rule.requiredApprovals !== null && (
                          <p className='text-xs text-muted-foreground'>
                            Required approvals: {rule.requiredApprovals}
                          </p>
                        )}
                        {rule.checks.map((check, index) => (
                          <div
                            key={`${check.context}-${index}`}
                            className='text-xs'
                          >
                            <p className='break-all'>{check.context}</p>
                            <p className='text-muted-foreground'>
                              {check.integrationId === null
                                ? 'Any source App'
                                : `GitHub App ID: ${check.integrationId}`}
                            </p>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                  {!ruleset.rules.length && (
                    <p className='text-xs text-muted-foreground'>
                      No rules reported.
                    </p>
                  )}
                </section>
              </>
            )}
          </CardContent>
        </Card>
      }
    />
  )
}

export function RepositoryRulesets({
  repositoryId,
  actorId,
  canRead,
  canDraft,
  canManage,
  repositoryName,
  initialView = 'github',
}: {
  repositoryId: string
  actorId?: string
  canRead: boolean
  canDraft: boolean
  canManage: boolean
  repositoryName: string
  initialView?: 'github' | 'drafts' | 'deployments'
}) {
  const [view, setView] = useState<string>(initialView)
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const queryKey = ['github-rulesets', actorId, repositoryId, page, pageSize]
  const scope = JSON.stringify(queryKey)
  const [refreshSnapshot, setRefreshSnapshot] = useState<{
    scope: string
    fetchedAt: string
    startedAt: number
  } | null>(null)
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      read<RulesetList>(
        `/github/repositories/${repositoryId}/rulesets?page=${page}&pageSize=${pageSize}`,
        signal
      ),
    enabled: canRead && view === 'github',
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      if (query.state.status === 'error')
        return workflowRefreshInterval(query.state.error)
      if (
        refreshSnapshot?.scope === scope &&
        query.state.data?.fetchedAt === refreshSnapshot.fetchedAt
      )
        return Date.now() - refreshSnapshot.startedAt < 120_000 ? 5_000 : 60_000
      const fetchedAt = Date.parse(query.state.data?.fetchedAt ?? '')
      // Schedule from GitHub fetch time, not the time this tab read the cache.
      return Number.isFinite(fetchedAt)
        ? Math.max(5_000, 5 * 60_000 - (Date.now() - fetchedAt))
        : 5 * 60_000
    },
    retry: false,
  })
  const refresh = useMutation({
    mutationFn: async (request: { key: typeof queryKey; path: string }) => {
      await queryClient.cancelQueries({
        queryKey: request.key,
        exact: true,
      })
      return read<RulesetList>(request.path, new AbortController().signal)
    },
    onSuccess: (data, request) => {
      queryClient.setQueryData(request.key, data)
      setRefreshSnapshot({
        scope: JSON.stringify(request.key),
        fetchedAt: data.fetchedAt,
        startedAt: Date.now(),
      })
    },
    onError: (_error, request) =>
      void queryClient.invalidateQueries({
        queryKey: request.key,
        exact: true,
      }),
    meta: { successMessage: 'GitHub ruleset refresh requested.' },
  })
  const waitingForSnapshot =
    refreshSnapshot?.scope === scope &&
    query.data?.fetchedAt === refreshSnapshot.fetchedAt
  const refreshDelayed =
    waitingForSnapshot &&
    refreshSnapshot !== null &&
    query.dataUpdatedAt - refreshSnapshot.startedAt >= 120_000
  const refreshing =
    refresh.isPending || (waitingForSnapshot && !refreshDelayed)
  if (!canRead)
    return (
      <p role='alert' className='rounded-xl border p-4 text-sm'>
        You need permission to view policies for this repository.
      </p>
    )
  return (
    <Tabs value={view} onValueChange={setView} className='space-y-4'>
      <TabsList>
        <TabsTrigger value='github'>GitHub rulesets</TabsTrigger>
        <TabsTrigger value='drafts'>Drafts</TabsTrigger>
        <TabsTrigger value='deployments'>Deployments</TabsTrigger>
      </TabsList>
      <TabsContent value='github'>
        <Card className='gap-4'>
          <CardHeader className='flex flex-wrap items-center justify-between gap-3'>
            <div className='flex items-center gap-3'>
              <SurfaceIcon icon={ShieldCheck} tone='blue' />
              <div>
                <CardTitle>GitHub Rulesets</CardTitle>
                {query.data && (
                  <p className='mt-1 text-xs text-muted-foreground'>
                    Fetched {new Date(query.data.fetchedAt).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
            <Button
              variant='outline'
              size='sm'
              disabled={query.isFetching || refreshing}
              onClick={() =>
                query.isError
                  ? void query.refetch()
                  : refresh.mutate({
                      key: queryKey,
                      path: `/github/repositories/${repositoryId}/rulesets?page=${page}&pageSize=${pageSize}&refresh=true`,
                    })
              }
            >
              <RefreshCw
                className={`size-4 ${refreshing ? 'animate-spin motion-reduce:animate-none' : ''}`}
              />
              Refresh
            </Button>
          </CardHeader>
          <CardContent className='space-y-4'>
            {query.isPending && <Skeleton className='h-48' />}
            {refreshing && !query.isError && (
              <p role='status' className='text-sm text-muted-foreground'>
                Updating GitHub rulesets…
              </p>
            )}
            {refreshDelayed && !query.isError && (
              <p role='status' className='text-sm text-muted-foreground'>
                GitHub is taking longer to refresh. Saved rulesets are shown.
                You can request another refresh.
              </p>
            )}
            {query.isError && (
              <div className='flex flex-wrap items-start gap-3 rounded-lg border p-4'>
                <WorkflowRequestError
                  error={query.error}
                  retry={() => void query.refetch()}
                  automatic
                  checking={query.isFetching}
                />
              </div>
            )}
            {query.data && !query.isError && (
              <>
                <Table
                  pagination={{
                    page,
                    pageSize,
                    hasNext: query.data?.hasMore,
                    onPageChange: setPage,
                    onPageSizeChange: (size) => {
                      setPageSize(size)
                      setPage(1)
                    },
                  }}
                >
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>GitHub state</TableHead>
                      <TableHead className='text-right'>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {query.data.rulesets.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Link
                            to='/quality-gates'
                            search={{
                              repository: repositoryId,
                              ruleset: item.id,
                            }}
                            className='max-w-80 text-left font-medium break-words text-primary hover:underline focus-visible:rounded focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
                          >
                            {item.name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <p className='text-sm'>{item.source}</p>
                          <p className='text-xs text-muted-foreground'>
                            {item.sourceType}
                          </p>
                        </TableCell>
                        <TableCell>{ruleLabel(item.target)}</TableCell>
                        <TableCell>
                          <StatusBadge tone={tone[item.enforcement]}>
                            {stateLabel[item.enforcement]}
                          </StatusBadge>
                        </TableCell>
                        <TableCell className='text-right'>
                          <Button
                            variant='ghost'
                            size='sm'
                            aria-label={`View ${item.name}`}
                            asChild
                          >
                            <Link
                              to='/quality-gates'
                              search={{
                                repository: repositoryId,
                                ruleset: item.id,
                              }}
                            >
                              View <ArrowUpRight className='size-3.5' />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {!query.data.rulesets.length && (
                  <p className='rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground'>
                    No rulesets returned for this repository. Other GitHub
                    branch protections may still apply.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value='drafts'>
        {view === 'drafts' && (
          <RulesetDrafts
            repositoryId={repositoryId}
            repositoryName={repositoryName}
            actorId={actorId}
            canDraft={canDraft}
          />
        )}
      </TabsContent>
      <TabsContent value='deployments'>
        {view === 'deployments' && (
          <RulesetDeployments
            repositoryId={repositoryId}
            actorId={actorId}
            canManage={canManage}
          />
        )}
      </TabsContent>
    </Tabs>
  )
}
