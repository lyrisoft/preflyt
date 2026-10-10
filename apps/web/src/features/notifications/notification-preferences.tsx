import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Mail } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { SurfaceIcon } from '@/components/surface-icon'
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
      notificationRequest<{
        assessments: boolean
        email: boolean
        emailEnabled: boolean
        emailAddressAvailable: boolean
      }>('/preferences', signal),
    enabled: !!session.data?.identityId,
    gcTime: 0,
    retry: false,
  })
  const save = useMutation({
    meta: { successMessage: 'Notification preferences saved' },
    mutationFn: async (updates: { assessments: boolean; email: boolean }) => {
      const { API_BASE_URL } = await import('@/lib/api')
      const response = await fetch(
        `${API_BASE_URL}/notifications/preferences`,
        {
          credentials: 'include',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        }
      )
      if (!response.ok)
        throw new Error('Could not save notification preferences. Try again.')
    },
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  })
  return (
    <section className='overflow-hidden rounded-xl border bg-card shadow-xs'>
      <div className='flex items-center gap-3 border-b bg-muted/20 px-6 py-5'>
        <SurfaceIcon icon={Bell} tone='teal' />
        <h2 className='text-base font-semibold'>Notifications</h2>
      </div>
      <div className='flex items-start justify-between gap-6 px-6 py-5'>
        <div>
          <label
            htmlFor='assessment-notifications'
            className='text-sm font-semibold'
          >
            Assessment notifications
          </label>
          <p className='mt-2 max-w-xl text-sm leading-6 text-muted-foreground'>
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
          className='mt-1 shrink-0'
          checked={preference.data?.assessments ?? true}
          disabled={!preference.data || save.isPending}
          onCheckedChange={(v) =>
            save.mutate({
              assessments: v,
              email: preference.data?.email ?? false,
            })
          }
        />
      </div>
      <div className='flex items-start justify-between gap-6 border-t px-6 py-5'>
        <div>
          <label
            htmlFor='email-notifications'
            className='flex items-center gap-2 text-sm font-semibold'
          >
            <Mail className='size-4 text-muted-foreground' />
            Email notifications
          </label>
          <p className='mt-2 max-w-xl text-sm leading-6 text-muted-foreground'>
            {!preference.data?.emailEnabled
              ? 'Email delivery is not enabled for this deployment.'
              : !preference.data.emailAddressAvailable
                ? 'Your sign-in account does not provide an email address. In-app notifications still work.'
                : 'Receive a short email linking to your inbox. Repository and report details stay in Preflyt.'}
          </p>
        </div>
        <Switch
          id='email-notifications'
          className='mt-1 shrink-0'
          checked={preference.data?.email ?? false}
          disabled={
            !preference.data?.emailEnabled ||
            !preference.data.emailAddressAvailable ||
            save.isPending
          }
          onCheckedChange={(v) =>
            save.mutate({
              assessments: preference.data?.assessments ?? true,
              email: v,
            })
          }
        />
      </div>
      <p className='border-t bg-muted/20 px-6 py-4 text-xs leading-5 text-muted-foreground'>
        Security, policy and AI configuration notices stay in your in-app inbox
        even when assessment alerts are turned off.
      </p>
    </section>
  )
}
