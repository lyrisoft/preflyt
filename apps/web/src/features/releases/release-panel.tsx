import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowUpRight, BookOpen, RefreshCw } from 'lucide-react'
import Markdown from 'react-markdown'
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

export type ReleaseStatus = {
  installed: string
  sha: string | null
  development: boolean
  latest: Note | null
  notes: Note[]
  checkedAt: string | null
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
    [selected, setSelected] = useState('')
  const query = useQuery({
    queryKey: ['releases', session.data?.identityId],
    enabled: session.isSuccess,
    queryFn: ({ signal }) => request<ReleaseStatus>('', undefined, signal),
    retry: false,
    refetchInterval: 10 * 60 * 1000,
  })
  const check = useMutation({
    meta: { successMessage: 'Release check completed' },
    mutationFn: () => request<ReleaseStatus>('/check', {}),
    onSuccess: (data) => {
      query.refetch()
      return data
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
  const data = query.isError ? undefined : query.data
  const note = data?.notes.find((n) => n.tag === selected) ?? data?.notes[0]
  const update = !!data?.canCheck && data.updateAvailable
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
  function show(value: boolean) {
    setOpen(value)
  }

  return (
    <>
      <Button
        variant='ghost'
        size='sm'
        className='h-8 w-full justify-start gap-2 px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:justify-center'
        onClick={() => show(true)}
        aria-label={`What's new — ${label}${update ? ' — Update available' : ''}`}
      >
        <BookOpen className='size-4 shrink-0' />
        <span className='truncate group-data-[collapsible=icon]:hidden'>
          {label}
        </span>
        {(update || data?.unread) && (
          <span
            aria-label={update ? 'Update available' : 'Unread release notes'}
            className={`size-1.5 shrink-0 rounded-full ${update ? 'bg-warning' : 'bg-info'}`}
          />
        )}
      </Button>
      <Dialog open={open} onOpenChange={show}>
        <DialogContent className='flex max-h-[85dvh] min-w-0 flex-col overflow-hidden sm:max-w-3xl'>
          <DialogHeader className='flex-none pr-6'>
            <div className='flex items-center gap-3'>
              <SurfaceIcon icon={BookOpen} tone='blue' />
              <DialogTitle>What’s new in Preflyt</DialogTitle>
            </div>
            <DialogDescription>
              Release notes and installation updates.
            </DialogDescription>
          </DialogHeader>
          <div className='min-h-0 space-y-5 overflow-y-auto pr-1'>
            <div className='space-y-2 rounded-lg border bg-muted/20 p-3 text-sm'>
              <p>
                Installed: <strong>{label}</strong>
                {data?.sha && data.sha !== 'unknown' && (
                  <code className='ml-2 text-xs text-muted-foreground'>
                    {data.sha.slice(0, 12)}
                  </code>
                )}
              </p>
              {mismatch && (
                <p role='alert'>
                  Web and API builds differ. Deploy matching images before
                  upgrading.
                </p>
              )}
              {update && (
                <div className='space-y-2'>
                  <StatusBadge tone='warning'>Update available</StatusBadge>
                  <p>
                    {data.latest?.tag} is ready to install. Review the release
                    notes and upgrade guide before updating.
                  </p>
                  <Button variant='outline' size='sm' asChild>
                    <a
                      href='https://docs.preflytlabs.com/self-hosting/community-edition'
                      target='_blank'
                      rel='noopener noreferrer'
                    >
                      Upgrade guide <ArrowUpRight />
                    </a>
                  </Button>
                </div>
              )}
              {data?.development && (
                <p className='text-muted-foreground'>
                  Development build. Release upgrade comparisons are
                  unavailable.
                </p>
              )}
              {data &&
                !data.development &&
                !data.updateAvailable &&
                data.checkedAt &&
                !data.error && <p>No newer qualified release was found.</p>}
              <p className='text-xs text-muted-foreground'>
                {data?.checkedAt
                  ? `Last checked ${new Date(data.checkedAt).toLocaleString()}`
                  : 'No successful release check yet.'}
              </p>
            </div>
            {read.isError && (
              <div role='alert' className='space-y-2 text-sm'>
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
            {query.isPending && (
              <p role='status'>Loading release information…</p>
            )}
            {(query.isError || data?.error) && (
              <div role='alert' className='space-y-2 text-sm'>
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
            {data?.canCheck && (
              <div className='space-y-2'>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={check.isPending}
                  onClick={() => check.mutate()}
                >
                  <RefreshCw />
                  {check.isPending ? 'Checking…' : 'Check for updates'}
                </Button>
                <p className='text-xs text-muted-foreground'>
                  Checks are shared across this installation and limited to once
                  per minute. Failed checks retry after one hour.
                </p>
              </div>
            )}
            {check.isError && (
              <p role='alert' className='text-sm text-destructive'>
                {check.error.message}
              </p>
            )}
            {data?.canConfigure && (
              <details className='rounded-lg border p-3 text-sm'>
                <summary className='cursor-pointer font-medium'>
                  Update preferences
                </summary>
                <div className='mt-3 space-y-3'>
                  <label className='flex items-center justify-between gap-4'>
                    <span>Check automatically every 12 hours</span>
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
                    Only public release metadata is requested from GitHub.
                    Updates are installed manually.
                  </p>
                  {preferences.isError && (
                    <p role='alert'>{preferences.error.message}</p>
                  )}
                </div>
              </details>
            )}
            {note ? (
              <section className='min-w-0 space-y-4'>
                <Select value={note.tag} onValueChange={setSelected}>
                  <SelectTrigger
                    aria-label='Release version'
                    className='w-full'
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {data?.notes.map((n) => (
                      <SelectItem key={n.tag} value={n.tag}>
                        {n.tag}
                        {n.prerelease ? ' · Prerelease' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div>
                  <h2 className='text-lg font-semibold'>{note.name}</h2>
                  <p className='text-xs text-muted-foreground'>
                    {new Date(note.publishedAt).toLocaleDateString()}
                  </p>
                </div>
                {!note.ready && (
                  <p className='text-sm text-muted-foreground'>
                    Release notes are available; installation readiness has not
                    been confirmed.
                  </p>
                )}
                <div className='prose prose-sm dark:prose-invert max-w-none wrap-anywhere [&_pre]:overflow-x-auto'>
                  <Markdown
                    skipHtml
                    components={{
                      img: ({ alt }) => <span>{alt ?? 'Release image'}</span>,
                      a: ({ href, children }) => (
                        <a
                          href={
                            href && /^https?:\/\//.test(href) ? href : undefined
                          }
                          target='_blank'
                          rel='noopener noreferrer'
                        >
                          {children}
                        </a>
                      ),
                    }}
                  >
                    {note.body || 'No release notes were provided.'}
                  </Markdown>
                </div>
                <Button variant='outline' size='sm' asChild>
                  <a href={note.url} target='_blank' rel='noopener noreferrer'>
                    View on GitHub <ArrowUpRight />
                  </a>
                </Button>
              </section>
            ) : (
              data && (
                <p className='text-sm text-muted-foreground'>
                  No published release notes are available. Private repositories
                  and offline installations may not be reachable by the public
                  checker.
                </p>
              )
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
