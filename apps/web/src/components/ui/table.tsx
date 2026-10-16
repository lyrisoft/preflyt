import * as React from 'react'
import { cn } from '@/lib/utils'
import {
  TablePagination,
  type TablePaginationState,
} from '@/components/table-pagination'

function Table({
  className,
  children,
  pagination,
  ...props
}: React.ComponentProps<'table'> & {
  pagination?: false | TablePaginationState
}) {
  const [size, setSize] = React.useState(10)
  const [requestedPage, setPage] = React.useState(1)
  const sections = React.Children.toArray(children)
  const body = sections.find(
    (child) =>
      React.isValidElement<{ children?: React.ReactNode }>(child) &&
      (child.type === TableBody || child.type === 'tbody')
  ) as React.ReactElement<{ children?: React.ReactNode }> | undefined
  const rows = React.Children.toArray(body?.props.children)
  const page = Math.min(
    requestedPage,
    Math.max(1, Math.ceil(rows.length / size))
  )
  const controls =
    pagination === false
      ? null
      : (pagination ?? {
          page,
          pageSize: size,
          total: rows.length,
          onPageChange: setPage,
          onPageSizeChange: (next: number) => {
            setSize(next)
            setPage(1)
          },
        })
  const content =
    pagination === undefined && body
      ? sections.map((section) =>
          section === body
            ? React.cloneElement(body, {
                children: rows.slice((page - 1) * size, page * size),
              })
            : section
        )
      : children
  const container = React.useRef<HTMLDivElement>(null)
  const [scrollable, setScrollable] = React.useState(false)
  React.useEffect(() => {
    const element = container.current
    if (!element) return
    // Keyboard users can only scroll an overflowing table if it can take focus.
    let frame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() =>
        setScrollable(element.scrollWidth > element.clientWidth + 1)
      )
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [])
  return (
    <div className='min-w-0'>
      <div
        ref={container}
        data-slot='table-container'
        tabIndex={scrollable ? 0 : undefined}
        className='relative w-full overflow-x-auto focus-visible:outline-2 focus-visible:outline-ring'
      >
        <table
          data-slot='table'
          className={cn('w-full caption-bottom text-sm', className)}
          {...props}
        >
          {content}
        </table>
      </div>
      {controls && <TablePagination {...controls} />}
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return (
    <thead
      data-slot='table-header'
      className={cn('[&_tr]:border-b', className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot='table-body'
      className={cn('[&_tr:last-child]:border-0', className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot='table-footer'
      className={cn(
        'border-t bg-muted/50 font-medium [&>tr]:last:border-b-0',
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot='table-row'
      className={cn(
        'border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted',
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot='table-head'
      scope='col'
      className={cn(
        'h-10 px-2 text-start align-middle font-medium whitespace-nowrap text-foreground *:[[role=checkbox]]:translate-y-0.5',
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot='table-cell'
      className={cn(
        'p-2 align-middle whitespace-nowrap *:[[role=checkbox]]:translate-y-0.5',
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot='table-caption'
      className={cn('mt-4 text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
