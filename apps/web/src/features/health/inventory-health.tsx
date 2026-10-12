import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import { healthLabel, healthTone, type HealthPortfolioData } from './health-api'

export type InventoryHealth = {
  items: Map<string, HealthPortfolioData['items'][number]>
  pending: boolean
  failed: boolean
  canRead: (repositoryId: string) => boolean
}

export function InventoryHealthCell({
  repositoryId,
  selected,
  health,
}: {
  repositoryId: string
  selected: boolean
  health?: InventoryHealth
}) {
  if (!selected)
    return (
      <span className='text-xs text-muted-foreground'>Select to assess</span>
    )
  if (!health?.canRead(repositoryId))
    return <span className='text-xs text-muted-foreground'>No access</span>
  if (health.pending)
    return (
      <span role='status' className='text-xs text-muted-foreground'>
        Loading health…
      </span>
    )
  if (health.failed)
    return <span className='text-xs text-muted-foreground'>Unavailable</span>
  const item = health.items.get(repositoryId)
  if (!item)
    return <span className='text-xs text-muted-foreground'>Not loaded</span>
  const status =
    item.overallHealth?.status ??
    (item.state === 'COMPLETED' &&
    item.result === 'PASS' &&
    item.completeness === 'COMPLETE' &&
    item.mode === 'EXECUTED' &&
    item.findings === 0
      ? 'HEALTHY'
      : item.state === 'COMPLETED' &&
          item.completeness === 'COMPLETE' &&
          item.result === 'FAIL'
        ? 'FINDINGS_REPORTED'
        : item.state === 'COMPLETED' && item.completeness
          ? item.result === 'INCOMPLETE'
            ? 'PARTIAL'
            : item.completeness
          : item.state)
  return (
    <div className='min-w-40 space-y-1.5'>
      <div className='flex flex-wrap items-center gap-1'>
        <StatusBadge
          tone={status === 'COMPLETED' ? 'neutral' : healthTone(status)}
        >
          {status === 'INCOMPLETE' ? (
            <span>{healthLabel(status)}</span>
          ) : (
            healthLabel(status)
          )}
        </StatusBadge>
        {item.id && item.freshness === 'STALE' && (
          <StatusBadge tone={healthTone('STALE')}>Stale</StatusBadge>
        )}
      </div>
      {item.mode === 'INSPECTION_ONLY' && (
        <p className='text-xs text-muted-foreground'>Inspection only</p>
      )}
    </div>
  )
}

export function InventoryHealthAction({
  repositoryId,
  name,
  selected,
  health,
}: {
  repositoryId: string
  name: string
  selected: boolean
  health?: InventoryHealth
}) {
  if (
    !selected ||
    !health?.canRead(repositoryId) ||
    health.pending ||
    health.failed
  )
    return null
  const item = health.items.get(repositoryId)
  if (!item) return null

  return (
    <Button asChild variant='outline' size='sm'>
      <Link
        to='/repositories/$repositoryId'
        params={{ repositoryId }}
        search={{ tab: 'health', health: item.id ?? undefined }}
        aria-label={`${item.id ? 'View report' : 'Open Health'} for ${name}`}
      >
        {item.id ? 'View report' : 'Open Health'}
      </Link>
    </Button>
  )
}
