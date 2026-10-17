import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export type TablePaginationState = {
  page: number
  pageSize: number
  total?: number
  hasNext?: boolean
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

export function TablePagination({
  page,
  pageSize,
  total,
  hasNext,
  onPageChange,
  onPageSizeChange,
}: TablePaginationState) {
  const pages =
    total === undefined ? undefined : Math.max(1, Math.ceil(total / pageSize))
  return (
    <nav
      aria-label='Table pagination'
      className='flex flex-wrap items-center justify-between gap-3 border-t px-3 py-3 text-xs text-muted-foreground'
    >
      <div className='flex flex-wrap items-center gap-2'>
        <span>Rows per page</span>
        <Select
          value={String(pageSize)}
          onValueChange={(value) => onPageSizeChange(Number(value))}
        >
          <SelectTrigger
            size='sm'
            aria-label='Rows per page'
            className='w-20 bg-background text-foreground'
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className='min-w-20'>
            {[10, 25, 50, 100].map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className='flex flex-wrap items-center gap-3'>
        <span aria-live='polite' className='tabular-nums'>
          {total === undefined
            ? `Page ${page}`
            : `${total ? (page - 1) * pageSize + 1 : 0}–${Math.min(page * pageSize, total)} of ${total}`}
        </span>
        <Button
          size='sm'
          variant='ghost'
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          size='sm'
          variant='ghost'
          disabled={
            hasNext === undefined
              ? pages === undefined || page >= pages
              : !hasNext
          }
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </nav>
  )
}
