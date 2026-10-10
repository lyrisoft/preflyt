import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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
import { BranchProtection } from './branch-protection'
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
function RulesetDrawer({
  repositoryId,
  actorId,
  id,
  onClose,
}: {
  repositoryId: string
  actorId?: string
  id: number | null
  onClose: () => void
}) {
  const [view, setView] = useState('configuration')
  const detail = useQuery({
    queryKey: ['github-ruleset', actorId, repositoryId, id],
    queryFn: ({ signal }) =>
      read<{ ruleset: Detail; fetchedAt: string }>(
        `/github/repositories/${repositoryId}/rulesets/${id}`,
        signal
      ),
    enabled: id !== null,
    staleTime: 60_000,
    retry: false,
  })
  const ruleset = detail.isError ? undefined : detail.data?.ruleset
  return (
    <Sheet open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className='w-full gap-0 sm:max-w-3xl'>
        <SheetHeader className='border-b p-6'>
          <SheetTitle>{ruleset?.name ?? 'GitHub ruleset'}</SheetTitle>
          <SheetDescription>
            Rules reported by GitHub for this repository.
          </SheetDescription>
        </SheetHeader>
        <div className='flex-1 space-y-6 overflow-y-auto p-6'>
          <Tabs value={view} onValueChange={setView}>
            <TabsList>
              <TabsTrigger value='configuration'>Configuration</TabsTrigger>
              <TabsTrigger value='insights'>Insights</TabsTrigger>
            </TabsList>
          </Tabs>
          {view === 'insights' && id !== null && (
            <RulesetInsights
              repositoryId={repositoryId}
              actorId={actorId}
              rulesetId={id}
            />
          )}
          {view === 'configuration' && detail.isPending && (
            <Skeleton className='h-48' />
          )}
          {view === 'configuration' && detail.isError && (
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
          {view === 'configuration' && !detail.isError && ruleset && (
            <>
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <StatusBadge tone={tone[ruleset.enforcement]}>
                  {stateLabel[ruleset.enforcement]}
                </StatusBadge>
                <Button asChild variant='outline' size='sm'>
                  <a href={ruleset.htmlUrl} target='_blank' rel='noreferrer'>
                    View on GitHub
                    <ArrowUpRight className='size-4' />
                  </a>
                </Button>
              </div>
              <dl className='grid grid-cols-2 gap-4 text-sm'>
                <div>
                  <dt className='text-muted-foreground'>Source</dt>
                  <dd className='mt-1 font-medium break-all'>
                    {ruleset.source}
                  </dd>
                </div>
                <div>
                  <dt className='text-muted-foreground'>Level</dt>
                  <dd className='mt-1 font-medium'>{ruleset.sourceType}</dd>
                </div>
                <div>
                  <dt className='text-muted-foreground'>Target</dt>
                  <dd className='mt-1 font-medium'>
                    {ruleLabel(ruleset.target)}
                  </dd>
                </div>
                <div>
                  <dt className='text-muted-foreground'>Fetched from GitHub</dt>
                  <dd className='mt-1'>
                    {new Date(detail.data!.fetchedAt).toLocaleString()}
                  </dd>
                </div>
              </dl>
              <section className='space-y-3'>
                <h3 className='text-sm font-semibold'>Branch patterns</h3>
                {(['include', 'exclude'] as const).map((kind) => (
                  <div key={kind}>
                    <p className='mb-1 text-xs text-muted-foreground'>
                      {kind === 'include' ? 'Included' : 'Excluded'}
                    </p>
                    {ruleset.branches[kind].length ? (
                      <div className='flex flex-wrap gap-2'>
                        {ruleset.branches[kind].map((ref, index) => (
                          <code
                            key={`${ref}-${index}`}
                            className='rounded-md border bg-muted/30 px-2 py-1 text-xs break-all'
                          >
                            {ref}
                          </code>
                        ))}
                      </div>
                    ) : (
                      <p className='text-sm text-muted-foreground'>
                        None reported
                      </p>
                    )}
                  </div>
                ))}
              </section>
              <section className='space-y-3'>
                <h3 className='text-sm font-semibold'>
                  Rules · {ruleset.rules.length}
                </h3>
                {ruleset.rules.map((rule, index) => (
                  <div
                    key={`${rule.type}-${index}`}
                    className='space-y-2 rounded-lg border p-3'
                  >
                    <p className='text-sm font-medium'>
                      {ruleLabel(rule.type)}
                    </p>
                    {rule.requiredApprovals !== null && (
                      <p className='text-sm text-muted-foreground'>
                        Required approvals: {rule.requiredApprovals}
                      </p>
                    )}
                    {rule.checks.map((check, index) => (
                      <div
                        key={`${check.context}-${index}`}
                        className='rounded-md bg-muted/30 p-2 text-xs'
                      >
                        <p className='font-medium break-all'>{check.context}</p>
                        <p className='mt-1 text-muted-foreground'>
                          {check.integrationId === null
                            ? 'Any source App'
                            : `GitHub App ID: ${check.integrationId}`}
                        </p>
                      </div>
                    ))}
                  </div>
                ))}
                {!ruleset.rules.length && (
                  <p className='text-sm text-muted-foreground'>
                    No rules reported.
                  </p>
                )}
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
export function RepositoryRulesets({
  repositoryId,
  actorId,
  canRead,
  canDraft,
  canManage,
  repositoryName,
}: {
  repositoryId: string
  actorId?: string
  canRead: boolean
  canDraft: boolean
  canManage: boolean
  repositoryName: string
}) {
  const [view, setView] = useState('github')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<number | null>(null)
  const query = useQuery({
    queryKey: ['github-rulesets', actorId, repositoryId, page],
    queryFn: ({ signal }) =>
      read<{
        rulesets: Summary[]
        hasMore: boolean
        page: number
        fetchedAt: string
      }>(`/github/repositories/${repositoryId}/rulesets?page=${page}`, signal),
    enabled: canRead && view === 'github',
    staleTime: 60_000,
    retry: false,
  })
  if (!canRead)
    return (
      <p role='alert' className='rounded-xl border p-5 text-sm'>
        You need permission to view policies for this repository.
      </p>
    )
  return (
    <Tabs value={view} onValueChange={setView} className='space-y-4'>
      <TabsList>
        <TabsTrigger value='github'>GitHub rulesets</TabsTrigger>
        <TabsTrigger value='protection'>Branch protection</TabsTrigger>
        <TabsTrigger value='drafts'>Drafts</TabsTrigger>
        <TabsTrigger value='deployments'>Deployments</TabsTrigger>
      </TabsList>
      <TabsContent value='protection'>
        <BranchProtection repositoryId={repositoryId} actorId={actorId} />
      </TabsContent>
      <TabsContent value='github'>
        <Card className='gap-4'>
          <CardHeader className='flex flex-wrap items-center justify-between gap-3'>
            <div className='flex items-center gap-3'>
              <span className='flex size-10 items-center justify-center rounded-xl bg-info/10 text-info'>
                <ShieldCheck className='size-5' />
              </span>
              <div>
                <CardTitle>GitHub Rulesets</CardTitle>
                {!query.isError && query.data && (
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
              onClick={() => void query.refetch()}
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
            {!query.isError && query.data && (
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
                          <button
                            type='button'
                            className='max-w-80 text-left font-medium break-words text-primary hover:underline focus-visible:rounded focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
                            onClick={() => setSelected(item.id)}
                          >
                            {item.name}
                          </button>
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
                            onClick={() => setSelected(item.id)}
                            aria-label={`View ${item.name}`}
                          >
                            View
                            <ArrowUpRight className='size-3.5' />
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
      <RulesetDrawer
        key={selected ?? 'none'}
        repositoryId={repositoryId}
        actorId={actorId}
        id={selected}
        onClose={() => setSelected(null)}
      />
    </Tabs>
  )
}
