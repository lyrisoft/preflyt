import { useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  RefreshCw,
  ScrollText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { CiActivityCharts, CiActivityEmpty } from './ci-activity-charts'
import { ReportList } from './ci-reports'
import { RelativeTime } from './relative-time'
import { useCiEvidence, type CiObservation } from './repository-queries'
import { ciResultStatus, sentence, sourceLabel } from './repository-vocabulary'

function providerDetail(item: CiObservation) {
  return [item.sourceStatus, item.sourceConclusion]
    .filter((value): value is string => !!value)
    .map(sentence)
    .join(' · ')
}

function DeliveryDialog({
  repositoryId,
  canVerify,
  item,
  onClose,
}: {
  repositoryId: string
  canVerify: boolean
  item: CiObservation | null
  onClose: () => void
}) {
  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='sm:max-w-2xl'>
        {item && (
          <>
            <DialogHeader>
              <DialogTitle>
                {sourceLabel(item.sourceKind, item.sourceObjectId)}
              </DialogTitle>
              <DialogDescription>
                Signed GitHub delivery at commit{' '}
                <code>{item.sourceSha.slice(0, 12)}</code>.
              </DialogDescription>
            </DialogHeader>
            <dl className='grid gap-x-4 gap-y-2 text-xs sm:grid-cols-[max-content_1fr]'>
              <dt className='text-muted-foreground'>Provider result</dt>
              <dd>
                {ciResultStatus[item.result].label}
                {providerDetail(item) && ` (${providerDetail(item)})`}
              </dd>
              <dt className='text-muted-foreground'>Provider timestamp</dt>
              <dd>
                {item.sourceUpdatedAt
                  ? new Date(item.sourceUpdatedAt).toLocaleString()
                  : 'Not reported'}
              </dd>
              <dt className='text-muted-foreground'>Delivery</dt>
              <dd className='font-mono break-all'>{item.deliveryId}</dd>
              <dt className='text-muted-foreground'>Commit</dt>
              <dd className='font-mono break-all'>{item.sourceSha}</dd>
              <dt className='text-muted-foreground'>
                Evidence SHA-256 (v{item.version})
              </dt>
              <dd className='font-mono break-all'>{item.evidenceHash}</dd>
              <dt className='text-muted-foreground'>Signed delivery digest</dt>
              <dd className='font-mono break-all'>{item.sourcePayloadHash}</dd>
            </dl>
            <h3 className='text-sm font-medium'>Reports</h3>
            <ReportList
              artifacts={item.artifacts}
              repositoryId={repositoryId}
              deliveryId={item.deliveryId}
              canVerify={canVerify}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function RepositoryCiEvidence({
  repositoryId,
  canManageEvidence,
  showIntegrationLink = true,
}: {
  repositoryId: string
  canManageEvidence: boolean
  showIntegrationLink?: boolean
}) {
  const [page, setPage] = useState(1)
  const [draft, setDraft] = useState('')
  const [sha, setSha] = useState('')
  const [details, setDetails] = useState<string | null>(null)
  const valid = draft === '' || /^[a-f0-9]{40}$/i.test(draft)
  const summary = useCiEvidence(repositoryId, sha, { poll: true })
  const query = useCiEvidence(repositoryId, sha, { poll: true, page })
  const observations = query.data?.observations ?? []
  const detailItem =
    observations.find((item) => item.deliveryId === details) ?? null
  return (
    <Card className='gap-4'>
      <CardHeader>
        <CardTitle asChild>
          <h2>CI results</h2>
        </CardTitle>
        <CardDescription>
          Workflow runs, check results and reports received from your pipeline.
        </CardDescription>
        <CardAction>
          <Button
            variant='outline'
            size='icon'
            className='touch-target size-8'
            aria-label='Refresh CI results'
            disabled={query.isFetching}
            onClick={() => {
              void summary.refetch()
              void query.refetch()
            }}
          >
            <RefreshCw className={query.isFetching ? 'animate-spin' : ''} />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className='space-y-5 px-0'>
        {summary.data && summary.data.observations.length > 0 && (
          <CiActivityCharts observations={summary.data.observations} />
        )}
        <form
          className='flex max-w-xl flex-wrap items-center gap-2 px-6'
          onSubmit={(event) => {
            event.preventDefault()
            if (valid) {
              setSha(draft.toLowerCase())
              setPage(1)
              setDetails(null)
            }
          }}
        >
          <Input
            aria-label='Filter by commit SHA'
            value={draft}
            maxLength={40}
            className='h-8 min-w-0 flex-1 font-mono text-xs'
            placeholder='Filter by full commit SHA'
            aria-invalid={!valid}
            aria-describedby={valid ? undefined : 'ci-filter-error'}
            onChange={(event) => setDraft(event.target.value.trim())}
          />
          <Button type='submit' size='sm' variant='outline' disabled={!valid}>
            Apply
          </Button>
          {sha && (
            <Button
              type='button'
              size='sm'
              variant='ghost'
              onClick={() => {
                setDraft('')
                setSha('')
                setPage(1)
                setDetails(null)
              }}
            >
              Clear
            </Button>
          )}
          {!valid && (
            <p id='ci-filter-error' className='w-full text-xs text-destructive'>
              Enter all 40 characters of a commit SHA.
            </p>
          )}
        </form>
        {query.isPending ? (
          <p role='status' className='px-6 text-sm text-muted-foreground'>
            Loading CI results…
          </p>
        ) : query.isError ? (
          <p role='alert' className='px-6 text-sm text-destructive'>
            {query.error.message}
          </p>
        ) : observations.length === 0 ? (
          <CiActivityEmpty
            enabled={query.data.enabled}
            filtered={!!sha}
            canConfigure={canManageEvidence}
            showIntegrationLink={showIntegrationLink}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='ps-6'>Source</TableHead>
                <TableHead>Commit</TableHead>
                <TableHead>Provider result</TableHead>
                <TableHead>Reports</TableHead>
                <TableHead>Received</TableHead>
                <TableHead className='w-12 pe-6'>
                  <span className='sr-only'>Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {observations.map((item) => {
                const status = ciResultStatus[item.result]
                const label = sourceLabel(item.sourceKind, item.sourceObjectId)
                return (
                  <TableRow key={item.deliveryId}>
                    <TableCell className='ps-6 font-medium'>{label}</TableCell>
                    <TableCell>
                      <code className='text-xs' title={item.sourceSha}>
                        {item.sourceSha.slice(0, 7)}
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className='flex items-center gap-2'>
                        <StatusBadge tone={status.tone}>
                          {status.label}
                        </StatusBadge>
                        {item.result === 'UNKNOWN' && providerDetail(item) && (
                          <span className='text-xs text-muted-foreground'>
                            {providerDetail(item)}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className='text-xs text-muted-foreground tabular-nums'>
                      {item.artifacts.length
                        ? `${item.artifacts.length} report${item.artifacts.length === 1 ? '' : 's'}`
                        : 'None'}
                    </TableCell>
                    <TableCell className='text-xs text-muted-foreground'>
                      <RelativeTime value={item.observedAt} />
                    </TableCell>
                    <TableCell className='pe-6 text-end'>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant='ghost'
                            size='icon'
                            className='touch-target size-8'
                            aria-label={`Actions for ${label}`}
                          >
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align='end'>
                          <DropdownMenuItem
                            onSelect={() => setDetails(item.deliveryId)}
                          >
                            <ScrollText aria-hidden='true' />
                            Delivery details
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
        {query.data?.pagination && !query.isError && (
          <nav
            aria-label='CI results pagination'
            className='flex flex-wrap items-center justify-between gap-3 border-t px-6 pt-4'
          >
            <p className='text-xs text-muted-foreground'>
              Page {page} · {query.data.pagination.total} results
            </p>
            <div className='flex gap-2'>
              <Button
                variant='outline'
                size='sm'
                disabled={page === 1 || query.isFetching}
                onClick={() => {
                  setPage(page - 1)
                  setDetails(null)
                }}
              >
                <ChevronLeft aria-hidden='true' />
                Previous
              </Button>
              <Button
                variant='outline'
                size='sm'
                disabled={!query.data.pagination.hasNext || query.isFetching}
                onClick={() => {
                  setPage(page + 1)
                  setDetails(null)
                }}
              >
                Next
                <ChevronRight aria-hidden='true' />
              </Button>
            </div>
          </nav>
        )}
        <DeliveryDialog
          repositoryId={repositoryId}
          canVerify={canManageEvidence}
          item={detailItem}
          onClose={() => setDetails(null)}
        />
      </CardContent>
    </Card>
  )
}
