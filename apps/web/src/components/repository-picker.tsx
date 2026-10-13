import { useId, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
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

type RepositoryPickerProps = {
  repositories: readonly { githubId: string; fullName: string }[]
  value: string
  onValueChange: (value: string) => void
  allowAll?: boolean
  'aria-label'?: string
  'aria-labelledby'?: string
  className?: string
}

export function RepositoryPicker({
  repositories,
  value,
  onValueChange,
  allowAll = false,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  className,
}: RepositoryPickerProps) {
  const [open, setOpen] = useState(false)
  const valueId = useId()
  const selectedLabel =
    allowAll && value === 'all'
      ? 'All repositories'
      : repositories.find((repository) => repository.githubId === value)
          ?.fullName
  const choose = (nextValue: string) => {
    setOpen(false)
    onValueChange(nextValue)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type='button'
          variant='outline'
          aria-label={
            ariaLabel
              ? `${ariaLabel}: ${selectedLabel ?? 'Select a repository'}`
              : undefined
          }
          aria-labelledby={
            ariaLabelledBy ? `${ariaLabelledBy} ${valueId}` : undefined
          }
          className={cn(
            'w-52 justify-between px-3 font-normal transition-[color,box-shadow]',
            !selectedLabel && 'text-muted-foreground',
            className
          )}
        >
          <span id={valueId} className='min-w-0 truncate' title={selectedLabel}>
            {selectedLabel ?? 'Select a repository'}
          </span>
          <ChevronDown aria-hidden='true' className='size-4 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align='start'
        aria-label='Choose a repository'
        collisionPadding={8}
        className='flex max-h-(--radix-popover-content-available-height) w-(--radix-popover-trigger-width) max-w-(--radix-popover-content-available-width) min-w-60 overflow-hidden p-0'
      >
        <Command defaultValue={value} label='Repository selector' loop>
          <CommandInput
            aria-label='Search repositories'
            placeholder='Search repositories…'
          />
          <CommandList aria-label='Repositories'>
            <CommandEmpty>No matching repositories.</CommandEmpty>
            <CommandGroup>
              {allowAll && (
                <CommandItem
                  value='all'
                  keywords={['All repositories']}
                  onSelect={() => choose('all')}
                  className='min-h-9'
                >
                  <span className='min-w-0 flex-1'>All repositories</span>
                  {value === 'all' && (
                    <>
                      <Check aria-hidden='true' className='size-4' />
                      <span className='sr-only'>Selected</span>
                    </>
                  )}
                </CommandItem>
              )}
              {repositories.map((repository) => (
                <CommandItem
                  key={repository.githubId}
                  value={repository.githubId}
                  keywords={[repository.fullName]}
                  onSelect={() => choose(repository.githubId)}
                  className='min-h-9'
                >
                  <span className='min-w-0 flex-1 break-all'>
                    {repository.fullName}
                  </span>
                  {value === repository.githubId && (
                    <>
                      <Check aria-hidden='true' className='size-4' />
                      <span className='sr-only'>Selected</span>
                    </>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
