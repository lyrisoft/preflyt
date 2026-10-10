import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
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
import { RulesetDeployments } from './ruleset-deployments'
import { RulesetDrafts } from './ruleset-drafts'
import { RulesetInsights } from './ruleset-insights'

type Summary = {
  id: number
  name: string
  target: string
  sourceType: string
  source: string
  enforcement: 'active' | 'disabled' | 'evaluate'
  htmlUrl: string
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
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    cache: 'no-store',
    signal,
  })
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as {
      code?: string
      retryAfterSeconds?: number
    } | null
    throw new Error(
      response.status === 403
        ? 'You do not have access to these rulesets, or GitHub access has changed.'
        : response.status === 429 || error?.code === 'GITHUB_RATE_LIMITED'
          ? `GitHub is limiting requests. Try again${error?.retryAfterSeconds ? ` in ${error.retryAfterSeconds} seconds` : ' shortly'}.`
          : 'Rulesets could not be loaded. Check GitHub access and plan support, then try again.'
    )
  }
  return response.json() as Promise<T>
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
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
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
              <div role='alert' className='space-y-3'>
                <p className='text-sm'>{detail.error.message}</p>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => void detail.refetch()}
                >
                  Try again
                </Button>
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
  const [page, setPage] = useState(1)
  const refreshRequested = useRef(false)
  const query = useQuery({
    queryKey: ['github-rulesets', actorId, repositoryId, page],
    queryFn: async ({ signal }) => {
      const refresh = refreshRequested.current
      refreshRequested.current = false
      return read<{
        rulesets: Summary[]
        hasMore: boolean
        page: number
        fetchedAt: string
      }>(
        `/github/repositories/${repositoryId}/rulesets?page=${page}${refresh ? '&refresh=true' : ''}`,
        signal
      )
    },
    enabled: canRead && view === 'github',
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  })
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
              <span className='flex size-10 items-center justify-center rounded-xl bg-info/10 text-info'>
                <ShieldCheck className='size-5' />
              </span>
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
              disabled={query.isFetching}
              onClick={() => {
                refreshRequested.current = true
                void query.refetch()
              }}
            >
              <RefreshCw className='size-4' />
              Refresh
            </Button>
          </CardHeader>
          <CardContent className='space-y-4'>
            {query.isPending && <Skeleton className='h-48' />}
            {query.isError && (
              <p
                role='alert'
                className='rounded-lg border border-warning/20 bg-warning/5 p-4 text-sm'
              >
                {query.error.message}
              </p>
            )}
            {query.data && (
              <>
                <Table>
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
                <div className='flex items-center justify-between gap-3 border-t pt-4'>
                  <p className='text-xs text-muted-foreground'>
                    Page {page} · {query.data.rulesets.length} rulesets
                  </p>
                  <div className='flex gap-2'>
                    <Button
                      variant='outline'
                      size='sm'
                      disabled={page === 1 || query.isFetching}
                      onClick={() => setPage(page - 1)}
                    >
                      <ChevronLeft className='size-4' />
                      Previous
                    </Button>
                    <Button
                      variant='outline'
                      size='sm'
                      disabled={!query.data.hasMore || query.isFetching}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                      <ChevronRight className='size-4' />
                    </Button>
                  </div>
                </div>
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
