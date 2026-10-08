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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { EvidenceDialog } from './evidence-dialog'
import type { ControlFilter, RepositoryTab } from './posture-summary'
import { useStandards } from './repository-queries'
import {
  configurationOrder,
  configurationStatus,
  sentence,
} from './repository-vocabulary'

const filters: { value: ControlFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'review', label: 'Needs review' },
  { value: 'found', label: 'Config found' },
]

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
  const controls = [...(data?.controls ?? [])].sort(
    (a, b) =>
      (configurationOrder[a.configuration] ?? 1) -
        (configurationOrder[b.configuration] ?? 1) ||
      Number(b.required) - Number(a.required)
  )
  const counts: Record<ControlFilter, number> = {
    all: controls.length,
    found: controls.filter((c) => c.configuration === 'HINT_DETECTED').length,
    review: controls.filter((c) => c.configuration !== 'HINT_DETECTED').length,
  }
  const visible = controls.filter((control) =>
    filter === 'all'
      ? true
      : filter === 'found'
        ? control.configuration === 'HINT_DETECTED'
        : control.configuration !== 'HINT_DETECTED'
  )
  return (
    <Card className='gap-4'>
      <CardHeader>
        <CardTitle>Controls</CardTitle>
        <CardDescription>
          {data?.selection
            ? `From the saved ${data.selection.profile.toLowerCase()} standards selection.`
            : 'Recommended preview. Save a standards selection to track these controls.'}
        </CardDescription>
      </CardHeader>
      <CardContent className='px-0'>
        {query.isPending ? (
          <p role='status' className='px-6 text-sm text-muted-foreground'>
            Loading controls…
          </p>
        ) : query.isError ? (
          <p role='alert' className='px-6 text-sm text-destructive'>
            {query.error.message}
          </p>
        ) : (
          <>
            <div className='mb-3 flex flex-wrap items-center justify-between gap-2 px-6'>
              <div
                role='group'
                aria-label='Filter controls'
                className='inline-flex rounded-md border p-0.5'
              >
                {filters.map((item) => (
                  <button
                    key={item.value}
                    type='button'
                    aria-pressed={filter === item.value}
                    onClick={() => onFilter(item.value)}
                    className='inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-muted aria-pressed:text-foreground'
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className='ps-6'>Control</TableHead>
                  <TableHead className='hidden sm:table-cell'>
                    Requirement
                  </TableHead>
                  <TableHead className='hidden sm:table-cell'>
                    Configuration
                  </TableHead>
                  <TableHead className='pe-6'>Evidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className='px-6 py-8 text-center text-sm text-muted-foreground'
                    >
                      No controls match this filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  visible.map((control) => {
                    const status = configurationStatus[
                      control.configuration
                    ] ?? { label: 'Unknown', tone: 'neutral' as const }
                    return (
                      <TableRow key={control.id}>
                        <TableCell className='max-w-[28rem] min-w-48 ps-6 whitespace-normal sm:min-w-64'>
                          <p className='font-medium'>{control.title}</p>
                          <p className='mt-0.5 text-xs text-muted-foreground'>
                            {sentence(control.capability)}
                            {control.configuration !== 'HINT_DETECTED' &&
                              ` · ${control.reason}`}
                          </p>
                          <div className='mt-1.5 flex flex-wrap gap-1.5 sm:hidden'>
                            <StatusBadge tone={status.tone}>
                              {status.label}
                            </StatusBadge>
                            <Badge variant='neutral'>
                              {control.required ? 'Required' : 'Advisory'}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className='hidden sm:table-cell'>
                          <Badge variant='neutral'>
                            {control.required ? 'Required' : 'Advisory'}
                          </Badge>
                        </TableCell>
                        <TableCell className='hidden sm:table-cell'>
                          <StatusBadge tone={status.tone}>
                            {status.label}
                          </StatusBadge>
                        </TableCell>
                        <TableCell className='pe-6'>
                          {control.evidence.length ? (
                            <EvidenceDialog
                              compact
                              title={control.title}
                              files={control.evidence}
                              repositoryName={repositoryName}
                              sourceSha={data?.profileSnapshot?.sourceSha}
                            />
                          ) : (
                            <span className='text-xs text-muted-foreground'>
                              None
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
      </CardContent>
    </Card>
  )
}
