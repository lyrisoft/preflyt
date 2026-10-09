import { useState } from 'react'
import { ArrowUpRight, Workflow } from 'lucide-react'
import { IconGithub } from '@/assets/brand-icons'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { StatusBadge } from '@/components/status-badge'

export type IntegrationId = 'github' | 'ci'
export function IntegrationCatalogue({
  connected,
  selected,
  onSelect,
}: {
  connected: boolean
  selected: IntegrationId | null
  onSelect: (id: IntegrationId) => void
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const integrations = [
    {
      id: 'github' as const,
      name: 'GitHub',
      description: 'Connect your GitHub App and manage repository access.',
      icon: IconGithub,
      status: connected ? 'Connected' : 'Not connected',
      tone: connected ? ('success' as const) : ('neutral' as const),
      color: 'bg-chart-1/10 text-chart-1',
    },
    {
      id: 'ci' as const,
      name: 'CI evidence',
      description:
        'Import check results and workflow runs for your repositories.',
      icon: Workflow,
      status: 'Available',
      tone: 'info' as const,
      color: 'bg-chart-2/10 text-chart-2',
    },
  ]
  const visible = integrations.filter(
    (item) =>
      `${item.name} ${item.description}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()) &&
      (filter === 'all' ||
        (filter === 'connected'
          ? item.status === 'Connected'
          : filter === 'disconnected'
            ? item.status === 'Not connected'
            : item.status === 'Available'))
  )
  return (
    <section aria-label='Integration catalogue' className='space-y-4'>
      <div className='flex flex-wrap gap-3 border-b pb-4'>
        <Input
          aria-label='Search integrations'
          placeholder='Search integrations…'
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className='w-full sm:w-72'
        />
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger
            aria-label='Filter integrations by status'
            className='w-44'
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All integrations</SelectItem>
            <SelectItem value='connected'>Connected</SelectItem>
            <SelectItem value='disconnected'>Not connected</SelectItem>
            <SelectItem value='available'>Available</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
        {visible.map((item) => (
          <button
            key={item.id}
            type='button'
            aria-pressed={selected === item.id}
            onClick={() => onSelect(item.id)}
            className={cn(
              'group flex min-h-48 flex-col rounded-xl border bg-card p-5 text-left transition-[border-color,box-shadow] duration-150 hover:border-primary/40 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none motion-reduce:transition-none',
              selected === item.id && 'border-primary/50 bg-primary/5'
            )}
          >
            <span className='mb-7 flex items-center justify-between gap-3'>
              <span
                className={cn(
                  'flex size-11 shrink-0 items-center justify-center rounded-xl',
                  item.color
                )}
              >
                <item.icon className='size-5' aria-hidden='true' />
              </span>
              <StatusBadge tone={item.tone}>{item.status}</StatusBadge>
            </span>
            <span className='flex items-center justify-between gap-3 text-base font-semibold'>
              {item.name}
              <ArrowUpRight
                className='size-4 text-muted-foreground group-hover:text-primary'
                aria-hidden='true'
              />
            </span>
            <span className='mt-2 text-sm leading-relaxed text-muted-foreground'>
              {item.description}
            </span>
            <span className='mt-4 text-xs font-medium text-primary'>
              {item.id === 'github'
                ? connected
                  ? 'Manage connection'
                  : 'Set up connection'
                : 'View imports'}
            </span>
          </button>
        ))}
      </div>
      {visible.length === 0 && (
        <p
          role='status'
          className='rounded-xl border p-8 text-center text-sm text-muted-foreground'
        >
          No integrations match your search.
        </p>
      )}
    </section>
  )
}
