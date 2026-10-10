import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Mail,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Send,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import { useNavigationSession } from '@/features/workspace/navigation-session'

type Channel = {
  id: string
  type: 'EMAIL'
  name: string
  recipients: string[]
  enabled: boolean
  revision: number
  createdAt: string
  updatedAt: string
  pendingDeliveries: number
  lastDelivery: {
    state: string
    attempts: number
    sentAt: string | null
    createdAt: string
    failureCode: string | null
    kind: string
  } | null
}
type Channels = {
  organizationId: string
  notificationsEnabled: boolean
  emailEnabled: boolean
  emailConfigured: boolean
  canManage: boolean
  items: Channel[]
}
type Draft = { channel: Channel | null; name: string; recipients: string }
type Action =
  | {
      kind: 'save'
      channel: Channel | null
      name: string
      recipients: string[]
    }
  | { kind: 'toggle' | 'remove' | 'test'; channel: Channel }

function recipientsFrom(text: string) {
  return [
    ...new Set(
      text
        .split(/[,;\n]/)
        .map((value) => value.trim())
        .filter(Boolean)
    ),
  ]
}
function validRecipients(recipients: string[]) {
  return (
    recipients.length > 0 &&
    recipients.length <= 20 &&
    recipients.every(
      (value) => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    )
  )
}
async function channelRequest<T>(
  organizationId: string,
  path = '',
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(
    `${API_BASE_URL}/notifications/channels${path}`,
    {
      credentials: 'include',
      cache: 'no-store',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Preflyt-Organization': organizationId,
        ...options.headers,
      },
    }
  )
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[]
    } | null
    const message = Array.isArray(body?.message)
      ? body.message.join(' ')
      : body?.message
    throw new Error(
      message ?? 'Could not update notification channels. Try again.'
    )
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}
function DeliveryStatus({ delivery }: { delivery: Channel['lastDelivery'] }) {
  if (!delivery)
    return (
      <p className='text-xs text-muted-foreground'>No email deliveries yet</p>
    )
  const status = {
    SENT: { label: 'Email sent', tone: 'success' as const },
    PENDING: { label: 'Email queued', tone: 'warning' as const },
    FAILED: { label: 'Email failed', tone: 'error' as const },
    SKIPPED: { label: 'Email skipped', tone: 'neutral' as const },
  }[delivery.state]
  if (!status)
    return (
      <p className='text-xs text-muted-foreground'>
        Last delivery details are unavailable.
      </p>
    )
  const timestamp = delivery.sentAt ?? delivery.createdAt
  const date = new Date(timestamp)
  return (
    <div className='flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground'>
      <span>
        {delivery.kind === 'TEST'
          ? 'Latest test delivery'
          : 'Latest recipient delivery'}
      </span>
      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      {Number.isFinite(date.getTime()) && (
        <time dateTime={timestamp}>{date.toLocaleString()}</time>
      )}
      {delivery.attempts > 0 && (
        <span>
          {delivery.attempts} {delivery.attempts === 1 ? 'attempt' : 'attempts'}
        </span>
      )}
      {delivery.state === 'FAILED' && (
        <span>
          Review your recipients or ask your deployment administrator to check
          email delivery.
        </span>
      )}
    </div>
  )
}

export function OrganizationNotificationChannels() {
  const session = useNavigationSession()
  const organizationId = session.data?.organizationId
  const canManage =
    session.data?.role === 'OWNER' || session.data?.role === 'ADMIN'
  if (!organizationId || !canManage || session.isError) return null
  return (
    <ChannelSettings key={organizationId} organizationId={organizationId} />
  )
}

function ChannelSettings({ organizationId }: { organizationId: string }) {
  const session = useNavigationSession()
  const client = useQueryClient()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [removing, setRemoving] = useState<Channel | null>(null)
  const sessionReady =
    !session.isFetching &&
    !session.isError &&
    session.data?.organizationId === organizationId &&
    (session.data.role === 'OWNER' || session.data.role === 'ADMIN')
  const key = ['organization-notification-channels', organizationId]
  const channels = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      channelRequest<Channels>(organizationId, '', { signal }),
    enabled: sessionReady,
    // Manual refresh owns its toast; polling failures stay visible in this section.
    meta: { silent: true },
    retry: false,
    gcTime: 0,
    refetchInterval: (query) =>
      query.state.data?.items.some((channel) => channel.pendingDeliveries > 0)
        ? 5000
        : false,
  })
  const data =
    sessionReady && channels.data?.organizationId === organizationId
      ? channels.data
      : undefined
  const action = useMutation({
    mutationFn: async (request: Action) => {
      if (!sessionReady)
        throw new Error(
          'Your organization changed. Reopen notification channels and try again.'
        )
      if (request.kind === 'save') {
        const channel = request.channel
        return channelRequest<{ queued?: number }>(
          organizationId,
          channel ? `/${encodeURIComponent(channel.id)}` : '',
          {
            method: channel ? 'PATCH' : 'POST',
            body: JSON.stringify(
              channel
                ? {
                    expectedRevision: channel.revision,
                    name: request.name,
                    recipients: request.recipients,
                  }
                : {
                    type: 'EMAIL',
                    name: request.name,
                    recipients: request.recipients,
                    enabled: true,
                  }
            ),
          }
        )
      }
      return channelRequest<{ queued?: number }>(
        organizationId,
        `/${encodeURIComponent(request.channel.id)}${request.kind === 'test' ? '/test' : ''}`,
        {
          method:
            request.kind === 'remove'
              ? 'DELETE'
              : request.kind === 'test'
                ? 'POST'
                : 'PATCH',
          body: JSON.stringify({
            expectedRevision: request.channel.revision,
            ...(request.kind === 'toggle'
              ? { enabled: !request.channel.enabled }
              : {}),
          }),
        }
      )
    },
    onSuccess: async (result, request) => {
      if (request.kind === 'save') setDraft(null)
      if (request.kind === 'remove') setRemoving(null)
      if (request.kind === 'test') {
        if (result?.queued) toast.success('Test email queued')
        else toast.info('No test email was queued')
      } else {
        toast.success(
          request.kind === 'remove'
            ? 'Channel removed'
            : request.kind === 'toggle'
              ? request.channel.enabled
                ? 'Channel paused'
                : 'Channel enabled'
              : 'Channel saved'
        )
      }
      await client.invalidateQueries({ queryKey: key })
    },
    onError: (error) => {
      toast.error(error.message)
      void client.invalidateQueries({ queryKey: key })
    },
  })
  const editable =
    !!data?.canManage &&
    !channels.isFetching &&
    !channels.isError &&
    !action.isPending
  const recipients = recipientsFrom(draft?.recipients ?? '')
  const valid =
    !!draft?.name.trim() &&
    draft.name.trim().length <= 80 &&
    validRecipients(recipients)
  const refresh = async () => {
    const result = await channels.refetch()
    if (result.isError)
      toast.error(result.error.message, {
        id: `channel-refresh:${organizationId}`,
      })
  }
  const openDraft = (channel: Channel | null) => {
    action.reset()
    setDraft({
      channel,
      name: channel?.name ?? '',
      recipients: channel?.recipients.join('\n') ?? '',
    })
  }
  return (
    <section
      aria-labelledby='organization-channel-heading'
      className='space-y-4'
    >
      <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
        <div className='flex min-w-0 items-start gap-3 sm:flex-1'>
          <SurfaceIcon icon={Mail} tone='teal' />
          <div className='min-w-0'>
            <h2
              id='organization-channel-heading'
              className='text-base font-semibold'
            >
              Notification channels
            </h2>
            <p className='mt-1 max-w-xl text-sm leading-6 text-muted-foreground'>
              Send organization updates to shared email addresses across your
              connected repositories.
            </p>
          </div>
        </div>
        <div className='flex shrink-0 flex-wrap gap-2 sm:justify-end'>
          <Button
            variant='outline'
            size='sm'
            aria-label='Refresh notification channels'
            disabled={channels.isFetching || !sessionReady}
            onClick={() => void refresh()}
          >
            <RefreshCw className='size-4' />
            Refresh
          </Button>
          <Button
            size='sm'
            disabled={!editable || (data?.items.length ?? 0) >= 10}
            onClick={() => openDraft(null)}
          >
            <Plus className='size-4' />
            Add email channel
          </Button>
        </div>
      </div>
      {channels.isPending || !sessionReady ? (
        <p role='status' className='text-sm text-muted-foreground'>
          Loading notification channels…
        </p>
      ) : channels.isError ? (
        <div
          role='alert'
          className='rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm'
        >
          <p className='text-destructive'>{channels.error.message}</p>
          {channels.data && (
            <p className='mt-1 text-muted-foreground'>
              Channel details may be out of date. Retry before making changes.
            </p>
          )}
          <Button
            variant='outline'
            size='sm'
            className='mt-3'
            onClick={() => void refresh()}
          >
            Try again
          </Button>
        </div>
      ) : !data ? (
        <p role='alert' className='text-sm text-destructive'>
          Notification channels are unavailable for this organization. Refresh
          and try again.
        </p>
      ) : (
        <>
          {!data.notificationsEnabled ||
          !data.emailEnabled ||
          !data.emailConfigured ? (
            <div
              role='status'
              className='rounded-xl border bg-muted/30 px-4 py-3 text-sm leading-6'
            >
              <p className='font-medium'>Email delivery is not ready</p>
              <p className='text-muted-foreground'>
                You can save channels now. Your deployment administrator must
                enable notifications and email delivery and configure SMTP
                before emails can be sent.
              </p>
            </div>
          ) : null}
          {data.items.length === 0 ? (
            <Card className='gap-3 px-5 py-6 sm:px-6'>
              <h3 className='text-sm font-semibold'>
                Keep your team in the loop
              </h3>
              <p className='max-w-xl text-sm leading-6 text-muted-foreground'>
                Add a named email group such as Engineering alerts. Organization
                channels use the recipients you provide, independently of your
                sign-in email.
              </p>
            </Card>
          ) : (
            <div className='space-y-3'>
              {data.items.map((channel) => (
                <Card key={channel.id} className='gap-4 overflow-hidden py-0'>
                  <CardHeader className='flex flex-row items-start justify-between gap-3 px-4 pt-5 sm:px-5'>
                    <div className='flex min-w-0 items-start gap-3'>
                      <SurfaceIcon icon={Mail} tone='teal' />
                      <div className='min-w-0'>
                        <h3 className='text-sm font-semibold break-words'>
                          {channel.name}
                        </h3>
                        <p className='mt-1 text-xs text-muted-foreground'>
                          Email · {channel.recipients.length}{' '}
                          {channel.recipients.length === 1
                            ? 'recipient'
                            : 'recipients'}
                        </p>
                      </div>
                    </div>
                    <StatusBadge tone={channel.enabled ? 'success' : 'neutral'}>
                      {channel.enabled ? 'Active' : 'Disabled'}
                    </StatusBadge>
                  </CardHeader>
                  <CardContent className='space-y-4 px-4 sm:px-5'>
                    <ul
                      aria-label={`${channel.name} recipients`}
                      className='flex flex-wrap gap-x-4 gap-y-1 text-sm'
                    >
                      {channel.recipients.map((email) => (
                        <li key={email} className='break-all'>
                          {email}
                        </li>
                      ))}
                    </ul>
                    {channel.pendingDeliveries > 0 && (
                      <p className='text-xs text-muted-foreground'>
                        {channel.pendingDeliveries}{' '}
                        {channel.pendingDeliveries === 1 ? 'email' : 'emails'}{' '}
                        queued
                      </p>
                    )}
                    <DeliveryStatus delivery={channel.lastDelivery} />
                  </CardContent>
                  <CardFooter className='flex flex-wrap justify-end gap-2 border-t bg-muted/20 px-4 py-3 sm:px-5'>
                    <Button
                      variant='outline'
                      size='sm'
                      disabled={!editable}
                      aria-label={`Edit ${channel.name}`}
                      onClick={() => openDraft(channel)}
                    >
                      <Pencil className='size-4' />
                      Edit
                    </Button>
                    <Button
                      variant='outline'
                      size='sm'
                      disabled={
                        !editable ||
                        !channel.enabled ||
                        !data.notificationsEnabled ||
                        !data.emailEnabled ||
                        !data.emailConfigured ||
                        channel.pendingDeliveries > 0
                      }
                      aria-label={`Send test to ${channel.name}`}
                      onClick={() => action.mutate({ kind: 'test', channel })}
                    >
                      <Send className='size-4' />
                      Send test
                    </Button>
                    <Button
                      variant='outline'
                      size='sm'
                      disabled={!editable}
                      aria-label={`${channel.enabled ? 'Pause' : 'Enable'} ${channel.name}`}
                      onClick={() => action.mutate({ kind: 'toggle', channel })}
                    >
                      {channel.enabled ? (
                        <Pause className='size-4' />
                      ) : (
                        <Play className='size-4' />
                      )}
                      {channel.enabled ? 'Pause' : 'Enable'}
                    </Button>
                    <Button
                      variant='destructive'
                      size='sm'
                      disabled={!editable}
                      aria-label={`Remove ${channel.name}`}
                      onClick={() => {
                        action.reset()
                        setRemoving(channel)
                      }}
                    >
                      <Trash2 className='size-4' />
                      Remove
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
          <p className='text-xs leading-5 text-muted-foreground'>
            {data.items.length} of 10 channels. Up to 20 recipients per channel.
            Emails link to Preflyt; repository access is still required.
          </p>
          {action.isError && !draft && !removing && (
            <p role='alert' className='text-sm text-destructive'>
              {action.error.message}
            </p>
          )}
        </>
      )}
      <Dialog
        open={!!draft && sessionReady}
        onOpenChange={(open) => {
          if (!open && !action.isPending) setDraft(null)
        }}
      >
        <DialogContent
          className='max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-[560px]'
          showCloseButton={!action.isPending}
        >
          <DialogHeader className='text-left'>
            <DialogTitle>
              {draft?.channel ? 'Edit email channel' : 'Add email channel'}
            </DialogTitle>
            <DialogDescription>
              Organization-wide notifications go to these recipients. Personal
              notification settings are separate.
            </DialogDescription>
          </DialogHeader>
          <form
            className='space-y-6'
            onSubmit={(event) => {
              event.preventDefault()
              if (draft && valid && editable)
                action.mutate({
                  kind: 'save',
                  channel: draft.channel,
                  name: draft.name.trim(),
                  recipients,
                })
            }}
          >
            <div className='space-y-2'>
              <Label htmlFor='notification-channel-name'>Channel name</Label>
              <Input
                id='notification-channel-name'
                placeholder='Engineering alerts'
                maxLength={80}
                value={draft?.name ?? ''}
                disabled={action.isPending}
                required
                onChange={(event) =>
                  setDraft(
                    (current) =>
                      current && { ...current, name: event.target.value }
                  )
                }
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='notification-channel-recipients'>
                Email recipients
              </Label>
              <Textarea
                id='notification-channel-recipients'
                placeholder={'engineering@example.com\nsecurity@example.com'}
                rows={4}
                value={draft?.recipients ?? ''}
                disabled={action.isPending}
                required
                aria-describedby='notification-recipients-help'
                aria-invalid={
                  !!draft?.recipients.trim() && !validRecipients(recipients)
                }
                onChange={(event) =>
                  setDraft(
                    (current) =>
                      current && { ...current, recipients: event.target.value }
                  )
                }
              />
              <p
                id='notification-recipients-help'
                className='text-xs leading-5 text-muted-foreground'
              >
                Enter up to 20 addresses, separated by commas or new lines.
              </p>
              {!!draft?.recipients.trim() && !validRecipients(recipients) && (
                <p role='alert' className='text-xs text-destructive'>
                  Enter 1 to 20 valid email addresses.
                </p>
              )}
            </div>
            {action.isError && (
              <p role='alert' className='text-sm text-destructive'>
                {action.error.message}
              </p>
            )}
            <DialogFooter className='flex-row flex-wrap justify-end border-t pt-4'>
              <Button
                type='button'
                size='sm'
                variant='outline'
                disabled={action.isPending}
                onClick={() => setDraft(null)}
              >
                Cancel
              </Button>
              <Button size='sm' disabled={!valid || !editable}>
                {action.isPending ? 'Saving…' : 'Save channel'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!removing && sessionReady}
        onOpenChange={(open) => {
          if (!open && !action.isPending) setRemoving(null)
        }}
      >
        <DialogContent showCloseButton={!action.isPending}>
          <DialogHeader className='text-left'>
            <DialogTitle>Remove email channel?</DialogTitle>
            <DialogDescription>
              Stop future organization emails to {removing?.name}. Your personal
              preferences and in-app notifications stay unchanged.
            </DialogDescription>
          </DialogHeader>
          {action.isError && (
            <p role='alert' className='text-sm text-destructive'>
              {action.error.message}
            </p>
          )}
          <DialogFooter className='flex-row flex-wrap justify-end'>
            <Button
              size='sm'
              variant='outline'
              disabled={action.isPending}
              onClick={() => setRemoving(null)}
            >
              Cancel
            </Button>
            <Button
              size='sm'
              variant='destructive'
              disabled={!editable}
              onClick={() =>
                removing && action.mutate({ kind: 'remove', channel: removing })
              }
            >
              {action.isPending ? 'Removing…' : 'Remove channel'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
