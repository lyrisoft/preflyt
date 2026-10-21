import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { SurfaceIcon } from '@/components/surface-icon'
import { useNavigationSession } from '@/features/workspace/navigation-session'
import { notificationRequest } from './notification-query'

type Settings = {
  enabled: boolean
  repositoryIds: string[]
  day: number
  hour: number
  timezone: string
}
export type WeeklyHealthPreferencesData = Settings & {
  suggestedRepositoryIds: string[]
  emailAddress: string | null
  deliveryAvailable: boolean
  repositories: Array<{ id: string; name: string }>
}
const days = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]
const selectClass =
  'h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [@media(pointer:coarse)]:min-h-11'
function timezones(current: string) {
  let known: string[] = []
  try {
    known =
      (
        Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }
      ).supportedValuesOf?.('timeZone') ?? []
  } catch {
    /* Older browsers retain the saved and local choices. */
  }
  return [
    ...new Set([
      'UTC',
      current,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...known,
    ]),
  ].sort()
}
export function WeeklyHealthPreferences() {
  const session = useNavigationSession()
  const client = useQueryClient()
  const key = [
    'weekly-health-preferences',
    session.data?.identityId,
    session.data?.organizationId,
  ]
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      notificationRequest<WeeklyHealthPreferencesData>(
        '/weekly-health',
        signal
      ),
    enabled: !!session.data?.identityId && !!session.data?.organizationId,
    gcTime: 0,
    retry: false,
  })
  const [draft, setDraft] = useState<Settings | null>(null)
  const [search, setSearch] = useState('')
  const save = useMutation({
    meta: { successMessage: 'Weekly health email preferences saved' },
    mutationFn: async (settings: Settings) => {
      const { API_BASE_URL } = await import('@/lib/api')
      const response = await fetch(
        `${API_BASE_URL}/notifications/weekly-health`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings),
        }
      )
      const result = await response.json().catch(() => ({}))
      if (!response.ok)
        throw new Error(
          typeof result.message === 'string'
            ? result.message
            : 'Could not save weekly email preferences. Try again.'
        )
      return result as WeeklyHealthPreferencesData
    },
    onSuccess: (result) => {
      client.setQueryData(key, result)
      setDraft(null)
    },
  })
  const data = query.isError ? undefined : query.data
  const settings = draft ?? data
  function update(value: Partial<Settings>) {
    if (settings)
      setDraft({
        enabled: settings.enabled,
        repositoryIds: settings.repositoryIds,
        day: settings.day,
        hour: settings.hour,
        timezone: settings.timezone,
        ...value,
      })
  }
  return (
    <section
      className='space-y-4 border-t px-4 py-4'
      aria-labelledby='weekly-health-heading'
    >
      <div className='flex items-center gap-3'>
        <SurfaceIcon icon={CalendarDays} tone='teal' />
        <div>
          <h3 id='weekly-health-heading' className='text-sm font-semibold'>
            Weekly repository health email
          </h3>
          <p className='mt-1 text-sm text-muted-foreground'>
            One email for your selected repositories in this workspace.
          </p>
        </div>
      </div>
      {query.isPending && (
        <p role='status' className='text-sm text-muted-foreground'>
          Loading weekly email settings…
        </p>
      )}
      {query.isError && (
        <div>
          <p role='alert' className='text-sm text-destructive'>
            Weekly email settings could not be loaded.
          </p>
          <Button
            variant='outline'
            size='sm'
            onClick={() => void query.refetch()}
          >
            Try again
          </Button>
        </div>
      )}
      {data && settings && (
        <form
          className='space-y-4'
          onSubmit={(event) => {
            event.preventDefault()
            save.mutate(settings)
          }}
        >
          <div className='flex items-start justify-between gap-4 rounded-lg bg-muted/20 p-3'>
            <div className='min-w-0'>
              <Label htmlFor='weekly-health-enabled'>
                Send me a weekly health email
              </Label>
              <p className='mt-1 text-sm break-all text-muted-foreground'>
                {!data.deliveryAvailable
                  ? 'Email delivery is unavailable. Ask your deployment administrator to configure it.'
                  : data.emailAddress
                    ? `Delivery email: ${data.emailAddress}`
                    : 'Add and verify a delivery email above to enable weekly emails.'}
              </p>
            </div>
            <Switch
              id='weekly-health-enabled'
              checked={settings.enabled}
              disabled={
                save.isPending ||
                (!settings.enabled &&
                  (!data.deliveryAvailable || !data.emailAddress))
              }
              onCheckedChange={(enabled) => update({ enabled })}
            />
          </div>
          <div className='grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]'>
            <fieldset disabled={save.isPending} className='min-w-0 space-y-3'>
              <legend className='text-sm font-medium'>Repositories</legend>
              <Label htmlFor='weekly-repo-search' className='sr-only'>
                Find a repository
              </Label>
              <Input
                id='weekly-repo-search'
                placeholder='Find a repository'
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <div className='flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
                <span>
                  {settings.repositoryIds.length} of 50 repositories selected
                </span>
                {data.suggestedRepositoryIds.length > 0 && (
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() =>
                      update({
                        repositoryIds: data.suggestedRepositoryIds.slice(0, 50),
                      })
                    }
                  >
                    Use assigned repositories
                  </Button>
                )}
                {settings.repositoryIds.length > 0 && (
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    onClick={() => update({ repositoryIds: [] })}
                  >
                    Clear selection
                  </Button>
                )}
              </div>
              <div className='max-h-60 space-y-1 overflow-y-auto rounded-lg border p-3'>
                {data.repositories
                  .filter((repo) =>
                    repo.name.toLowerCase().includes(search.toLowerCase())
                  )
                  .map((repo) => (
                    <label
                      key={repo.id}
                      className='flex min-h-10 cursor-pointer items-center gap-3 rounded px-1 text-sm focus-within:bg-muted/40 hover:bg-muted/40'
                    >
                      <Checkbox
                        checked={settings.repositoryIds.includes(repo.id)}
                        disabled={
                          !settings.repositoryIds.includes(repo.id) &&
                          settings.repositoryIds.length >= 50
                        }
                        onCheckedChange={(checked) =>
                          update({
                            repositoryIds:
                              checked === true
                                ? [...settings.repositoryIds, repo.id]
                                : settings.repositoryIds.filter(
                                    (id) => id !== repo.id
                                  ),
                          })
                        }
                      />
                      <span className='break-all'>{repo.name}</span>
                    </label>
                  ))}
                {!data.repositories.length && (
                  <p className='text-sm text-muted-foreground'>
                    No accessible repositories. Ask an administrator for
                    repository access.
                  </p>
                )}
                {data.repositories.length > 0 &&
                  !data.repositories.some((repo) =>
                    repo.name.toLowerCase().includes(search.toLowerCase())
                  ) && (
                    <p className='text-sm text-muted-foreground'>
                      No repositories match your search.
                    </p>
                  )}
              </div>
            </fieldset>
            <fieldset disabled={save.isPending} className='min-w-0 space-y-3'>
              <legend className='text-sm font-medium'>Delivery schedule</legend>
              <div className='grid gap-3 sm:grid-cols-2'>
                <div className='space-y-2'>
                  <Label htmlFor='weekly-day'>Day</Label>
                  <select
                    id='weekly-day'
                    className={selectClass}
                    value={settings.day}
                    onChange={(event) =>
                      update({ day: Number(event.target.value) })
                    }
                  >
                    {days.map((day, value) => (
                      <option key={day} value={value}>
                        {day}
                      </option>
                    ))}
                  </select>
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='weekly-hour'>Time</Label>
                  <select
                    id='weekly-hour'
                    className={selectClass}
                    value={settings.hour}
                    onChange={(event) =>
                      update({ hour: Number(event.target.value) })
                    }
                  >
                    {Array.from({ length: 24 }, (_, hour) => (
                      <option key={hour} value={hour}>
                        {String(hour).padStart(2, '0')}:00
                      </option>
                    ))}
                  </select>
                </div>
                <div className='space-y-2 sm:col-span-2'>
                  <Label htmlFor='weekly-timezone'>Timezone</Label>
                  <select
                    id='weekly-timezone'
                    className={selectClass}
                    value={settings.timezone}
                    onChange={(event) =>
                      update({ timezone: event.target.value })
                    }
                  >
                    {timezones(settings.timezone).map((zone) => (
                      <option key={zone} value={zone}>
                        {zone.replace(/_/g, ' ').replace(/\//g, ' / ')}
                      </option>
                    ))}
                  </select>
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    className='-ms-3'
                    onClick={() =>
                      update({
                        timezone:
                          Intl.DateTimeFormat().resolvedOptions().timeZone,
                      })
                    }
                  >
                    Use my timezone
                  </Button>
                </div>
              </div>
            </fieldset>
          </div>
          <p className='text-sm leading-6 text-muted-foreground'>
            Partial scans never count as fixes. If nothing ran this week, the
            email shows the last known state. Weekly emails are separate from
            individual assessment alerts.
          </p>
          {settings.enabled && !settings.repositoryIds.length && (
            <p role='alert' className='text-sm text-destructive'>
              Select at least one repository to receive the weekly email.
            </p>
          )}
          {save.isError && (
            <p role='alert' className='text-sm text-destructive'>
              {save.error.message}
            </p>
          )}
          <div className='flex justify-end border-t pt-4'>
            <Button
              type='submit'
              disabled={
                save.isPending ||
                !draft ||
                (settings.enabled &&
                  (!settings.repositoryIds.length ||
                    !data.emailAddress ||
                    !data.deliveryAvailable))
              }
            >
              {save.isPending ? 'Saving…' : 'Save weekly email preferences'}
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}
