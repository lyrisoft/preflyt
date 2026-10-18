import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, LoaderCircle, RefreshCw, Save, Trash2 } from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ResultTimestamp } from '@/components/result-timestamp'
import { SurfaceIcon } from '@/components/surface-icon'
import { useNavigationSession } from '@/features/workspace/navigation-session'

const fields = [
  [
    'assessmentDays',
    'Saved CI assessments',
    'Old assessments can be removed only when they are not the latest for a repository and target branch and have no linked reviews, findings, publications, policies or notifications.',
  ],
  [
    'sourceDays',
    'Finding source excerpts',
    'Redacted code shown beside findings. Removed excerpts can be fetched again if GitHub still provides that commit.',
  ],
  [
    'notificationDays',
    'Notifications',
    'Completed in-app notifications and their email delivery history. Pending deliveries are kept.',
  ],
  [
    'activityDays',
    'Contributor activity',
    'Older contribution observations. Charts and totals will cover only the activity you retain.',
  ],
  [
    'auditDays',
    'Routine audit history',
    'Access-denied events, notification events and retention activity. Policy, workflow and security decision receipts are kept.',
  ],
] as const
export type RetentionField = (typeof fields)[number][0]
type Policy = {
  organizationId: string
  revision: number
  enabled: boolean
} & Record<RetentionField, number>
type Settings = Policy & {
  lastRunAt: string | null
  lastResult: Partial<Record<RetentionField, number>> | null
  lastError: boolean
  nextRunAt: string | null
  running: boolean
  workerEnabled: boolean
}
type Preview = {
  asOf: string
  items: { kind: RetentionField; cutoff: string; eligible: number }[]
}
async function request<T>(path = '', options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/retention${path}`, {
    credentials: 'include',
    cache: 'no-store',
    ...options,
  })
  const body = await response.json().catch(() => null)
  if (!response.ok)
    throw new Error(
      typeof body?.message === 'string'
        ? body.message
        : 'Retention settings could not be loaded. Try again.'
    )
  return body as T
}
const json = (body: unknown, method = 'POST') => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
export function RetentionSettings() {
  const session = useNavigationSession(),
    organizationId = session.data?.organizationId,
    client = useQueryClient()
  const key = ['workspace-retention', organizationId]
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => request<Settings>('', { signal }),
    retry: false,
    gcTime: 0,
    meta: { silent: true },
    refetchInterval: 30000,
  })
  const [draft, setDraft] = useState<Policy | null>(null),
    [preview, setPreview] = useState<Preview | null>(null),
    [confirm, setConfirm] = useState(false)
  const settings = query.data,
    current = draft?.organizationId === organizationId ? draft : settings
  const body = () => ({
    revision: current!.revision,
    enabled: current!.enabled,
    ...Object.fromEntries(fields.map(([field]) => [field, current![field]])),
  })
  const saved = () => {
    setDraft(null)
    setPreview(null)
    void client.invalidateQueries({ queryKey: key })
  }
  const save = useMutation({
    mutationFn: () => request<Settings>('', json(body(), 'PATCH')),
    meta: { successMessage: 'Data retention settings saved' },
    onSuccess: () => {
      setConfirm(false)
      saved()
    },
  })
  const check = useMutation({
    mutationFn: () => request<Preview>('/preview', json(body())),
    onSuccess: setPreview,
  })
  const cleanup = useMutation({
    mutationFn: () =>
      request('/cleanup', json({ revision: settings!.revision })),
    meta: { successMessage: 'Cleanup queued for the background worker' },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: key })
    },
  })
  const change = (patch: Partial<Policy>) => {
    setDraft({ ...current!, ...patch })
    setPreview(null)
    check.reset()
    save.reset()
  }
  const valid =
    !!current &&
    fields.every(
      ([field]) =>
        Number.isSafeInteger(current[field]) &&
        current[field] >= (field === 'auditDays' ? 90 : 30) &&
        current[field] <= 3650
    )
  const changed =
    !!settings &&
    !!current &&
    (settings.enabled !== current.enabled ||
      fields.some(([field]) => settings[field] !== current[field]))
  const busy = save.isPending || check.isPending || cleanup.isPending
  if (query.isPending)
    return <p role='status'>Loading data retention settings…</p>
  if (query.isError || !settings || !current)
    return (
      <div role='alert' className='space-y-3'>
        <p>
          {query.error?.message ?? 'Data retention settings are unavailable.'}
        </p>
        <Button variant='outline' onClick={() => void query.refetch()}>
          Retry
        </Button>
      </div>
    )
  return (
    <div className='max-w-5xl space-y-4'>
      <Card>
        <CardHeader className='flex-row items-start gap-3 space-y-0'>
          <SurfaceIcon icon={Archive} />
          <div>
            <h2 className='font-semibold'>Data retention</h2>
            <p className='mt-1 text-sm text-muted-foreground'>
              Choose how long this workspace keeps data. Cleanup permanently
              removes eligible records after the selected period.
            </p>
          </div>
        </CardHeader>
        <CardContent className='space-y-5'>
          <div className='flex items-center justify-between gap-4 rounded-lg border p-3'>
            <div>
              <Label htmlFor='retention-enabled'>Automatic cleanup</Label>
              <p className='mt-1 text-xs text-muted-foreground'>
                Disabled until you enable it and save. Cleanup runs in small
                batches in the background.
              </p>
            </div>
            <Switch
              id='retention-enabled'
              checked={current.enabled}
              disabled={busy}
              onCheckedChange={(enabled) => change({ enabled })}
            />
          </div>
          <div className='divide-y rounded-lg border'>
            {fields.map(([field, label, help]) => (
              <div
                key={field}
                className='grid gap-3 p-4 sm:grid-cols-[1fr_9rem] sm:items-start'
              >
                <div>
                  <Label htmlFor={`retention-${field}`}>{label}</Label>
                  <p
                    id={`retention-${field}-help`}
                    className='mt-1 max-w-2xl text-sm text-muted-foreground'
                  >
                    {help}
                  </p>
                </div>
                <div className='flex items-center gap-2'>
                  <Input
                    id={`retention-${field}`}
                    type='number'
                    inputMode='numeric'
                    min={field === 'auditDays' ? 90 : 30}
                    max={3650}
                    step={1}
                    value={Number.isNaN(current[field]) ? '' : current[field]}
                    disabled={busy}
                    aria-describedby={`retention-${field}-help`}
                    onChange={(e) =>
                      change({
                        [field]:
                          e.target.value === '' ? NaN : Number(e.target.value),
                      })
                    }
                  />
                  <span className='text-sm text-muted-foreground'>days</span>
                </div>
              </div>
            ))}
          </div>
          {!valid && (
            <p role='alert' className='text-sm text-destructive'>
              Enter whole days from 30 to 3650. Audit history requires at least
              90 days.
            </p>
          )}
          <p className='text-sm text-muted-foreground'>
            Health assessment reports, human review decisions, active work and
            records still needed by other features are protected. Their storage
            may remain beyond these periods. Deletion may free space for the
            database to reuse without immediately reducing the server’s disk
            usage.
          </p>
          {(save.error || check.error) && (
            <p role='alert' className='text-sm text-destructive'>
              {save.error?.message ?? check.error?.message}
            </p>
          )}
          <div className='flex flex-wrap justify-end gap-2'>
            <Button
              variant='outline'
              disabled={busy || !valid}
              onClick={() => check.mutate()}
            >
              {check.isPending ? (
                <LoaderCircle className='size-4 animate-spin' />
              ) : (
                <RefreshCw className='size-4' />
              )}
              Preview cleanup
            </Button>
            <Button
              disabled={busy || !valid || !changed}
              onClick={() => setConfirm(true)}
            >
              <Save className='size-4' />
              Save retention settings
            </Button>
          </div>
        </CardContent>
      </Card>
      {preview && (
        <Card>
          <CardHeader>
            <h3 className='font-semibold'>Cleanup preview</h3>
            <p className='text-sm text-muted-foreground'>
              Eligible records as of <ResultTimestamp value={preview.asOf} />.
              Counts can change before cleanup runs. Removing a notification
              also removes its inbox and email delivery records.
            </p>
          </CardHeader>
          <CardContent>
            <dl className='divide-y'>
              {fields.map(([field, label]) => {
                const item = preview.items.find((x) => x.kind === field)
                return (
                  <div
                    key={field}
                    className='flex flex-wrap justify-between gap-2 py-3'
                  >
                    <dt>{label}</dt>
                    <dd className='text-sm tabular-nums'>
                      {item?.eligible.toLocaleString() ?? 0} eligible{' '}
                      {item && (
                        <>
                          {' '}
                          · before <ResultTimestamp value={item.cutoff} />
                        </>
                      )}
                    </dd>
                  </div>
                )
              })}
            </dl>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <h3 className='font-semibold'>Cleanup activity</h3>
        </CardHeader>
        <CardContent className='space-y-3 text-sm'>
          {!settings.workerEnabled && (
            <p role='status'>
              Cleanup is paused by the deployment administrator.
            </p>
          )}
          {settings.lastError && (
            <p role='alert'>
              The last cleanup did not finish. Completed batches stay removed.
              Ask your administrator to check the worker logs if this continues.
            </p>
          )}
          <p>
            {!settings.workerEnabled
              ? 'Cleanup is paused.'
              : settings.running
                ? 'Cleanup is running.'
                : !settings.enabled
                  ? 'Automatic cleanup is off.'
                  : settings.nextRunAt &&
                      Date.parse(settings.nextRunAt) <
                        query.dataUpdatedAt - 180000
                    ? 'Cleanup is waiting for the background worker. Ask your administrator to check that it is running.'
                    : 'Cleanup is scheduled.'}
          </p>
          {settings.lastRunAt ? (
            <p>
              Last completed batch:{' '}
              <ResultTimestamp value={settings.lastRunAt} /> ·{' '}
              {Object.values(settings.lastResult ?? {})
                .reduce((sum, n) => sum + (n ?? 0), 0)
                .toLocaleString()}{' '}
              records removed.
            </p>
          ) : (
            <p>No cleanup has completed yet.</p>
          )}
          {settings.enabled && settings.nextRunAt && (
            <p>
              Next scheduled check:{' '}
              <ResultTimestamp value={settings.nextRunAt} />
            </p>
          )}
          {cleanup.error && <p role='alert'>{cleanup.error.message}</p>}
          <Button
            variant='outline'
            disabled={
              busy ||
              changed ||
              !settings.enabled ||
              !settings.workerEnabled ||
              settings.running
            }
            onClick={() => cleanup.mutate()}
          >
            <Trash2 className='size-4' />
            Queue cleanup
          </Button>
        </CardContent>
      </Card>
      <p className='text-sm text-muted-foreground'>
        Server storage is managed separately: container logs, old images, build
        caches and backup rotation are deployment settings. Saved GitHub display
        data already expires after 7 unused days; ruleset history follows the
        deployment’s configured retention period.
      </p>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save data retention settings?</AlertDialogTitle>
            <AlertDialogDescription>
              {current.enabled
                ? 'Cleanup will permanently delete eligible old records, including existing data. Deleted history cannot be restored from this page. Preview cleanup and ensure you have a backup before enabling it.'
                : 'Automatic cleanup will be disabled. Previously deleted records cannot be restored from this page.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={save.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={save.isPending}
              onClick={(e) => {
                e.preventDefault()
                save.mutate()
              }}
            >
              {save.isPending ? 'Saving…' : 'Save settings'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
