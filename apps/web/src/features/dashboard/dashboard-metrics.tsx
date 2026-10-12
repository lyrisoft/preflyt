import { BookOpen, GitBranch, GitPullRequest, ListChecks } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SurfaceIcon } from '@/components/surface-icon'
import type { DashboardData } from './dashboard-types'

export function DashboardMetrics({
  metrics,
}: {
  metrics: DashboardData['metrics']
}) {
  const stats = [
    {
      label: 'Repositories',
      value: metrics.repositories.toLocaleString(),
      icon: GitBranch,
    },
    {
      label: 'PRs assessed',
      value: metrics.prsAssessed.toLocaleString(),
      icon: GitPullRequest,
    },
    {
      label: 'Saved assessments',
      value: metrics.snapshots.toLocaleString(),
      icon: ListChecks,
    },
    {
      label: 'Standards adopted',
      value: `${metrics.standardsAdopted} / ${metrics.repositories}`,
      icon: BookOpen,
    },
  ]
  return (
    <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium'>{stat.label}</CardTitle>
            <SurfaceIcon
              icon={stat.icon}
              tone={
                stat.icon === BookOpen
                  ? 'teal'
                  : stat.icon === ListChecks
                    ? 'violet'
                    : 'blue'
              }
            />
          </CardHeader>
          <CardContent>
            <p className='text-3xl font-semibold tracking-tight tabular-nums'>
              {stat.value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
