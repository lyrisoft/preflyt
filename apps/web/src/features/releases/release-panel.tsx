import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, BookOpen, RefreshCw } from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import { useNavigationSession } from '@/features/workspace/navigation-session'
import { splitReleaseNotes } from './release-note-content'
import { ReleaseNotes } from './release-notes'

export type ReleaseStatus = {
  installed: string
  sha: string | null
  development: boolean
  latest: Note | null
  notes: Note[]
  checkedAt: string | null
  nextCheckAt?: string | null
  error: string | null
  enabled: boolean
  prereleases: boolean
  revision: number
  updateAvailable: boolean
  unread: boolean
  canCheck: boolean
  canConfigure: boolean
}
type Note = {
  tag: string
  name: string
  body: string
  url: string
  publishedAt: string
  ready: boolean
  prerelease: boolean
}
async function request<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/releases${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'include',
    cache: 'no-store',
    signal,
    ...(body === undefined
      ? {}
      : {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok)
    throw new Error(
      typeof data?.message === 'string'
        ? data.message
        : 'Release information is unavailable. Try again.'
    )
  return data
}
export function ReleasePanel() {
  const session = useNavigationSession(),
    [open, setOpen] = useState(false),
    [selected, setSelected] = useState(''),
    [now, setNow] = useState(Date.now)
  const queryClient = useQueryClient()
  const queryKey = ['releases', session.data?.identityId]
  const query = useQuery({
    queryKey,
    enabled: session.isSuccess,
    queryFn: async ({ signal }) => {
      const saved = await request<ReleaseStatus>('', undefined, signal)
      const now = Date.now()
      const stale =
        !saved.checkedAt || now - Date.parse(saved.checkedAt) > 5 * 60 * 1000
      const coolingDown =
        !!saved.nextCheckAt && Date.parse(saved.nextCheckAt) > now
      if (!saved.canCheck || !saved.enabled || !stale || coolingDown)
        return saved
      try {
        return await request<ReleaseStatus>(
          '/check',
          { automatic: true },
          signal
        )
      } catch (error) {
        if (signal.aborted) throw error
        return {
          ...saved,
          error:
            'Automatic update check failed. Last saved release information is shown.',
        }
      }
    },
    retry: false,
    refetchInterval: 10 * 60 * 1000,
  })
  const check = useMutation({
    meta: { silent: true },
    mutationFn: (automatic: boolean) =>
      request<ReleaseStatus>('/check', { automatic }),
    onSuccess: async (data) => {
      await queryClient.cancelQueries({ queryKey })
      queryClient.setQueryData(queryKey, data)
      setSelected('')
    },
  })
  const preferences = useMutation({
    meta: { successMessage: 'Update preferences saved' },
    mutationFn: (body: unknown) => request('/preferences', body),
    onSuccess: () => query.refetch(),
  })
  const read = useMutation({
    meta: { silent: true },
    mutationFn: (tag: string) => request('/read', { tag }),
    onSuccess: () => query.refetch(),
  })
  const data = query.data
  const note = data?.notes.find((n) => n.tag === selected) ?? data?.notes[0]
  const available = !!data?.updateAvailable
  const update = !!data?.canCheck && available
  const build = import.meta.env.VITE_PREFLYT_BUILD_VERSION ?? 'development'
  const label = data?.development
    ? 'Development'
    : (data?.installed ?? (build === 'development' ? 'Development' : build))
  const mismatch =
    !!data?.sha &&
    data.sha !== 'unknown' &&
    !!import.meta.env.VITE_PREFLYT_BUILD_SHA &&
    import.meta.env.VITE_PREFLYT_BUILD_SHA !== 'unknown' &&
    data.sha !== import.meta.env.VITE_PREFLYT_BUILD_SHA
  const acknowledged = useRef('')
  const tag = data?.notes[0]?.tag
  const markRead = read.mutate
  useEffect(() => {
    const key = `${session.data?.identityId}:${tag}`
    if (open && data?.unread && tag && acknowledged.current !== key) {
      acknowledged.current = key
      markRead(tag)
    }
  }, [open, data?.unread, tag, markRead, session.data?.identityId])
  useEffect(() => {
    if (!open || !data?.nextCheckAt) return
    const delay = Date.parse(data.nextCheckAt) - Date.now()
    if (delay <= 0) return
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(delay + 50, 2_147_483_647)
    )
    return () => clearTimeout(timer)
  }, [open, data?.nextCheckAt])
  const coolingDown = !!data?.nextCheckAt && Date.parse(data.nextCheckAt) > now
  const releaseNotes = splitReleaseNotes(note?.body ?? '')
  function show(value: boolean) {
    setOpen(value)
    if (!value) return
    setSelected('')
    setNow(Date.now())
    void query.refetch()
  }

  return (
    <>
      <Button
        variant='ghost'
        size='sm'
        className='h-8 w-full justify-start gap-2 px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:justify-center'
        onClick={() => show(true)}
        aria-label={`What's new — ${label}${available ? ' — Update available' : ''}`}
      >
        <BookOpen className='size-4 shrink-0' />
        <span className='truncate group-data-[collapsible=icon]:hidden'>
          {label}
        </span>
        {(available || data?.unread) && (
          <span
            aria-label={available ? 'Update available' : 'Unread release notes'}
            className={`size-1.5 shrink-0 rounded-full ${available ? 'bg-warning' : 'bg-info'}`}
          />
        )}
      </Button>
      <Dialog open={open} onOpenChange={show}>
        <DialogContent className='flex h-[min(85dvh,48rem)] min-w-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl'>
          <DialogHeader className='flex-none border-b px-5 py-4 pr-12 text-start'>
            <div className='flex items-center gap-3'>
              <SurfaceIcon icon={BookOpen} tone='blue' />
              <div className='space-y-1.5'>
                <DialogTitle>What’s new in Preflyt</DialogTitle>
                <DialogDescription>
                  Product updates and release history.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className='flex flex-none flex-wrap items-center justify-between gap-3 border-b bg-muted/20 px-5 py-3'>
            <div className='flex flex-wrap items-center gap-x-4 gap-y-2 text-sm'>
              <span className='text-muted-foreground'>
                Installed{' '}
                <strong className='font-medium text-foreground'>{label}</strong>
              </span>
              {data?.latest && (
                <span className='text-muted-foreground'>
                  Latest{' '}
                  <strong className='font-medium text-foreground'>
                    {data.latest.tag}
                  </strong>
                </span>
              )}
              {update && (
                <StatusBadge tone='warning'>Update available</StatusBadge>
              )}
            </div>
            {data?.canCheck && (
              <Button
                variant='outline'
                size='sm'
                disabled={check.isPending || coolingDown}
                onClick={() => check.mutate(false)}
                aria-busy={check.isPending}
              >
                <RefreshCw
                  className={
                    check.isPending
                      ? 'animate-spin motion-reduce:animate-none'
                      : ''
                  }
                />
                {check.isPending ? 'Checking…' : 'Check for updates'}
              </Button>
            )}
          </div>
          <div
            className='min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6'
            tabIndex={0}
            role='region'
            aria-label='Release notes'
          >
            <div className='space-y-4'>
              {mismatch && (
                <p role='alert' className='rounded-lg border p-3 text-sm'>
                  Web and API builds differ. Deploy matching images before
                  upgrading.
                </p>
              )}
              {query.isPending && (
                <p role='status' className='text-sm text-muted-foreground'>
                  Loading release information…
                </p>
              )}
              {(query.isError || data?.error) && (
                <div
                  role='alert'
                  className='space-y-2 rounded-lg border p-3 text-sm'
                >
                  <p>{query.error?.message ?? data?.error}</p>
                  {query.isError && (
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => void query.refetch()}
                    >
                      Retry
                    </Button>
                  )}
                </div>
              )}
              {check.isError && (
                <p role='alert' className='text-sm text-destructive'>
                  {check.error.message}
                </p>
              )}
              {read.isError && (
                <div
                  role='alert'
                  className='flex flex-wrap items-center gap-2 text-sm'
                >
                  <p>Could not mark release notes as read.</p>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={read.isPending}
                    onClick={() => tag && read.mutate(tag)}
                  >
                    Mark as read
                  </Button>
                </div>
              )}
              {note ? (
                <section className='min-w-0 space-y-5' aria-label={note.name}>
                  <div className='flex flex-wrap items-start justify-between gap-3'>
                    <div className='space-y-1'>
                      <h2 className='text-xl font-semibold tracking-tight'>
                        {note.name}
                      </h2>
                      <p className='text-sm text-muted-foreground'>
                        <time dateTime={note.publishedAt}>
                          {new Date(note.publishedAt).toLocaleDateString(
                            undefined,
                            { day: 'numeric', month: 'long', year: 'numeric' }
                          )}
                        </time>
                      </p>
                    </div>
                    <div className='space-y-1.5'>
                      <label
                        htmlFor='release-version'
                        className='block text-xs text-muted-foreground'
                      >
                        Release history
                      </label>
                      <Select value={note.tag} onValueChange={setSelected}>
                        <SelectTrigger
                          id='release-version'
                          aria-label='Release version'
                          className='w-44 max-w-full'
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {data?.notes.map((n, index) => (
                            <SelectItem key={n.tag} value={n.tag}>
                              {n.tag}
                              {n.prerelease
                                ? ' · Prerelease'
                                : index === 0
                                  ? ' · Latest'
                                  : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {!note.ready && (
                    <p className='text-sm text-muted-foreground'>
                      Release notes are available. Installation packages have
                      not been confirmed yet.
                    </p>
                  )}
                  <ReleaseNotes body={releaseNotes.changes} />
                  {releaseNotes.details && (
                    <details className='rounded-lg border px-3 py-2 text-sm'>
                      <summary className='cursor-pointer font-medium'>
                        Image and build details
                      </summary>
                      <ReleaseNotes body={releaseNotes.details} />
                    </details>
                  )}
                  <div className='flex flex-wrap gap-2 border-t pt-4'>
                    {update && (
                      <Button size='sm' asChild>
                        <a
                          href='https://docs.preflytlabs.com/self-hosting/community-edition'
                          target='_blank'
                          rel='noopener noreferrer'
                        >
                          Upgrade guide <ArrowUpRight />
                        </a>
                      </Button>
                    )}
                    <Button variant='outline' size='sm' asChild>
                      <a
                        href={note.url}
                        target='_blank'
                        rel='noopener noreferrer'
                      >
                        View on GitHub <ArrowUpRight />
                      </a>
                    </Button>
                  </div>
                </section>
              ) : (
                data && (
                  <p className='text-sm text-muted-foreground'>
                    No release notes have been fetched yet. Check for updates or
                    browse{' '}
                    <a
                      className='underline underline-offset-4'
                      href='https://github.com/lyrisoft/preflyt/releases'
                      target='_blank'
                      rel='noopener noreferrer'
                    >
                      Preflyt releases on GitHub
                    </a>
                    .
                  </p>
                )
              )}
              {data?.development && (
                <p className='text-xs text-muted-foreground'>
                  Development build. Release upgrade comparisons are
                  unavailable.
                </p>
              )}
              {data &&
                !data.development &&
                !data.updateAvailable &&
                data.checkedAt &&
                !data.error && (
                  <p className='text-xs text-muted-foreground'>
                    No newer installable release was found at the last check.
                  </p>
                )}
            </div>
          </div>
          <div className='max-h-[30dvh] flex-none space-y-3 overflow-y-auto border-t px-5 py-3'>
            <p className='text-xs text-muted-foreground' aria-live='polite'>
              {check.isPending
                ? 'Checking GitHub for new releases…'
                : data?.checkedAt
                  ? `Last checked ${new Date(data.checkedAt).toLocaleString()}`
                  : 'No successful release check yet.'}
              {data?.canCheck &&
                coolingDown &&
                !check.isPending &&
                ` · Check again after ${new Date(data.nextCheckAt!).toLocaleTimeString()}`}
            </p>
            {data?.canConfigure && (
              <details className='text-sm'>
                <summary className='cursor-pointer font-medium'>
                  Update preferences
                </summary>
                <div className='mt-3 space-y-3'>
                  <label className='flex items-center justify-between gap-4'>
                    <span>Check for updates automatically</span>
                    <Switch
                      checked={data.enabled}
                      disabled={preferences.isPending}
                      onCheckedChange={(enabled) =>
                        preferences.mutate({
                          enabled,
                          prereleases: data.prereleases,
                          revision: data.revision,
                        })
                      }
                    />
                  </label>
                  <label className='flex items-center justify-between gap-4'>
                    <span>Include prereleases</span>
                    <Switch
                      checked={data.prereleases}
                      disabled={preferences.isPending}
                      onCheckedChange={(prereleases) =>
                        preferences.mutate({
                          enabled: data.enabled,
                          prereleases,
                          revision: data.revision,
                        })
                      }
                    />
                  </label>
                  <p className='text-xs text-muted-foreground'>
                    Only public release information is requested from GitHub.
                    Opening this panel also refreshes information older than
                    five minutes when automatic checks are enabled. Updates are
                    installed manually.
                  </p>
                  {data.sha && data.sha !== 'unknown' && (
                    <p className='text-xs text-muted-foreground'>
                      Installed build{' '}
                      <code className='wrap-anywhere'>{data.sha}</code>
                    </p>
                  )}
                  {preferences.isError && (
                    <p role='alert'>{preferences.error.message}</p>
                  )}
                </div>
              </details>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
