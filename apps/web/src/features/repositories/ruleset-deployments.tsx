import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { handleServerError } from '@/lib/handle-server-error'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { governanceRequest } from './governance-api'

type Deployment = {
  id: string
  state: string
  draftId: string
  proposedById: string
  approvedById: string | null
  approvalKind: string
  previewHash: string
  definition: unknown
  preview: {
    impacts: { prNumber: number; sourceSha: string; conclusion: string }[]
  }
  githubRulesetId: string | null
  message: string | null
  verifiedAt: string | null
}
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b))
        )
      : item
  )
}
type Verification = {
  state: string
  observed: Record<string, unknown>
  expected: Record<string, unknown>
}
type Page = {
  enabled: boolean
  canSelfApprove: boolean
  hasMore: boolean
  deployments: Deployment[]
}
export function RulesetDeployments({
  repositoryId,
  actorId,
  canManage,
}: {
  repositoryId: string
  actorId?: string
  canManage: boolean
}) {
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1),
    [draftId, setDraftId] = useState(''),
    [selected, setSelected] = useState<Deployment | null>(null),
    [busy, setBusy] = useState(false),
    [verification, setVerification] = useState<Verification | null>(null),
    [error, setError] = useState(''),
    [confirmation, setConfirmation] = useState<'deploy' | 'rollback' | null>(
      null
    )
  const root = `/github/repositories/${repositoryId}/ruleset-deployments`
  const query = useQuery({
    queryKey: ['ruleset-deployments', actorId, root, page, pageSize],
    queryFn: ({ signal }) =>
      governanceRequest<Page>(
        `${root}?page=${page}&pageSize=${pageSize}`,
        undefined,
        signal
      ),
    retry: false,
  })
  const drafts = useQuery({
    queryKey: ['deployment-drafts', actorId, repositoryId],
    queryFn: ({ signal }) =>
      governanceRequest<{
        drafts: { id: string; name: string; definitionHash: string }[]
      }>(
        `/github/repositories/${repositoryId}/ruleset-drafts`,
        undefined,
        signal
      ),
    retry: false,
  })
  const action = async (
    kind: 'preview' | 'approve' | 'deploy' | 'refresh' | 'rollback',
    row?: Deployment
  ) => {
    setBusy(true)
    setError('')
    try {
      if (kind === 'preview') {
        const draft = drafts.data?.drafts.find((d) => d.id === draftId)
        if (!draft) return
        setSelected(
          await governanceRequest<Deployment>(`${root}/preview`, {
            draftId,
            expectedDraftHash: draft.definitionHash,
          })
        )
      } else if (row) {
        if (kind === 'refresh') {
          const result = await governanceRequest<Verification>(
            `${root}/${row.id}/${kind}`,
            { expectedPreviewHash: row.previewHash }
          )
          setVerification(result)
          setSelected({
            ...row,
            state: result.state,
            message:
              result.state === 'DRIFTED'
                ? 'GitHub protections changed outside Preflyt. Review the differences below. Preflyt has not overwritten them.'
                : null,
          })
          if (result.state === 'DRIFTED')
            toast.warning('GitHub ruleset changes detected')
          else toast.success('GitHub ruleset verified')
        } else {
          await governanceRequest(`${root}/${row.id}/${kind}`, {
            expectedPreviewHash: row.previewHash,
          })
          setSelected(null)
          setVerification(null)
          toast.success(
            kind === 'rollback'
              ? 'Managed ruleset disabled and verified'
              : kind === 'deploy'
                ? 'GitHub ruleset activated and verified'
                : 'Ruleset activation approved'
          )
        }
      }
      setConfirmation(null)
      await query.refetch()
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : 'The ruleset operation could not be verified'
      setError(message)
      handleServerError(new Error(message), {
        id: `ruleset-operation:${repositoryId}:${kind}`,
      })
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Card className='gap-4'>
        <CardHeader className='flex flex-wrap items-center justify-between gap-3'>
          <CardTitle>Managed deployments</CardTitle>
          <Button
            size='sm'
            variant='outline'
            disabled={busy || query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw className='size-4' />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className='space-y-4'>
          {canManage && (
            <div className='flex flex-wrap gap-3'>
              <Select
                value={draftId}
                onValueChange={setDraftId}
                disabled={busy}
              >
                <SelectTrigger className='w-80'>
                  <SelectValue placeholder='Choose a saved ruleset draft' />
                </SelectTrigger>
                <SelectContent>
                  {(!drafts.isError ? drafts.data?.drafts : [])?.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                disabled={busy || !draftId || !query.data?.enabled}
                onClick={() => void action('preview')}
              >
                Review activation
              </Button>
            </div>
          )}
          {query.data && !query.data.enabled && (
            <p className='text-sm text-muted-foreground'>
              Ruleset activation is disabled in this deployment.
            </p>
          )}
          {(error || query.isError || drafts.isError) && (
            <p role='alert' className='text-sm text-destructive'>
              {error || query.error?.message || drafts.error?.message}
            </p>
          )}
          {query.isPending ? (
            <p role='status'>Loading deployments…</p>
          ) : (
            !query.isError &&
            query.data && (
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
                      <TableHead>Deployment</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Last verified</TableHead>
                      <TableHead className='text-right'>Review</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {query.data.deployments.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <p className='font-medium'>
                            {row.githubRulesetId
                              ? `GitHub ruleset ${row.githubRulesetId}`
                              : 'Activation proposal'}
                          </p>
                          <code className='text-xs text-muted-foreground'>
                            {row.id.slice(0, 8)}
                          </code>
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            tone={
                              row.state === 'ACTIVE'
                                ? 'success'
                                : ['UNKNOWN', 'DRIFTED'].includes(row.state)
                                  ? 'warning'
                                  : 'neutral'
                            }
                          >
                            {row.state.replace(/_/g, ' ').toLowerCase()}
                          </StatusBadge>
                        </TableCell>
                        <TableCell className='text-xs text-muted-foreground'>
                          {row.verifiedAt
                            ? new Date(row.verifiedAt).toLocaleString()
                            : 'Not verified'}
                        </TableCell>
                        <TableCell className='text-right'>
                          <Button
                            variant='ghost'
                            size='sm'
                            onClick={() => {
                              setSelected(row)
                              setVerification(null)
                              setConfirmation(null)
                              setError('')
                            }}
                          >
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {!query.data.deployments.length && (
                  <p className='p-6 text-center text-sm text-muted-foreground'>
                    No managed rulesets yet. Review a saved draft to begin.
                  </p>
                )}
              </>
            )
          )}
        </CardContent>
      </Card>
      <Sheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null)
            setConfirmation(null)
          }
        }}
      >
        <SheetContent className='w-full gap-0 sm:max-w-2xl'>
          <SheetHeader className='border-b p-6'>
            <SheetTitle>Ruleset activation review</SheetTitle>
            <SheetDescription>
              Applies only to this repository and the branches shown below.
            </SheetDescription>
          </SheetHeader>
          {selected && (
            <>
              <div className='flex-1 space-y-5 overflow-y-auto p-6'>
                <StatusBadge
                  tone={
                    selected.state === 'DRIFTED'
                      ? 'warning'
                      : selected.state === 'ACTIVE'
                        ? 'success'
                        : 'neutral'
                  }
                >
                  {selected.state.replace(/_/g, ' ').toLowerCase()}
                </StatusBadge>
                {selected.approvalKind === 'SUPER_ADMIN_SELF_APPROVAL' && (
                  <p className='text-sm text-muted-foreground'>
                    Approved by the proposing Super Admin.
                  </p>
                )}
                {selected.message && (
                  <p className='text-sm'>{selected.message}</p>
                )}
                {verification?.state === 'DRIFTED' && (
                  <section
                    className='space-y-3'
                    aria-label='GitHub configuration changes'
                  >
                    <h3 className='text-sm font-semibold'>
                      Changes detected on GitHub
                    </h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Setting</TableHead>
                          <TableHead>Last verified</TableHead>
                          <TableHead>On GitHub now</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Array.from(
                          new Set([
                            ...Object.keys(verification.expected),
                            ...Object.keys(verification.observed),
                          ])
                        )
                          .filter(
                            (key) =>
                              canonicalJson(verification.expected[key]) !==
                              canonicalJson(verification.observed[key])
                          )
                          .map((key) => (
                            <TableRow key={key}>
                              <TableCell className='align-top font-medium'>
                                {key.replace(/_/g, ' ')}
                              </TableCell>
                              <TableCell className='max-w-56 align-top'>
                                <pre className='text-xs break-all whitespace-pre-wrap'>
                                  {JSON.stringify(
                                    verification.expected[key] ?? null,
                                    null,
                                    2
                                  )}
                                </pre>
                              </TableCell>
                              <TableCell className='max-w-56 align-top'>
                                <pre className='text-xs break-all whitespace-pre-wrap'>
                                  {JSON.stringify(
                                    verification.observed[key] ?? null,
                                    null,
                                    2
                                  )}
                                </pre>
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </section>
                )}
                <section className='space-y-3'>
                  <h3 className='text-sm font-semibold'>
                    Open pull requests affected
                  </h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>PR</TableHead>
                        <TableHead>Commit</TableHead>
                        <TableHead>Merge review result</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selected.preview.impacts.map((pr) => (
                        <TableRow key={pr.prNumber}>
                          <TableCell>#{pr.prNumber}</TableCell>
                          <TableCell>
                            <code>{pr.sourceSha.slice(0, 7)}</code>
                          </TableCell>
                          <TableCell>
                            <StatusBadge
                              tone={
                                pr.conclusion === 'success'
                                  ? 'success'
                                  : 'warning'
                              }
                            >
                              {pr.conclusion === 'success'
                                ? 'Passing'
                                : 'Merging will be blocked'}
                            </StatusBadge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </section>
                <details>
                  <summary className='cursor-pointer text-sm font-medium'>
                    Approved GitHub configuration
                  </summary>
                  <pre className='mt-3 overflow-auto rounded-lg border bg-muted/20 p-4 text-xs'>
                    {JSON.stringify(selected.definition, null, 2)}
                  </pre>
                </details>
                {error && (
                  <p role='alert' className='text-sm text-destructive'>
                    {error}
                  </p>
                )}
                {selected.state === 'PREVIEW' &&
                  selected.proposedById === actorId &&
                  !query.data?.canSelfApprove && (
                    <p className='text-sm text-muted-foreground'>
                      Another authorized administrator must approve activation.
                    </p>
                  )}
                {confirmation && (
                  <div className='space-y-3 rounded-lg border border-warning/20 bg-warning/5 p-4'>
                    <p className='text-sm'>
                      {confirmation === 'deploy'
                        ? 'Activate this ruleset on GitHub? PRs without a passing Preflyt check will be blocked.'
                        : 'Disable this managed ruleset on GitHub? Other GitHub protections remain in effect.'}
                    </p>
                    <div className='flex gap-2'>
                      <Button
                        disabled={busy}
                        onClick={() => void action(confirmation, selected)}
                      >
                        Confirm{' '}
                        {confirmation === 'deploy' ? 'activation' : 'rollback'}
                      </Button>
                      <Button
                        variant='outline'
                        disabled={busy}
                        onClick={() => setConfirmation(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <div className='flex flex-wrap justify-end gap-2 border-t p-5'>
                {canManage && (
                  <>
                    {selected.githubRulesetId && (
                      <Button
                        variant='outline'
                        disabled={busy}
                        onClick={() => void action('refresh', selected)}
                      >
                        Verify GitHub
                      </Button>
                    )}
                    {selected.state === 'PREVIEW' &&
                      (selected.proposedById !== actorId ||
                        query.data?.canSelfApprove) && (
                        <Button
                          disabled={busy}
                          onClick={() => void action('approve', selected)}
                        >
                          Approve activation
                        </Button>
                      )}
                    {['APPROVED', 'UNKNOWN', 'DEPLOYING'].includes(
                      selected.state
                    ) && (
                      <Button
                        disabled={busy}
                        onClick={() => setConfirmation('deploy')}
                      >
                        Activate on GitHub
                      </Button>
                    )}
                    {['ACTIVE', 'ROLLING_BACK'].includes(selected.state) && (
                      <Button
                        variant='outline'
                        disabled={busy}
                        onClick={() => setConfirmation('rollback')}
                      >
                        Roll back
                      </Button>
                    )}
                  </>
                )}
                <Button
                  variant='outline'
                  disabled={busy}
                  onClick={() => setSelected(null)}
                >
                  Close
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
