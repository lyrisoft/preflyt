import { Link, type LinkProps } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type Crumb = { label: string } & Partial<Pick<LinkProps, 'to' | 'params'>>

/** Location in the app bar; the last crumb is the current page. */
export function AppBreadcrumbs({
  items,
  className,
}: {
  items: Crumb[]
  className?: string
}) {
  return (
    <nav aria-label='Breadcrumb' className={cn('min-w-0', className)}>
      <ol className='flex min-w-0 items-center gap-1.5 text-sm'>
        {items.map((item, index) => {
          const last = index === items.length - 1
          return (
            <li key={item.label} className='flex min-w-0 items-center gap-1.5'>
              {index > 0 && (
                <ChevronRight
                  aria-hidden='true'
                  className='size-3.5 shrink-0 text-muted-foreground'
                />
              )}
              {last || !item.to ? (
                <span
                  aria-current={last ? 'page' : undefined}
                  className={cn(
                    'truncate',
                    last ? 'font-medium' : 'text-muted-foreground'
                  )}
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  to={item.to}
                  params={item.params}
                  className='shrink-0 text-muted-foreground transition-colors hover:text-foreground'
                >
                  {item.label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
