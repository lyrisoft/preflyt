import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function CompactPagination({
  page,
  pageSize,
  total,
  onPageChange,
  label,
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  label: string
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <nav
      aria-label={label}
      className='mt-3 flex items-center justify-between gap-3 border-t pt-3'
    >
      <span className='text-xs text-muted-foreground tabular-nums'>
        {total ? (page - 1) * pageSize + 1 : 0}–
        {Math.min(page * pageSize, total)} of {total}
      </span>
      <div className='flex gap-1'>
        <Button
          variant='ghost'
          size='icon'
          className='size-8'
          aria-label={`Previous ${label}`}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className='size-4' />
        </Button>
        <Button
          variant='ghost'
          size='icon'
          className='size-8'
          aria-label={`Next ${label}`}
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight className='size-4' />
        </Button>
      </div>
    </nav>
  )
}
