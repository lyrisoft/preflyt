import type { HealthPortfolioData } from '@/features/health/health-api'

export const healthSegments = [
  {
    key: 'HEALTHY',
    label: 'Healthy',
    color: 'var(--success)',
    fill: 'bg-success',
  },
  {
    key: 'NEEDS_ATTENTION',
    label: 'Needs attention',
    color: 'var(--warning)',
    fill: 'bg-warning',
  },
  {
    key: 'UNHEALTHY',
    label: 'Unhealthy',
    color: 'var(--danger)',
    fill: 'bg-danger',
  },
  {
    key: 'INCOMPLETE',
    label: 'Incomplete',
    color: 'var(--warning)',
    fill: 'bg-warning',
  },
  {
    key: 'NOT_ASSESSED',
    label: 'Not assessed',
    color: 'var(--muted-foreground)',
    fill: 'bg-muted-foreground',
  },
  {
    key: 'ACTIVE',
    label: 'Queued or running',
    color: 'var(--info)',
    fill: 'bg-info',
  },
] as const
export type HealthGroup = (typeof healthSegments)[number]['key']
export function repositoryHealthGroup(
  item: HealthPortfolioData['items'][number]
): HealthGroup {
  const status = item.overallHealth?.status
  if (status === 'QUEUED' || status === 'RUNNING') return 'ACTIVE'
  if (healthSegments.some((s) => s.key === status)) return status as HealthGroup
  if (item.state === 'NOT_ASSESSED') return 'NOT_ASSESSED'
  if (item.state === 'QUEUED' || item.state === 'RUNNING') return 'ACTIVE'
  // Completed reports alone never establish a healthy repository.
  return 'INCOMPLETE'
}
export function healthDistribution(data: HealthPortfolioData) {
  return healthSegments.map((segment) => ({
    ...segment,
    value: data.items.filter(
      (item) => repositoryHealthGroup(item) === segment.key
    ).length,
  }))
}
