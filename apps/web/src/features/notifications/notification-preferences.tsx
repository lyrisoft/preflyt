import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Switch } from '@/components/ui/switch'
import { useNavigationSession } from '@/features/workspace/navigation-session'
import { notificationRequest } from './notification-query'

export function NotificationPreferences() {
  const session = useNavigationSession()
  const client = useQueryClient()
  const key = [
    'notification-preferences',
    session.data?.identityId,
    session.data?.organizationId,
  ]
  const preference = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      notificationRequest<{ assessments: boolean }>('/preferences', signal),
    enabled: !!session.data?.identityId,
    gcTime: 0,
    retry: false,
  })
  const save = useMutation({
    mutationFn: async (assessments: boolean) => {
      const { API_BASE_URL } = await import('@/lib/api')
      const response = await fetch(
        `${API_BASE_URL}/notifications/preferences`,
        {
          credentials: 'include',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assessments }),
        }
      )
      if (!response.ok)
        throw new Error('Could not save notification preferences. Try again.')
    },
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  })
  return (
    <section className='flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4'>
      <div>
        <label
          htmlFor='assessment-notifications'
          className='text-sm font-medium'
        >
          Assessment notifications
        </label>
        <p className='mt-1 text-xs text-muted-foreground'>
          Receive new in-app updates for your assessments and repositories you
          lead. Existing notifications stay in your inbox.
        </p>
        {(save.isError || preference.isError) && (
          <p role='alert' className='mt-2 text-xs text-destructive'>
            Could not load or save preferences. Try again.
          </p>
        )}
      </div>
      <Switch
        id='assessment-notifications'
        checked={preference.data?.assessments ?? true}
        disabled={!preference.data || save.isPending}
        onCheckedChange={(v) => save.mutate(v)}
      />
    </section>
  )
}
