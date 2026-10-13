import { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Check, ChevronDown, GitBranch } from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

type BranchPage = { branches: string[]; hasMore: boolean }
export function BranchPicker({
  repositoryId,
  actorId,
  value,
  label = 'Inspect branch',
  id = 'profile-branch',
  disabled,
  onValueChange,
}: {
  repositoryId: string
  actorId?: string
  value: string
  label?: string
  id?: string
  disabled?: boolean
  onValueChange: (branch: string) => void
}) {
  const [open, setOpen] = useState(false)
  const query = useInfiniteQuery({
    queryKey: ['repository-branches', actorId, repositoryId],
    enabled: open && !disabled,
    initialPageParam: 1,
    staleTime: 300_000,
    retry: false,
    queryFn: async ({ pageParam, signal }): Promise<BranchPage> => {
      const response = await fetch(
        `${API_BASE_URL}/github/repositories/${encodeURIComponent(repositoryId)}/profile/branches?page=${pageParam}`,
        { credentials: 'include', signal }
      )
      if (!response.ok)
        throw new Error(
          response.status === 403
            ? 'Repository access changed. Reload the page.'
            : 'Could not load branches. Try again.'
        )
      return response.json() as Promise<BranchPage>
    },
    getNextPageParam: (last, pages) =>
      last.hasMore ? pages.length + 1 : undefined,
  })
  const branches = [
    ...new Set(query.data?.pages.flatMap((page) => page.branches) ?? []),
  ]
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type='button'
          variant='outline'
          size='sm'
          disabled={disabled}
          role='combobox'
          aria-expanded={open}
          aria-label={`${label}: ${value || 'Choose a branch'}`}
          className='w-48 justify-between font-normal'
        >
          <GitBranch className='size-3.5 shrink-0' aria-hidden='true' />
          <span className='min-w-0 flex-1 truncate text-left'>
            {value || 'Choose a branch'}
          </span>
          <ChevronDown
            className='size-3.5 shrink-0 opacity-50'
            aria-hidden='true'
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align='start'
        className='w-72 max-w-[calc(100vw-2rem)] p-0'
      >
        <Command label='Branch selector' loop>
          <CommandInput
            placeholder='Search branches…'
            aria-label='Search branches'
          />
          {query.isPending ? (
            <p role='status' className='p-3 text-sm text-muted-foreground'>
              Loading branches…
            </p>
          ) : query.isError ? (
            <div className='space-y-2 p-3'>
              <p role='alert' className='text-sm'>
                {query.error.message}
              </p>
              <Button
                variant='outline'
                size='sm'
                onClick={() => void query.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : (
            <>
              <CommandList>
                <CommandEmpty>No matching branches.</CommandEmpty>
                <CommandGroup>
                  {branches.map((branch) => (
                    <CommandItem
                      key={branch}
                      value={branch}
                      onSelect={() => {
                        onValueChange(branch)
                        setOpen(false)
                      }}
                    >
                      <span className='min-w-0 flex-1 break-all'>{branch}</span>
                      {branch === value && (
                        <Check className='size-4' aria-hidden='true' />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
              {query.hasNextPage && (
                <div className='border-t p-2'>
                  <p className='mb-2 text-xs text-muted-foreground'>
                    Search filters loaded branches. Load more to see older
                    entries.
                  </p>
                  <Button
                    size='sm'
                    variant='outline'
                    className='w-full'
                    disabled={query.isFetchingNextPage}
                    onClick={() => void query.fetchNextPage()}
                  >
                    {query.isFetchingNextPage
                      ? 'Loading…'
                      : 'Load more branches'}
                  </Button>
                </div>
              )}
            </>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  )
}
