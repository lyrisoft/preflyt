import { useState } from 'react'
import { ArrowUpRight, ExternalLink, FileText, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import { useStandards, type Standards } from './repository-queries'
import type { ControlFilter, RepositoryTab } from './repository-tabs'
import {
  configurationOrder,
  configurationStatus,
  sentence,
} from './repository-vocabulary'

const filters: { value: ControlFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'review', label: 'Setup gaps' },
  { value: 'found', label: 'Files found' },
  { value: 'ci', label: 'CI checks' },
]
const githubPath = (value: string) =>
  value.split('/').map(encodeURIComponent).join('/')

function ControlDetails({
  control,
  standards,
  repositoryName,
  onClose,
}: {
  control: Standards['controls'][number] | undefined
  standards: Standards | undefined
  repositoryName: string
  onClose: () => void
}) {
  const status = configurationStatus[control?.configuration ?? ''] ?? {
    label: 'Configuration not determined',
    tone: 'neutral' as const,
  }
  const sourceSha = standards?.profileSnapshot?.sourceSha
  const guidance = standards?.catalogue
    .flatMap((pack) => pack.rules)
    .find((rule) => rule.id === control?.id)?.guidance
  return (
    <Dialog open={!!control} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='max-h-[85vh] overflow-y-auto sm:max-w-2xl'>
        {control && (
          <>
            <DialogHeader>
              <DialogTitle>{control.title}</DialogTitle>
              <DialogDescription>
                Files found at the inspected commit. Open Assessments for test
                and scan results.
              </DialogDescription>
            </DialogHeader>
            <div className='flex flex-wrap items-center gap-2'>
              <Badge variant='neutral'>
                {!standards?.selection
                  ? 'Suggested'
                  : control.required
                    ? 'Required'
                    : 'Optional'}
              </Badge>
              <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
              <Badge variant='neutral'>{sentence(control.capability)}</Badge>
            </div>
            {guidance && (
              <p className='text-sm text-muted-foreground'>{guidance}</p>
            )}
            <dl className='grid gap-x-4 gap-y-2 rounded-lg border bg-muted/20 p-4 text-xs sm:grid-cols-[max-content_1fr]'>
              <dt className='text-muted-foreground'>Check ID</dt>
              <dd className='font-mono break-all'>{control.id}</dd>
              <dt className='text-muted-foreground'>Configuration note</dt>
              <dd>{control.reason}</dd>
              <dt className='text-muted-foreground'>Standards</dt>
              <dd>
                {standards?.selection
                  ? `${sentence(standards.selection.profile)} · revision ${standards.selection.revision}`
                  : 'Suggested checks · choose standards to apply them'}
              </dd>
              <dt className='text-muted-foreground'>Inspected commit</dt>
              <dd className='font-mono break-all'>
                {sourceSha ?? 'No inspected revision available'}
              </dd>
            </dl>
            <section>
              <h3 className='mb-3 flex items-center gap-2 text-sm font-semibold'>
                <FileText className='size-4 text-info-text' />
                Evidence files{' '}
                <span className='text-xs font-normal text-muted-foreground'>
                  ({control.evidence.length})
                </span>
              </h3>
              {control.evidence.length ? (
                <ul className='divide-y rounded-lg border'>
                  {control.evidence.map((file) => (
                    <li
                      key={`${file.path}-${file.blobSha}`}
                      className='space-y-1 px-4 py-3'
                    >
                      {sourceSha ? (
                        <a
                          className='inline-flex items-center gap-2 font-mono text-xs break-all text-info-text underline-offset-4 hover:underline'
                          href={`https://github.com/${githubPath(repositoryName)}/blob/${sourceSha}/${githubPath(file.path)}`}
                          target='_blank'
                          rel='noreferrer'
                        >
                          {file.path}
                          <ExternalLink className='size-3 shrink-0' />
                        </a>
                      ) : (
                        <p className='font-mono text-xs break-all'>
                          {file.path}
                        </p>
                      )}
                      <p className='text-[11px] text-muted-foreground'>
                        Blob <code className='break-all'>{file.blobSha}</code>
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className='rounded-lg border border-dashed bg-muted/10 px-4 py-5 text-sm text-muted-foreground'>
                  No configuration evidence was recorded for this control.
                </p>
              )}
            </section>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function RepositoryControls({
  repositoryId,
  repositoryName,
  filter,
  onFilter,
  onOpenTab,
}: {
  repositoryId: string
  repositoryName: string
  filter: ControlFilter
  onFilter: (filter: ControlFilter) => void
  onOpenTab: (tab: RepositoryTab) => void
}) {
  const query = useStandards(repositoryId)
  const data = query.data
  const [details, setDetails] = useState<string | null>(null)
  const controls = [...(data?.controls ?? [])].sort(
    (a, b) =>
      (configurationOrder[a.configuration] ?? 1) -
        (configurationOrder[b.configuration] ?? 1) ||
      Number(b.required) - Number(a.required)
  )
  const counts: Record<ControlFilter, number> = {
    all: controls.length,
    found: controls.filter((c) => c.configuration === 'HINT_DETECTED').length,
    review: controls.filter((c) =>
      ['MISSING', 'UNKNOWN'].includes(c.configuration)
    ).length,
    ci: controls.filter((c) => c.configuration === 'NOT_INSPECTED').length,
  }
  const visible = controls.filter((control) =>
    filter === 'all'
      ? true
      : filter === 'found'
        ? control.configuration === 'HINT_DETECTED'
        : filter === 'ci'
          ? control.configuration === 'NOT_INSPECTED'
          : ['MISSING', 'UNKNOWN'].includes(control.configuration)
  )
  const pageControls = visible
  return (
    <Card className='gap-4'>
      <CardHeader>
        <CardTitle asChild>
          <h2 className='flex items-center gap-3'>
            <SurfaceIcon icon={ShieldCheck} tone='blue' />
            Repository check setup
          </h2>
        </CardTitle>
        <CardDescription>
          {data?.selection
            ? data.selection.policyId
              ? `${data.selection.branchRef?.replace(/^refs\/heads\//, '')} · published policy v${data.selection.revision}`
              : `${sentence(data.selection.profile)} · saved version ${data.selection.revision}`
            : 'Suggested checks · choose standards to apply them'}
        </CardDescription>
        <p className='text-xs text-muted-foreground'>
          Files found at the inspected commit. Test and scan results are in
          Assessments.
        </p>
      </CardHeader>
      <CardContent className='px-0'>
        {query.isPending ? (
          <p role='status' className='px-6 text-sm text-muted-foreground'>
            Loading checks…
          </p>
        ) : query.isError ? (
          <p role='alert' className='px-6 text-sm text-destructive'>
            {query.error.message}
          </p>
        ) : data?.selectionIntegrity === false ? (
          <div
            role='alert'
            className='mx-6 rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm text-warning-text'
          >
            Saved standards do not match the installed catalogue. Review the
            selection before reading these repository checks.
          </div>
        ) : (
          <>
            <div className='mb-3 flex flex-wrap items-center justify-between gap-2 px-6'>
              <div
                role='group'
                aria-label='Filter checks'
                className='inline-flex rounded-md border p-0.5'
              >
                {filters.map((item) => (
                  <button
                    key={item.value}
                    type='button'
                    aria-pressed={filter === item.value}
                    onClick={() => {
                      onFilter(item.value)
                    }}
                    className={cn(
                      'touch-target inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring',
                      item.value === 'review'
                        ? 'aria-pressed:bg-warning/10 aria-pressed:text-warning-text'
                        : item.value === 'found'
                          ? 'aria-pressed:bg-success/10 aria-pressed:text-success-text'
                          : 'aria-pressed:bg-muted aria-pressed:text-foreground'
                    )}
                  >
                    {item.label}
                    <span className='tabular-nums opacity-70'>
                      {counts[item.value]}
                    </span>
                  </button>
                ))}
              </div>
              {!data?.selection && (
                <Button
                  size='sm'
                  variant='outline'
                  className='h-7'
                  onClick={() => onOpenTab('standards')}
                >
                  Choose standards
                </Button>
              )}
            </div>
            <Table key={`${repositoryId}:${filter}`}>
              <TableHeader>
                <TableRow>
                  <TableHead className='ps-6'>Check</TableHead>
                  <TableHead className='hidden sm:table-cell'>
                    Requirement
                  </TableHead>
                  <TableHead className='hidden sm:table-cell'>
                    Configuration
                  </TableHead>
                  <TableHead className='pe-6 text-end'>Related files</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className='px-6 py-8 text-center text-sm text-muted-foreground'
                    >
                      No checks match this filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  pageControls.map((control) => {
                    const status = configurationStatus[
                      control.configuration
                    ] ?? {
                      label: 'Configuration not determined',
                      tone: 'neutral' as const,
                    }
                    return (
                      <TableRow key={control.id}>
                        <TableCell className='max-w-[24rem] min-w-48 ps-6 whitespace-normal sm:min-w-56'>
                          <button
                            type='button'
                            aria-label={`View ${control.title} details`}
                            onClick={() => setDetails(control.id)}
                            className='group inline-flex min-h-8 items-center gap-2 rounded-sm text-start text-sm font-medium hover:text-primary focus-visible:outline-2 focus-visible:outline-ring'
                          >
                            {control.title}
                            <ArrowUpRight className='size-3 shrink-0 text-muted-foreground group-hover:text-primary' />
                          </button>
                          <div className='mt-1 flex flex-wrap gap-1.5 sm:hidden'>
                            <StatusBadge tone={status.tone}>
                              {status.label}
                            </StatusBadge>
                            <Badge variant='neutral'>
                              {!data?.selection
                                ? 'Suggested'
                                : control.required
                                  ? 'Required'
                                  : 'Optional'}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className='hidden sm:table-cell'>
                          <Badge variant='neutral'>
                            {!data?.selection
                              ? 'Suggested'
                              : control.required
                                ? 'Required'
                                : 'Optional'}
                          </Badge>
                        </TableCell>
                        <TableCell className='hidden sm:table-cell'>
                          <StatusBadge tone={status.tone}>
                            {status.label}
                          </StatusBadge>
                        </TableCell>
                        <TableCell className='pe-6 text-end'>
                          {control.evidence.length ? (
                            <Button
                              size='sm'
                              variant='ghost'
                              className='h-7 px-2 text-xs text-info-text'
                              aria-label={`${control.title}: ${control.evidence.length} evidence files`}
                              onClick={() => setDetails(control.id)}
                            >
                              <FileText className='size-3.5' />
                              {control.evidence.length}{' '}
                              {control.evidence.length === 1 ? 'file' : 'files'}
                            </Button>
                          ) : (
                            <span className='text-xs text-muted-foreground'>
                              —
                              <span className='sr-only'>
                                {' '}
                                No evidence files
                              </span>
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </>
        )}
        <ControlDetails
          control={controls.find((control) => control.id === details)}
          standards={data}
          repositoryName={repositoryName}
          onClose={() => setDetails(null)}
        />
      </CardContent>
    </Card>
  )
}
