import { Button } from '@/components/ui/button'

export function TabPagination({
  pagination,
  label,
  onPageChange,
}: {
  pagination: { total: number; page: number; pages: number; pageSize: number }
  label: string
  onPageChange: (page: number) => void
}) {
  if (!pagination.total) return null
  return (
    <div className='mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground'>
      <p>
        {(pagination.page - 1) * pagination.pageSize + 1}–
        {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{' '}
        {pagination.total} {label}
      </p>
      {pagination.pages > 1 && (
        <nav
          aria-label={`${label} pagination`}
          className='flex items-center gap-2'
        >
          <Button
            size='sm'
            variant='outline'
            disabled={pagination.page === 1}
            onClick={() => onPageChange(pagination.page - 1)}
          >
            Previous
          </Button>
          <span aria-live='polite'>
            Page {pagination.page} of {pagination.pages}
          </span>
          <Button
            size='sm'
            variant='outline'
            disabled={pagination.page === pagination.pages}
            onClick={() => onPageChange(pagination.page + 1)}
          >
            Next
          </Button>
        </nav>
      )}
    </div>
  )
}
