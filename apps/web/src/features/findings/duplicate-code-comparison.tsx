import { useState, type ComponentProps } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { TablePagination } from '@/components/table-pagination'
import { useFindingSource, type FindingSource } from './finding-api'
import { FindingGuidance } from './finding-guidance'
import { FindingSourceViewer } from './finding-source'
import type { Finding } from './finding-types'

export function DuplicateCodeComparison({
  finding,
  source,
  sourcePath,
  aiState,
  onRetryAi,
}: {
  finding: Finding
  source: UseQueryResult<FindingSource, Error>
  sourcePath: string
  aiState?: ComponentProps<typeof FindingSourceViewer>['aiState']
  onRetryAi?: () => void
}) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selected, setSelected] = useState(0)
  const [compare, setCompare] = useState(false)
  const locations = [
    {
      path: finding.path,
      line: finding.line,
      endLine: finding.endLine ?? finding.line,
    },
    ...(finding.relatedLocations ?? []),
  ]
  const location = locations[selected] ?? locations[0]
  const selectedSource = useFindingSource(
    `${sourcePath}${sourcePath.includes('?') ? '&' : '?'}location=${selected}`,
    selected > 0
  )
  const primary = { ...finding, relatedLocations: [] }
  const selectedFinding = { ...primary, ...location }
  const pages = Math.max(1, Math.ceil(locations.length / pageSize))
  const currentPage = Math.min(page, pages)
  return (
    <section
      className='min-w-0 space-y-4'
      aria-label='Duplicate code comparison'
    >
      <div className='overflow-hidden rounded-xl border bg-card'>
        <div className='space-y-1 border-b p-4'>
          <h2 className='text-base font-semibold'>Duplicate locations</h2>
          <p className='text-sm text-muted-foreground'>
            {locations.length} reported locations at commit{' '}
            {finding.sourceSha.slice(0, 12)}. Select a block to preview or
            compare.
          </p>
          <p className='text-xs text-muted-foreground'>
            Older assessments may have retained only three matches. Reassess to
            collect all reported locations.
          </p>
        </div>
        <ul className='divide-y'>
          {locations
            .slice((currentPage - 1) * pageSize, currentPage * pageSize)
            .map((item, offset) => {
              const index = (currentPage - 1) * pageSize + offset
              return (
                <li
                  key={`${item.path}:${item.line}:${item.endLine}`}
                  className='flex flex-wrap items-center justify-between gap-3 px-4 py-3'
                >
                  <div className='min-w-0 flex-1 text-sm'>
                    <p className='font-medium wrap-anywhere'>{item.path}</p>
                    <p className='text-xs text-muted-foreground'>
                      Lines {item.line}–{item.endLine}
                      {index === 0 ? ' · Original block' : ''}
                    </p>
                  </div>
                  <div className='flex gap-2'>
                    <Button
                      size='sm'
                      variant='outline'
                      aria-label={`Preview location ${index + 1}`}
                      aria-pressed={selected === index && !compare}
                      onClick={() => {
                        setSelected(index)
                        setCompare(false)
                      }}
                    >
                      Preview
                    </Button>
                    {index > 0 && (
                      <Button
                        size='sm'
                        variant='outline'
                        aria-label={`Compare location ${index + 1}`}
                        aria-pressed={selected === index && compare}
                        onClick={() => {
                          setSelected(index)
                          setCompare(true)
                        }}
                      >
                        Compare
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
        </ul>
        <TablePagination
          page={currentPage}
          pageSize={pageSize}
          total={locations.length}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size)
            setPage(1)
          }}
        />
      </div>
      <div
        className={
          compare && selected > 0
            ? 'grid min-w-0 gap-4 xl:grid-cols-2'
            : 'min-w-0'
        }
      >
        {compare && selected > 0 && (
          <div className='min-w-0 space-y-2'>
            <h3 className='text-sm font-medium'>Original block</h3>
            <FindingSourceViewer
              finding={primary}
              source={source}
              showGuidance={false}
            />
          </div>
        )}
        <div className='min-w-0 space-y-2'>
          <h3 className='text-sm font-medium' aria-live='polite'>
            {selected === 0
              ? 'Original block'
              : `Matching block · location ${selected + 1}`}
          </h3>
          <FindingSourceViewer
            finding={selectedFinding}
            source={selected === 0 ? source : selectedSource}
            showGuidance={false}
          />
        </div>
      </div>
      <div className='overflow-hidden rounded-xl border bg-card'>
        <FindingGuidance
          finding={finding}
          aiState={aiState}
          onRetryAi={onRetryAi}
        />
      </div>
    </section>
  )
}
