import { useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
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

export function NotificationRepositoryFilter({
  value,
  repositories,
  onChange,
}: {
  value: string
  repositories: { repositoryGithubId: string; repositoryName: string }[]
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const options = [
    { repositoryGithubId: '', repositoryName: 'All repositories' },
    ...repositories,
  ]
  return (
    <div className='space-y-1'>
      <span className='text-xs text-muted-foreground'>Repository</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant='outline'
            role='combobox'
            aria-label='Filter notifications by repository'
            aria-expanded={open}
            className='flex max-w-64 justify-between gap-3 font-normal'
          >
            <span className='truncate'>
              {options.find((o) => o.repositoryGithubId === value)
                ?.repositoryName ?? 'Selected repository'}
            </span>
            <ChevronsUpDown className='size-4 shrink-0 opacity-50' />
          </Button>
        </PopoverTrigger>
        <PopoverContent className='w-80 p-0'>
          <Command>
            <CommandInput placeholder='Search repositories…' />
            <CommandList>
              <CommandEmpty>No repositories found.</CommandEmpty>
              <CommandGroup>
                {options.map((o) => (
                  <CommandItem
                    key={o.repositoryGithubId}
                    value={o.repositoryName}
                    onSelect={() => {
                      onChange(o.repositoryGithubId)
                      setOpen(false)
                    }}
                  >
                    <span className='truncate'>{o.repositoryName}</span>
                    {o.repositoryGithubId === value && (
                      <Check className='ms-auto size-4' />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
