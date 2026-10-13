import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { DashboardData } from '@/features/dashboard/dashboard-types'
import { ActivityTrendChart } from './activity-trend-chart'

export function RepositoryActivityPanel({
  repositoryId,
}: {
  repositoryId: string
}) {
  const [days, setDays] = useState('30')
  const query = useQuery({
    queryKey: ['engineering-dashboard', days, repositoryId],
    staleTime: 15_000,
    retry: false,
    queryFn: async ({ signal }): Promise<DashboardData> => {
      const response = await fetch(
        `${API_BASE_URL}/github/dashboard?days=${days}&repository=${encodeURIComponent(repositoryId)}`,
        { credentials: 'include', cache: 'no-store', signal }
      )
      if (!response.ok)
        throw new Error(
          'Assessment activity is unavailable. Check repository access and retry.'
        )
      return response.json() as Promise<DashboardData>
    },
  })
  if (query.isPending)
    return (
      <Skeleton
        role='status'
        aria-label='Loading assessment activity'
        className='h-64 rounded-xl'
      />
    )
  if (query.isError)
    return (
      <Card>
        <CardContent className='flex flex-wrap items-center justify-between gap-3 pt-2'>
          <p role='alert' className='text-sm text-muted-foreground'>
            {query.error.message}
          </p>
          <Button
            variant='outline'
            size='sm'
            onClick={() => void query.refetch()}
          >
            Retry activity
          </Button>
        </CardContent>
      </Card>
    )
  return (
    <ActivityTrendChart
      days={days}
      onDays={setDays}
      from={query.data.period.from}
      to={query.data.period.to}
      activity={query.data.activity}
    />
  )
}
