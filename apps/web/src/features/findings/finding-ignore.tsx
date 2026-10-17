import { useId, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardCheck,
  EyeOff,
  History,
  LoaderCircle,
  RotateCcw,
} from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { OptionSelect } from '@/components/ui/option-select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import { findingRequest } from './finding-api'

type Decision = {
  state: string
  reason: string
  expiresAt: string | null
  revision: number
  expired: boolean
  canManage: boolean
  eligible: boolean
  history: {
    event: string
    at: string
    reason: string
    expiresAt: string | null
  }[]
}
export function FindingIgnore({
  path,
  scope,
}: {
  path: string
  scope: string
}) {
  const client = useQueryClient()
  const id = useId()
  const [reason, setReason] = useState('')
  const [expiry, setExpiry] = useState('')
  const [expiryMode, setExpiryMode] = useState('never')
  const [expiryError, setExpiryError] = useState<string | null>(null)
  const query = useQuery({
    queryKey: ['finding-ignore', scope, path],
    gcTime: 0,
    retry: false,
    queryFn: ({ signal }) => findingRequest<Decision>(path, signal),
  })
  const save = useMutation({
    meta: { successMessage: 'Finding review decision saved' },
    mutationFn: async ({
      state,
      expiresAt,
    }: {
      state: 'OPEN' | 'IGNORED'
      expiresAt: string | null
    }) => {
      const response = await fetch(`${API_BASE_URL}/${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state,
          reason,
          expiresAt,
          expectedRevision: query.data?.revision ?? 0,
        }),
      })
      const data = await response.json()
      if (!response.ok)
        throw new Error(data.message ?? 'Could not save the review decision.')
    },
    onSuccess: async () => {
      setReason('')
      setExpiry('')
      setExpiryMode('never')
      setExpiryError(null)
      await Promise.all([
        query.refetch(),
        client.invalidateQueries({ queryKey: ['findings'] }),
        client.invalidateQueries({ queryKey: ['finding-detail'] }),
      ])
    },
  })
  const data = query.isError ? undefined : query.data
  const ignored = data?.state === 'IGNORED'
  if (data && !data.eligible) return null
  return (
    <Card className='gap-0 overflow-hidden' aria-labelledby={`${id}-title`}>
      <CardHeader className='flex flex-row items-center justify-between gap-3 border-b'>
        <div className='flex min-w-0 items-center gap-3'>
          <SurfaceIcon icon={ClipboardCheck} tone='blue' />
          <CardTitle asChild>
            <h2 id={`${id}-title`}>Finding review</h2>
          </CardTitle>
        </div>
        {data && (
          <StatusBadge tone='neutral' compact className='shrink-0'>
            {ignored ? 'Ignored' : 'Open'}
          </StatusBadge>
        )}
      </CardHeader>
      <CardContent className='space-y-4 pt-4'>
        {query.isPending && (
          <div
            role='status'
            aria-label='Loading review decision'
            className='space-y-3'
          >
            <Skeleton className='h-4 w-3/4' />
            <Skeleton className='h-24 w-full' />
            <Skeleton className='h-9 w-full' />
          </div>
        )}
        {query.isError && (
          <div role='alert' className='space-y-3 text-sm'>
            <p>{query.error.message}</p>
            <Button
              variant='outline'
              size='sm'
              onClick={() => void query.refetch()}
            >
              Retry
            </Button>
          </div>
        )}
        {data && (
          <>
            {data.expired && (
              <p className='text-sm'>
                The ignore expired. This finding is active again.
              </p>
            )}
            {data.reason && (
              <div className='space-y-1.5'>
                <p className='text-xs font-medium text-muted-foreground'>
                  Latest review reason
                </p>
                <p className='text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap'>
                  {data.reason}
                </p>
                {ignored && (
                  <p className='text-xs text-muted-foreground'>
                    {data.expiresAt
                      ? `Reopens ${new Date(data.expiresAt).toLocaleString()}`
                      : 'Ignored until manually reopened'}
                  </p>
                )}
              </div>
            )}
            <p className='text-sm leading-relaxed text-muted-foreground'>
              {ignored
                ? 'Reopen this finding to include it in active results.'
                : 'Ignore this exact finding across future scans of this repository.'}
            </p>
            {data.canManage && (
              <form
                className='space-y-4'
                noValidate
                onSubmit={(event) => {
                  event.preventDefault()
                  if (save.isPending || !reason.trim()) return
                  let expiresAt: string | null = null
                  if (!ignored && expiryMode !== 'never') {
                    const date =
                      expiryMode === 'custom'
                        ? new Date(expiry)
                        : new Date(
                            Date.now() +
                              Number(expiryMode) * 24 * 60 * 60 * 1000
                          )
                    if (
                      !Number.isFinite(date.getTime()) ||
                      date.getTime() <= Date.now()
                    ) {
                      setExpiryError('Choose a future date and time.')
                      return
                    }
                    expiresAt = date.toISOString()
                  }
                  setExpiryError(null)
                  save.mutate({
                    state: ignored ? 'OPEN' : 'IGNORED',
                    expiresAt,
                  })
                }}
              >
                <fieldset
                  disabled={save.isPending}
                  className='min-w-0 space-y-4'
                >
                  <legend className='sr-only'>
                    {ignored ? 'Reopen finding' : 'Ignore finding'}
                  </legend>
                  <div className='space-y-2'>
                    <div className='flex items-baseline justify-between gap-3'>
                      <label
                        htmlFor={`${id}-reason`}
                        className='text-sm font-medium'
                      >
                        {ignored
                          ? 'Reason for reopening'
                          : 'Reason for ignoring'}
                      </label>
                      <span className='text-xs text-muted-foreground'>
                        Required
                      </span>
                    </div>
                    <Textarea
                      id={`${id}-reason`}
                      aria-describedby={`${id}-reason-help`}
                      required
                      maxLength={1000}
                      rows={3}
                      className='min-h-24 resize-y text-sm leading-relaxed font-normal'
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder={
                        ignored
                          ? 'Why should this finding be reviewed again?'
                          : 'Why can this finding be ignored?'
                      }
                    />
                    <div
                      id={`${id}-reason-help`}
                      className='flex justify-between gap-3 text-xs text-muted-foreground'
                    >
                      <span>Saved in the review history.</span>
                      <span className='shrink-0 tabular-nums'>
                        {reason.length.toLocaleString()} / 1,000
                      </span>
                    </div>
                  </div>
                  {!ignored && (
                    <div className='space-y-2'>
                      <div className='flex items-baseline justify-between gap-3'>
                        <label
                          htmlFor={`${id}-expiry-mode`}
                          className='text-sm font-medium'
                        >
                          Expiry
                        </label>
                        <span className='text-xs text-muted-foreground'>
                          Optional
                        </span>
                      </div>
                      <OptionSelect
                        id={`${id}-expiry-mode`}
                        label='Expiry'
                        value={expiryMode}
                        onValueChange={(value) => {
                          setExpiryMode(value)
                          setExpiryError(null)
                        }}
                        options={[
                          { value: 'never', label: 'Until manually reopened' },
                          { value: '7', label: 'After 7 days' },
                          { value: '30', label: 'After 30 days' },
                          { value: '90', label: 'After 90 days' },
                          { value: 'custom', label: 'Custom date and time' },
                        ]}
                      />
                      {expiryMode === 'custom' && (
                        <div className='space-y-2 pt-1'>
                          <label
                            htmlFor={`${id}-expiry`}
                            className='text-xs font-medium text-muted-foreground'
                          >
                            Date and time (local)
                          </label>
                          <Input
                            id={`${id}-expiry`}
                            type='datetime-local'
                            className='text-sm font-normal [color-scheme:light] dark:[color-scheme:dark]'
                            aria-invalid={!!expiryError}
                            aria-describedby={
                              expiryError ? `${id}-expiry-error` : undefined
                            }
                            required
                            value={expiry}
                            onChange={(event) => {
                              setExpiry(event.target.value)
                              setExpiryError(null)
                            }}
                          />
                        </div>
                      )}
                      {expiryError && (
                        <p
                          role='alert'
                          id={`${id}-expiry-error`}
                          className='text-xs text-destructive'
                        >
                          {expiryError}
                        </p>
                      )}
                      <p className='text-xs leading-relaxed text-muted-foreground'>
                        {expiryMode === 'never'
                          ? 'You can reopen this finding at any time.'
                          : 'This finding reopens automatically when the ignore expires.'}
                      </p>
                    </div>
                  )}
                </fieldset>
                {save.isError && (
                  <p role='alert' className='text-sm text-destructive'>
                    {save.error.message}
                  </p>
                )}
                <div className='flex justify-end border-t pt-3'>
                  <Button
                    type='submit'
                    size='sm'
                    disabled={
                      save.isPending ||
                      !reason.trim() ||
                      (!ignored && expiryMode === 'custom' && !expiry)
                    }
                  >
                    {save.isPending ? (
                      <LoaderCircle className='animate-spin' />
                    ) : ignored ? (
                      <RotateCcw />
                    ) : (
                      <EyeOff />
                    )}
                    {save.isPending
                      ? 'Saving…'
                      : ignored
                        ? 'Reopen finding'
                        : 'Ignore finding'}
                  </Button>
                </div>
              </form>
            )}
            {!!data.history?.length && (
              <details className='border-t pt-3 text-sm'>
                <summary className='cursor-pointer rounded-sm font-medium focus-visible:outline-2 focus-visible:outline-ring'>
                  <span className='inline-flex items-center gap-2'>
                    <History
                      className='size-3.5 text-muted-foreground'
                      aria-hidden='true'
                    />
                    Recent review history
                  </span>
                </summary>
                <ul className='mt-3 space-y-3'>
                  {data.history.map((entry, index) => (
                    <li
                      key={`${entry.at}:${index}`}
                      className='space-y-1 border-t pt-3'
                    >
                      <p className='text-xs text-muted-foreground'>
                        {entry.event === 'finding.ignored'
                          ? 'Ignored'
                          : 'Reopened'}{' '}
                        · {new Date(entry.at).toLocaleString()}
                      </p>
                      <p className='leading-relaxed wrap-anywhere whitespace-pre-wrap'>
                        {entry.reason}
                      </p>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
