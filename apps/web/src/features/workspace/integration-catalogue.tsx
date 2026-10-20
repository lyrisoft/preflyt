import { useState } from 'react'
import { ArrowUpRight, Plug } from 'lucide-react'
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

export type IntegrationId = 'github' | 'mcp'
export function IntegrationCatalogue({
  connected,
  mcpConnected = false,
  selected,
  onSelect,
}: {
  connected: boolean
  mcpConnected?: boolean
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
      id: 'mcp' as const,
      name: 'MCP and coding agents',
      description:
        'Connect Codex, Claude Code or DeepSeek Harness to verify findings and prepare fixes.',
      icon: Plug,
      status: mcpConnected ? 'Connected' : 'Not connected',
      tone: mcpConnected ? ('success' as const) : ('neutral' as const),
      color: 'bg-chart-3/10 text-chart-3',
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
          : item.status === 'Not connected'))
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
              'group flex min-h-36 flex-col rounded-xl border bg-card p-4 text-left transition-[border-color,box-shadow] duration-150 hover:border-primary/40 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none motion-reduce:transition-none',
              selected === item.id && 'border-primary/50 bg-primary/5'
            )}
          >
            <span className='mb-3 flex items-center justify-between gap-3'>
              <span
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-xl border border-current/10',
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
              {item.status === 'Connected'
                ? 'Manage connection'
                : 'Set up connection'}
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
