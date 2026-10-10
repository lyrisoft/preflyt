import { useState } from 'react'
import { CheckCheck, Inbox, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AppHeader } from '@/components/layout/app-header'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { NotificationItem } from './inbox'
import { NotificationPreferences } from './notification-preferences'
import { useInbox, titles } from './notification-query'
import { NotificationRepositoryFilter } from './repository-filter'

export function NotificationsPage() {
  const [filters, setFilters] = useState<Record<string, string>>({ page: '1' })
  const { query, read, session } = useInbox(filters)
  const change = (key: string, value: string) =>
    setFilters((current) => {
      const next = { ...current, [key]: value, page: '1' }
      if (!value) delete next[key]
      return next
    })
  return (
    <>
      <AppHeader breadcrumbs={[{ label: 'Notifications' }]} />
      <Main fluid className='space-y-6'>
        <PageHeader
          title='Notifications'
          section='Workspace'
          description='Assessment and policy updates from repositories you can access.'
          icon={Inbox}
          tone='blue'
          actions={
            <>
              <Button
                variant='outline'
                disabled={query.isFetching}
                onClick={() => void query.refetch()}
              >
                <RefreshCw className='size-4' />
                Refresh
              </Button>
              <Button
                disabled={!query.data?.unreadCount || read.isPending}
                onClick={() => read.mutate(null)}
              >
                <CheckCheck className='size-4' />
                Mark all read
              </Button>
            </>
          }
        />
        <div className='flex flex-wrap gap-3 rounded-xl border bg-card p-4'>
          <Filter
            label='Read status'
            value={filters.unread ?? ''}
            onChange={(v) => change('unread', v)}
            options={[
              ['', 'All notifications'],
              ['true', 'Unread only'],
            ]}
          />
          <Filter
            label='Severity'
            value={filters.severity ?? ''}
            onChange={(v) => change('severity', v)}
            options={[
              ['', 'All severities'],
              ['info', 'Information'],
              ['warning', 'Needs attention'],
              ['error', 'CI failure'],
            ]}
          />
          <NotificationRepositoryFilter
            value={filters.repository ?? ''}
            repositories={query.data?.repositories ?? []}
            onChange={(v) => change('repository', v)}
          />
          <Filter
            label='Event'
            value={filters.type ?? ''}
            onChange={(v) => change('type', v)}
            options={[['', 'All updates'], ...Object.entries(titles)]}
          />
          <label className='space-y-1 text-xs text-muted-foreground'>
            From
            <Input
              type='date'
              value={filters.from ?? ''}
              onChange={(e) => change('from', e.target.value)}
            />
          </label>
          <label className='space-y-1 text-xs text-muted-foreground'>
            To
            <Input
              type='date'
              value={filters.to ?? ''}
              onChange={(e) => change('to', e.target.value)}
            />
          </label>
        </div>
        {session.isError ? (
          <p role='alert' className='text-destructive'>
            Could not verify your access. Reload when the API is available.
          </p>
        ) : query.isPending ? (
          <p role='status' className='text-muted-foreground'>
            Loading notifications…
          </p>
        ) : query.isError ? (
          <p
            role='alert'
            className='rounded-lg border border-destructive/30 p-4 text-destructive'
          >
            {query.error.message}
          </p>
        ) : !query.data?.enabled ? (
          <p className='rounded-lg border p-6 text-muted-foreground'>
            Notifications are disabled for this deployment. Ask your
            administrator to enable them.
          </p>
        ) : !query.data.items.length ? (
          <div className='rounded-xl border bg-card p-12 text-center'>
            <Inbox className='mx-auto mb-3 size-8 text-teal-500' />
            <h2 className='font-semibold'>No notifications here</h2>
            <p className='mt-2 text-sm text-muted-foreground'>
              New engineering updates will appear here. Try changing your
              filters.
            </p>
          </div>
        ) : (
          <div className='space-y-3'>
            {query.data.items.map((item) => (
              <NotificationItem
                key={item.id}
                item={item}
                busy={read.isPending}
                onRead={(id) => read.mutate(id)}
              />
            ))}
          </div>
        )}
        {read.isError && (
          <p role='alert' className='text-sm text-destructive'>
            Could not update read status. Try again.
          </p>
        )}
        {!!query.data?.total && (
          <div className='flex items-center justify-between gap-3 text-sm'>
            <span className='text-muted-foreground'>
              {query.data.total} notifications · Page {filters.page}
            </span>
            <div className='flex gap-2'>
              <Button
                variant='outline'
                disabled={Number(filters.page) <= 1}
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    page: String(Number(f.page) - 1),
                  }))
                }
              >
                Previous
              </Button>
              <Button
                variant='outline'
                disabled={Number(filters.page) * 25 >= query.data.total}
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    page: String(Number(f.page) + 1),
                  }))
                }
              >
                Next
              </Button>
            </div>
          </div>
        )}
        {query.data?.enabled && <NotificationPreferences />}
        <p className='text-xs text-muted-foreground'>
          These are saved assessment updates. They do not confirm that a pull
          request is ready to merge.
        </p>
      </Main>
    </>
  )
}
function Filter({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: [string, string][]
  onChange: (v: string) => void
}) {
  return (
    <label className='space-y-1 text-xs text-muted-foreground'>
      {label}
      <select
        className='block h-9 max-w-64 rounded-md border bg-background px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring'
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </label>
  )
}
