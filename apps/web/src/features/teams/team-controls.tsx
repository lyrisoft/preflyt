import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function Paging({
  page,
  total,
  size = 10,
  onChange,
}: {
  page: number
  total: number
  size?: number
  onChange: (p: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / size))
  if (pages === 1) return null
  return (
    <div className='flex items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground'>
      <span>
        {total} results · Page {page} of {pages}
      </span>
      <div className='flex gap-2'>
        <Button
          size='sm'
          variant='outline'
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          size='sm'
          variant='outline'
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
export function PickList({
  label,
  items,
  selected,
  onChange,
  disabled = false,
}: {
  label: string
  items: { id: string; name: string }[]
  selected: string[]
  disabled?: boolean
  onChange: (ids: string[]) => void
}) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const filtered = items.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase())
  )
  return (
    <section className='space-y-3'>
      <h3 className='text-sm font-semibold'>
        {label}{' '}
        <span className='font-normal text-muted-foreground'>
          ({selected.length} selected)
        </span>
      </h3>
      <Input
        aria-label={`Filter ${label.toLowerCase()}`}
        placeholder={`Filter ${label.toLowerCase()}…`}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value)
          setPage(1)
        }}
      />
      <div className='rounded-lg border'>
        {filtered.slice((page - 1) * 10, page * 10).map((i) => (
          <label
            key={i.id}
            className='flex min-h-10 cursor-pointer items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0'
          >
            <input
              type='checkbox'
              disabled={disabled}
              checked={selected.includes(i.id)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...selected, i.id]
                    : selected.filter((id) => id !== i.id)
                )
              }
            />
            <span className='min-w-0 break-words'>{i.name}</span>
          </label>
        ))}
        {!filtered.length && (
          <p className='p-3 text-sm text-muted-foreground'>
            No matching {label.toLowerCase()}.
          </p>
        )}
      </div>
      <Paging page={page} total={filtered.length} onChange={setPage} />
    </section>
  )
}
