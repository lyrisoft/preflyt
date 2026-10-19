import { Fragment, useId, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronRight, FileSearch } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import type { HealthReport } from './health-api'
import { reviewAreaOutcomes, sourceReviewAreas } from './source-review-areas'

export function SourceReviewCoverage({
  report,
  repositoryId,
  assessmentId,
}: {
  report: HealthReport
  repositoryId?: string
  assessmentId?: string
}) {
  const id = useId()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  if (!report.analyses.some((analysis) => analysis.id === 'security.strix'))
    return null
  const coverage = report.sourceReviewCoverage
  const rows = sourceReviewAreas(coverage)
  const reviewCount = rows.filter(
    (row) => row.outcome === 'needs_follow_up' || row.notes.length > 0
  ).length
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(rows.length / pageSize))
  )
  return (
    <section
      aria-label='Source review coverage'
      className='min-w-0 overflow-hidden rounded-xl border'
    >
      <div className='flex flex-wrap items-center justify-between gap-3 p-4'>
        <div className='flex min-w-0 items-center gap-3'>
          <SurfaceIcon icon={FileSearch} tone='blue' />
          <div className='min-w-0'>
            <h3 className='text-sm font-semibold'>Source review coverage</h3>
            <p className='mt-1 text-xs text-muted-foreground'>
              Live APIs and websites were outside scope.
            </p>
          </div>
        </div>
        {coverage?.available && rows.length > 0 && (
          <p className='text-xs text-muted-foreground tabular-nums'>
            {rows.length} {rows.length === 1 ? 'area' : 'areas'} · {reviewCount}{' '}
            need review
          </p>
        )}
      </div>
      <div className='space-y-2 border-t px-4 py-3 text-xs leading-relaxed text-muted-foreground'>
        <p>
          Suggestions only. These records do not independently verify that a
          test ran or an area is secure.
        </p>
        {!coverage?.available && (
          <p role='status'>
            Review coverage is unavailable. Unreported areas remain unknown.
          </p>
        )}
        {coverage?.available && rows.length === 0 && (
          <p role='status'>
            No review areas or gaps were recorded. Coverage remains unknown.
          </p>
        )}
        {coverage?.truncated && (
          <p role='status'>
            Some coverage details were omitted. This list is incomplete.
          </p>
        )}
        {coverage?.caveats.map((caveat, index) => (
          <p key={index} className='break-words'>
            {caveat}
          </p>
        ))}
      </div>
      {rows.length > 0 && (
        <Table
          className='table-fixed'
          aria-label='AI-reported review areas and gaps'
          pagination={{
            page: currentPage,
            pageSize,
            total: rows.length,
            onPageChange: setPage,
            onPageSizeChange: (size) => {
              setPageSize(size)
              setPage(1)
            },
          }}
        >
          <TableHeader>
            <TableRow className='bg-muted/30 hover:bg-muted/30'>
              <TableHead className='h-10 px-4'>Review area</TableHead>
              <TableHead className='hidden w-44 px-4 sm:table-cell'>
                AI-reported result
              </TableHead>
              <TableHead className='w-11 sm:w-28'>
                <span className='sr-only'>Details</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows
              .slice((currentPage - 1) * pageSize, currentPage * pageSize)
              .map((entry, offset) => {
                const index = (currentPage - 1) * pageSize + offset
                const open = expanded.has(index)
                const outcome = reviewAreaOutcomes[entry.outcome]
                const detailsId = `${id}-area-${index}`
                return (
                  <Fragment key={index}>
                    <TableRow className={open ? 'bg-muted/20' : undefined}>
                      <TableCell className='px-4 py-3 align-top whitespace-normal'>
                        <p className='line-clamp-2 max-w-[72ch] text-sm leading-5 font-medium [overflow-wrap:anywhere]'>
                          {repositoryId && assessmentId ? (
                            <Link
                              className='underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring'
                              to='/review-areas/$assessmentId/$areaId'
                              params={{ assessmentId, areaId: String(index) }}
                              search={{ repository: repositoryId }}
                            >
                              {entry.riskArea || 'Review area not specified'}
                            </Link>
                          ) : (
                            entry.riskArea || 'Review area not specified'
                          )}
                        </p>
                        <p className='mt-1 line-clamp-1 font-mono text-xs leading-5 [overflow-wrap:anywhere] text-muted-foreground'>
                          {entry.surface || 'Source not specified'}
                        </p>
                        <div className='mt-2 sm:hidden'>
                          <StatusBadge tone={outcome.tone} compact>
                            {outcome.label}
                          </StatusBadge>
                        </div>
                      </TableCell>
                      <TableCell className='hidden px-4 py-3 align-top sm:table-cell'>
                        <StatusBadge tone={outcome.tone} compact>
                          {outcome.label}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className='px-1 py-2 align-top sm:px-3'>
                        {repositoryId && assessmentId ? (
                          <Button
                            variant='ghost'
                            size='sm'
                            className='max-sm:size-8 max-sm:p-0'
                            asChild
                          >
                            <Link
                              to='/review-areas/$assessmentId/$areaId'
                              params={{ assessmentId, areaId: String(index) }}
                              search={{ repository: repositoryId }}
                              aria-label={`View details for review area ${index + 1}`}
                            >
                              <ChevronRight
                                aria-hidden='true'
                                className='size-4'
                              />
                              <span className='hidden sm:inline'>Details</span>
                            </Link>
                          </Button>
                        ) : (
                          <Button
                            variant='ghost'
                            size='sm'
                            className='max-sm:size-8 max-sm:p-0'
                            aria-expanded={open}
                            aria-controls={detailsId}
                            aria-label={`${open ? 'Hide' : 'Show'} details for review area ${index + 1}`}
                            onClick={() =>
                              setExpanded((previous) => {
                                const next = new Set(previous)
                                if (open) next.delete(index)
                                else next.add(index)
                                return next
                              })
                            }
                          >
                            <ChevronRight
                              aria-hidden='true'
                              className={`size-4 transition-transform motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
                            />
                            <span className='hidden sm:inline'>Details</span>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                    {open && (
                      <TableRow className='bg-muted/10 hover:bg-muted/10'>
                        <TableCell
                          colSpan={3}
                          className='px-4 py-4 whitespace-normal'
                        >
                          <div
                            id={detailsId}
                            className='max-w-[80ch] space-y-4 text-sm leading-relaxed'
                          >
                            <dl className='space-y-3'>
                              <div>
                                <dt className='text-xs font-medium text-muted-foreground'>
                                  Review area
                                </dt>
                                <dd className='mt-1 [overflow-wrap:anywhere]'>
                                  {entry.riskArea || 'Not specified'}
                                </dd>
                              </div>
                              <div>
                                <dt className='text-xs font-medium text-muted-foreground'>
                                  Source
                                </dt>
                                <dd className='mt-1 font-mono text-xs leading-5 [overflow-wrap:anywhere]'>
                                  {entry.surface || 'Not specified'}
                                </dd>
                              </div>
                            </dl>
                            {entry.notes.length > 0 && (
                              <div>
                                <p className='text-xs font-medium text-muted-foreground'>
                                  What needs review
                                </p>
                                <ul className='mt-1 space-y-2'>
                                  {entry.notes.map((note, noteIndex) => (
                                    <li
                                      key={noteIndex}
                                      className='[overflow-wrap:anywhere]'
                                    >
                                      {note}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })}
          </TableBody>
        </Table>
      )}
    </section>
  )
}
