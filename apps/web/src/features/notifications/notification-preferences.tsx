import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Loader2, Mail, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { SurfaceIcon } from '@/components/surface-icon'
import { useNavigationSession } from '@/features/workspace/navigation-session'
import { notificationRequest } from './notification-query'
import { WeeklyHealthPreferences } from './weekly-health-preferences'

async function updateEmail(path: string, body: object = {}) {
  const { API_BASE_URL } = await import('@/lib/api')
  const response = await fetch(
    `${API_BASE_URL}/notifications/email-address${path}`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )
  const result = await response.json().catch(() => ({}))
  if (!response.ok)
    throw new Error(
      typeof result.message === 'string'
        ? result.message
        : 'Could not update your notification email. Try again.'
    )
  return result
}

type NotificationPreference = {
  assessments: boolean
  email: boolean
  emailEnabled: boolean
  emailAddressAvailable: boolean
  emailAddress: string | null
  personalEmail: string | null
  pendingEmail: string | null
  verificationExpiresAt: string | null
  verificationRequestedAt: string | null
  verificationDeliveryState: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED' | null
}

export function NotificationPreferences() {
  const session = useNavigationSession()
  const client = useQueryClient()
  const [emailDraft, setEmailDraft] = useState<string>()
  const [code, setCode] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [emailDialogOpen, setEmailDialogOpen] = useState(false)
  const [emailStep, setEmailStep] = useState<'address' | 'verify'>('address')
  const emailInput = useRef<HTMLInputElement>(null)
  const codeInput = useRef<HTMLInputElement>(null)
  const emailAction = useRef<HTMLButtonElement>(null)
  const dialogTrigger = useRef<HTMLElement | null>(null)
  const key = [
    'notification-preferences',
    session.data?.identityId,
    session.data?.organizationId,
  ]
  const preference = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      notificationRequest<NotificationPreference>('/preferences', signal),
    enabled: !!session.data?.identityId && !!session.data?.organizationId,
    meta: { silent: true },
    gcTime: 0,
    retry: false,
    refetchInterval: (query) =>
      emailDialogOpen &&
      emailStep === 'verify' &&
      query.state.data?.verificationDeliveryState === 'PENDING' &&
      Date.parse(query.state.data.verificationExpiresAt ?? '') > Date.now()
        ? 3000
        : false,
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
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: key }),
      client.invalidateQueries({
        queryKey: [
          'weekly-health-preferences',
          session.data?.identityId,
          session.data?.organizationId,
        ],
      }),
    ])
  const requestEmail = useMutation({
    meta: { successMessage: 'Verification email queued' },
    mutationFn: (email: string) => updateEmail('', { email }),
    onSuccess: (result) => {
      client.setQueryData<NotificationPreference>(key, (current) =>
        current
          ? {
              ...current,
              pendingEmail: result.pendingEmail,
              verificationExpiresAt: result.verificationExpiresAt,
              verificationRequestedAt: result.verificationRequestedAt,
              verificationDeliveryState: 'PENDING',
            }
          : current
      )
      setNow(Date.now())
      setCode('')
      setEmailStep('verify')
      void refresh()
    },
  })
  const verifyEmail = useMutation({
    meta: {
      successMessage: 'Email verified. Personal email notifications enabled.',
    },
    mutationFn: () => updateEmail('/verify', { code }),
    onSuccess: async () => {
      await refresh()
      setCode('')
      setEmailDraft(undefined)
      setEmailDialogOpen(false)
    },
  })
  const removeEmail = useMutation({
    meta: {
      successMessage:
        'Notification email removed. Personal alerts and weekly emails turned off.',
    },
    mutationFn: () => updateEmail('/remove'),
    onSuccess: async () => {
      await refresh()
      setCode('')
      setEmailDraft(undefined)
      setEmailDialogOpen(false)
    },
  })
  const emailValue =
    emailDraft ??
    preference.data?.pendingEmail ??
    preference.data?.personalEmail ??
    preference.data?.emailAddress ??
    ''
  const emailBusy =
    requestEmail.isPending || verifyEmail.isPending || removeEmail.isPending
  const emailError =
    requestEmail.error ?? verifyEmail.error ?? removeEmail.error
  const hasAddress = !!preference.data?.emailAddress
  const hasPendingCode =
    !!preference.data?.pendingEmail && !!preference.data.verificationExpiresAt
  const resendSeconds = Math.max(
    0,
    Math.ceil(
      ((Date.parse(preference.data?.verificationRequestedAt ?? '') || 0) +
        60000 -
        now) /
        1000
    )
  )
  const deliveryState = preference.data?.verificationDeliveryState
  const codeExpired =
    !!preference.data?.verificationExpiresAt &&
    Date.parse(preference.data.verificationExpiresAt) <= now
  useEffect(() => {
    if (!emailDialogOpen || emailStep !== 'verify') return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [emailDialogOpen, emailStep])
  const codeDestination =
    preference.data?.pendingEmail ?? requestEmail.variables ?? emailValue
  function openEmailDialog(step: 'address' | 'verify') {
    setNow(Date.now())
    dialogTrigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    requestEmail.reset()
    verifyEmail.reset()
    removeEmail.reset()
    setEmailDraft(
      step === 'address' ? (preference.data?.emailAddress ?? '') : undefined
    )
    setCode('')
    setEmailStep(step)
    setEmailDialogOpen(true)
  }
  useEffect(() => {
    if (!emailDialogOpen || emailBusy) return
    if (emailStep === 'verify') codeInput.current?.focus()
    else emailInput.current?.focus()
  }, [emailDialogOpen, emailStep, emailBusy])
  return (
    <section className='overflow-hidden rounded-xl border bg-card shadow-xs'>
      <div className='flex items-center gap-3 border-b bg-muted/20 px-4 py-4'>
        <SurfaceIcon icon={Bell} tone='teal' />
        <h2 className='text-base font-semibold'>Your notifications</h2>
      </div>
      <div className='flex items-start justify-between gap-4 px-4 py-4'>
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
          {preference.isError && (
            <div className='mt-3 space-y-2'>
              <p role='alert' className='text-xs text-destructive'>
                Notification settings could not be loaded.
              </p>
              <Button
                size='sm'
                variant='outline'
                disabled={preference.isFetching}
                onClick={() => void preference.refetch()}
              >
                {preference.isFetching ? 'Retrying…' : 'Try again'}
              </Button>
            </div>
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
      <div className='space-y-4 border-t px-4 py-4'>
        <div className='flex items-start justify-between gap-4'>
          <div>
            <label
              htmlFor='email-notifications'
              className='flex items-center gap-2 text-sm font-semibold'
            >
              <Mail className='size-4 text-muted-foreground' /> Personal email
              notifications
            </label>
            <p className='mt-2 max-w-xl text-sm leading-6 text-muted-foreground'>
              {preference.isPending
                ? 'Loading email settings…'
                : preference.isError
                  ? 'Email settings could not be loaded.'
                  : preference.data?.emailEnabled
                    ? 'Get repository updates by email. Open Preflyt to view report details.'
                    : 'Email delivery is not enabled. Ask your deployment administrator to enable it.'}
            </p>
          </div>
          <Switch
            id='email-notifications'
            className='mt-1 shrink-0'
            checked={preference.data?.email ?? false}
            disabled={
              !preference.data?.emailEnabled ||
              !preference.data.emailAddressAvailable ||
              save.isPending ||
              emailBusy
            }
            onCheckedChange={(email) =>
              save.mutate({
                assessments: preference.data?.assessments ?? true,
                email,
              })
            }
          />
        </div>
        {preference.data && (
          <div className='flex max-w-2xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
            <div className='min-w-0'>
              <p className='text-xs text-muted-foreground'>
                {hasAddress
                  ? preference.data.personalEmail
                    ? 'Delivery email'
                    : 'Account email'
                  : 'Delivery email'}
              </p>
              <p className='mt-1 text-sm font-medium break-all'>
                {preference.data.emailAddress ?? 'No email address added'}
              </p>
            </div>
            <div className='flex shrink-0 items-center gap-1'>
              <Button
                size='sm'
                ref={emailAction}
                variant={hasAddress ? 'outline' : 'default'}
                disabled={!preference.data.emailEnabled || emailBusy}
                aria-busy={removeEmail.isPending}
                onClick={() => openEmailDialog('address')}
              >
                {removeEmail.isPending && (
                  <Loader2
                    aria-hidden='true'
                    className='size-4 animate-spin motion-reduce:animate-none'
                  />
                )}
                {removeEmail.isPending
                  ? 'Removing…'
                  : hasAddress
                    ? 'Change'
                    : 'Add email'}
              </Button>
              {(preference.data.personalEmail ||
                preference.data.pendingEmail) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size='icon'
                      variant='ghost'
                      disabled={emailBusy}
                      aria-label='Email address actions'
                    >
                      <MoreHorizontal aria-hidden='true' className='size-4' />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align='end' className='w-56'>
                    <DropdownMenuItem
                      variant='destructive'
                      onSelect={() => {
                        requestEmail.reset()
                        verifyEmail.reset()
                        removeEmail.mutate()
                      }}
                    >
                      <div>
                        <p>Remove email</p>
                        <p className='mt-0.5 text-xs'>
                          Also turns off personal alerts and weekly emails.
                        </p>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        )}
        <span role='status' aria-live='polite' className='sr-only'>
          {removeEmail.isPending ? 'Removing notification email…' : ''}
        </span>
        {hasPendingCode && (
          <div className='flex max-w-2xl flex-wrap items-center gap-x-3 gap-y-1 text-xs'>
            <p className='min-w-0 break-all text-muted-foreground'>
              Verification needed for {preference.data?.pendingEmail}.
            </p>
            <Button
              size='sm'
              variant='link'
              className='h-auto min-h-8 px-0'
              disabled={emailBusy}
              onClick={() => openEmailDialog('verify')}
            >
              Enter code
            </Button>
          </div>
        )}
        {!emailDialogOpen && removeEmail.isError && (
          <p role='alert' className='text-sm text-destructive'>
            {removeEmail.error.message}
          </p>
        )}
        <Dialog
          open={emailDialogOpen}
          onOpenChange={(open) => {
            if (!emailBusy) setEmailDialogOpen(open)
          }}
        >
          <DialogContent
            className='sm:max-w-md'
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              if (dialogTrigger.current?.isConnected)
                dialogTrigger.current.focus()
              else emailAction.current?.focus()
            }}
            onOpenAutoFocus={(event) => {
              event.preventDefault()
              if (emailStep === 'verify') codeInput.current?.focus()
              else emailInput.current?.focus()
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {emailStep === 'verify'
                  ? 'Verify your email'
                  : hasAddress
                    ? 'Change notification email'
                    : 'Add notification email'}
              </DialogTitle>
              <DialogDescription>
                {emailStep === 'verify' ? (
                  <>
                    Enter the eight-digit code from the verification email for{' '}
                    <span className='font-medium break-all text-foreground'>
                      {codeDestination}
                    </span>
                    .
                  </>
                ) : hasAddress ? (
                  'Your current address stays active until you verify the new one.'
                ) : (
                  'Add an address for repository alerts in this workspace. Your sign-in email stays unchanged.'
                )}
              </DialogDescription>
            </DialogHeader>
            <form
              className='space-y-5'
              onSubmit={(event) => {
                event.preventDefault()
                if (emailBusy) return
                if (emailStep === 'verify') verifyEmail.mutate()
                else {
                  verifyEmail.reset()
                  requestEmail.mutate(emailValue)
                }
              }}
            >
              {emailStep === 'address' ? (
                <div className='space-y-2'>
                  <Label htmlFor='notification-email-address'>
                    Email address
                  </Label>
                  <Input
                    ref={emailInput}
                    id='notification-email-address'
                    type='email'
                    inputMode='email'
                    autoComplete='email'
                    autoCapitalize='none'
                    spellCheck={false}
                    maxLength={254}
                    value={emailValue}
                    onChange={(event) => setEmailDraft(event.target.value)}
                    placeholder='you@example.com'
                    required
                    disabled={emailBusy}
                    aria-invalid={
                      requestEmail.error?.message ===
                        'Enter a valid email address.' || undefined
                    }
                    aria-describedby={
                      requestEmail.isError
                        ? 'notification-email-error'
                        : undefined
                    }
                  />
                </div>
              ) : (
                <div className='space-y-3'>
                  <p
                    role='status'
                    aria-live='polite'
                    className='text-sm leading-5 text-muted-foreground'
                  >
                    {codeExpired
                      ? 'This code has expired. Request a new code.'
                      : deliveryState === 'FAILED' ||
                          deliveryState === 'SKIPPED'
                        ? 'Delivery could not be confirmed. Resend the code if it hasn’t arrived.'
                        : deliveryState === 'SENT'
                          ? 'Email sent. Check your inbox and spam folder.'
                          : deliveryState === 'PENDING'
                            ? 'Your email is queued. Delivery retries automatically if needed.'
                            : 'Check your inbox for the verification code.'}
                  </p>
                  <Label htmlFor='notification-email-code'>
                    Verification code
                  </Label>
                  <Input
                    ref={codeInput}
                    id='notification-email-code'
                    inputMode='numeric'
                    autoComplete='one-time-code'
                    className='h-12 text-center font-mono text-xl tracking-[0.35em] tabular-nums placeholder:tracking-normal'
                    value={code}
                    onChange={(event) =>
                      setCode(
                        event.target.value.replace(/[^0-9]/g, '').slice(0, 8)
                      )
                    }
                    placeholder='00000000'
                    pattern='[0-9]{8}'
                    maxLength={8}
                    required
                    disabled={emailBusy}
                    aria-invalid={
                      verifyEmail.error?.message.startsWith(
                        'The code is incorrect'
                      ) || undefined
                    }
                    aria-describedby={`notification-email-code-help${emailError ? ' notification-email-error' : ''}`}
                  />
                  <div className='flex flex-wrap items-center justify-between gap-2'>
                    <p
                      id='notification-email-code-help'
                      className='text-xs text-muted-foreground'
                    >
                      Code expires 15 minutes after your request.
                    </p>
                    <Button
                      type='button'
                      size='sm'
                      variant='link'
                      className='h-auto min-h-8 px-0'
                      disabled={emailBusy || resendSeconds > 0}
                      onClick={() => {
                        verifyEmail.reset()
                        requestEmail.mutate(codeDestination)
                      }}
                    >
                      {resendSeconds > 0
                        ? `Resend in ${resendSeconds}s`
                        : 'Resend code'}
                    </Button>
                  </div>
                  <p className='text-xs leading-5 text-muted-foreground'>
                    Verification turns on personal email alerts in this
                    workspace.
                  </p>
                  <Button
                    type='button'
                    size='sm'
                    variant='ghost'
                    className='-ms-3'
                    disabled={emailBusy}
                    onClick={() => {
                      requestEmail.reset()
                      verifyEmail.reset()
                      setEmailDraft(codeDestination)
                      setEmailStep('address')
                    }}
                  >
                    Use another email
                  </Button>
                </div>
              )}
              {emailError && (
                <p
                  id='notification-email-error'
                  role='alert'
                  className='text-sm text-destructive'
                >
                  {emailError.message}
                </p>
              )}
              <DialogFooter>
                <Button
                  type='button'
                  variant='outline'
                  disabled={emailBusy}
                  onClick={() => setEmailDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type='submit'
                  disabled={
                    emailBusy ||
                    (emailStep === 'verify'
                      ? codeExpired || !/^[0-9]{8}$/.test(code)
                      : !emailValue.trim() || !preference.data?.emailEnabled)
                  }
                >
                  {emailBusy && (
                    <Loader2
                      aria-hidden='true'
                      className='size-4 animate-spin motion-reduce:animate-none'
                    />
                  )}
                  {emailStep === 'verify'
                    ? verifyEmail.isPending
                      ? 'Verifying…'
                      : 'Verify and enable'
                    : requestEmail.isPending
                      ? 'Sending…'
                      : 'Send code'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        {save.isError && (
          <p role='alert' className='text-sm text-destructive'>
            {save.error.message}
          </p>
        )}
      </div>
      <WeeklyHealthPreferences
        key={`${session.data?.identityId}:${session.data?.organizationId}`}
      />
      <p className='border-t bg-muted/20 px-4 py-4 text-xs leading-5 text-muted-foreground'>
        Security, policy and AI configuration notices stay in your in-app inbox
        even when assessment alerts are turned off.
      </p>
    </section>
  )
}
