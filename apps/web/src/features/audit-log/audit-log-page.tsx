import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { History, RefreshCw } from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { AppHeader } from '@/components/layout/app-header'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { PageHelpDrawer } from '@/components/page-help-drawer'
import { useNavigationSession } from '../workspace/navigation-session'
import { canPerform } from '../workspace/scoped-access'
import type { AuditSearch } from './audit-search'

type Entry = {
  id: string
  action: string
  actionLabel: string
  createdAt: string
  actor: { id: string | null; name: string }
  repository: { id: string; name: string } | null
  details: { label: string; value: string }[]
}
type AuditLog = {
  items: Entry[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
  repositories: { id: string; name: string }[]
  actions: { id: string; label: string }[]
}
export function AuditLogPage() {
  const session = useNavigationSession()
  const search = useSearch({ from: '/_authenticated/audit-log' })
  return (
    <>
      <AppHeader breadcrumbs={[{ label: 'Audit log' }]} />
      <AuditContent
        key={`${session.data?.organizationId ?? 'loading'}:${JSON.stringify(search)}`}
        permitted={canPerform(session.data, 'audit.read')}
        checking={session.isPending}
        organizationId={session.data?.organizationId}
      />
    </>
  )
}
function AuditContent({
  permitted,
  checking,
  organizationId,
}: {
  permitted: boolean
  checking: boolean
  organizationId?: string
}) {
  const search = useSearch({ from: '/_authenticated/audit-log' })
  const navigate = useNavigate()
  const [pageSize, setPageSize] = useState(10)
  const [filters, setFilters] = useState(search)
  const [selected, setSelected] = useState<Entry | null>(null)
  const [validation, setValidation] = useState('')
  const query = useQuery({
    queryKey: ['audit-log', organizationId, search, pageSize],
    enabled: permitted,
    retry: false,
    queryFn: async ({ signal }): Promise<AuditLog> => {
      const params = new URLSearchParams(
        Object.entries(search).map(([key, value]) => [key, String(value)])
      )
      params.set('pageSize', String(pageSize))
      const response = await fetch(`${API_BASE_URL}/audit-log?${params}`, {
        credentials: 'include',
        cache: 'no-store',
        signal,
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(
          typeof body.message === 'string'
            ? body.message
            : 'Audit log could not be loaded. Try again.'
        )
      }
      return response.json()
    },
  })
  const data = query.data
  const update = (next: AuditSearch) => {
    setSelected(null)
    setFilters(next)
    void navigate({ to: '/audit-log', search: next })
  }
  const active =
    search.repository !== 'all' ||
    search.action !== 'all' ||
    !!search.from ||
    !!search.to
  const dropdown = (
    key: 'repository' | 'action',
    label: string,
    values: { id: string; label: string }[]
  ) => (
    <div className='min-w-0 space-y-1.5'>
      <Label htmlFor={`audit-${key}`}>{label}</Label>
      <Select
        value={filters[key]}
        onValueChange={(value) => setFilters({ ...filters, [key]: value })}
      >
        <SelectTrigger id={`audit-${key}`} className='w-full min-w-0'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='all'>
            All {key === 'action' ? 'actions' : 'repositories'}
          </SelectItem>
          {!values.some((v) => v.id === filters[key]) &&
            filters[key] !== 'all' && (
              <SelectItem value={filters[key]}>{filters[key]}</SelectItem>
            )}
          {values.map((value) => (
            <SelectItem key={value.id} value={value.id}>
              {value.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
  return (
    <Main className='space-y-5'>
      <PageHeader
        title='Audit log'
        section='Administration'
        icon={History}
        description='See who changed what in your workspace.'
        actions={
          <>
            <Button
              variant='outline'
              size='sm'
              disabled={!permitted || query.isFetching}
              onClick={() => void query.refetch()}
            >
              <RefreshCw className='size-4' aria-hidden />
              Refresh
            </Button>
            <PageHelpDrawer
              title='Audit log'
              sections={[
                {
                  title: 'What is recorded',
                  content:
                    'Recorded Preflyt actions include access changes, policies, standards, workflow connections, assessments, AI reviews and merge protection. This is workspace activity, not GitHub’s complete audit history.',
                },
                {
                  title: 'Access and details',
                  content:
                    'Owners and Admins can read workspace activity. Auditors see workspace events and events for repositories they can access. Credentials and raw metadata are excluded. Historical records without a verified workspace or repository reference are omitted.',
                },
                {
                  title: 'Dates and pages',
                  content:
                    'Date filters include the entire selected days in UTC. Times in the table use your local time; event details also show UTC. Results are newest first, 20 events per page. Access Control Activity remains focused on access changes.',
                },
              ]}
            />
          </>
        }
      />
      {checking ? (
        <p role='status'>Checking access…</p>
      ) : !permitted ? (
        <p role='alert' className='rounded-xl border p-4 text-sm'>
          You need Owner, Admin or Auditor access to view the Audit log. Ask
          your workspace administrator.
        </p>
      ) : (
        <>
          <form
            className='rounded-xl border p-4'
            onSubmit={(event) => {
              event.preventDefault()
              if (filters.from && filters.to && filters.from > filters.to) {
                setValidation('Start date must be on or before end date.')
                return
              }
              setValidation('')
              update({ ...filters, page: 1 })
            }}
          >
            <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_10rem_10rem_auto]'>
              {dropdown(
                'repository',
                'Repository',
                data?.repositories.map((r) => ({ id: r.id, label: r.name })) ??
                  []
              )}
              {dropdown('action', 'Action', data?.actions ?? [])}
              <div className='space-y-1.5'>
                <Label htmlFor='audit-from'>From (UTC)</Label>
                <Input
                  id='audit-from'
                  type='date'
                  value={filters.from}
                  onChange={(e) =>
                    setFilters({ ...filters, from: e.target.value })
                  }
                  className='min-w-0'
                />
              </div>
              <div className='space-y-1.5'>
                <Label htmlFor='audit-to'>To (UTC)</Label>
                <Input
                  id='audit-to'
                  type='date'
                  value={filters.to}
                  onChange={(e) =>
                    setFilters({ ...filters, to: e.target.value })
                  }
                  className='min-w-0'
                />
              </div>
              <div className='flex flex-wrap items-end gap-2'>
                <Button type='submit' size='sm'>
                  Apply filters
                </Button>
                {(active ||
                  filters.action !== 'all' ||
                  filters.repository !== 'all' ||
                  filters.from ||
                  filters.to) && (
                  <Button
                    type='button'
                    size='sm'
                    variant='ghost'
                    onClick={() => {
                      setValidation('')
                      update({
                        page: 1,
                        repository: 'all',
                        action: 'all',
                        from: '',
                        to: '',
                      })
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
            {validation && (
              <p role='alert' className='mt-3 text-sm text-destructive'>
                {validation}
              </p>
            )}
          </form>
          {query.isPending ? (
            <p
              role='status'
              className='rounded-xl border p-8 text-center text-sm text-muted-foreground'
            >
              Loading audit events…
            </p>
          ) : query.isError ? (
            <div role='alert' className='rounded-xl border p-4 text-sm'>
              <p>{query.error.message}</p>
              <Button
                variant='outline'
                size='sm'
                className='mt-3'
                onClick={() => void query.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : (
            data && (
              <section
                aria-label='Audit events'
                className='overflow-hidden rounded-xl border'
              >
                <Table
                  pagination={{
                    page: search.page,
                    pageSize,
                    total: data.total,
                    onPageChange: (page) => update({ ...search, page }),
                    onPageSizeChange: (size) => {
                      setPageSize(size)
                      update({ ...search, page: 1 })
                    },
                  }}
                >
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Actor</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Repository</TableHead>
                      <TableHead className='text-right'>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className='text-xs whitespace-nowrap text-muted-foreground'>
                          <time dateTime={entry.createdAt}>
                            {new Date(entry.createdAt).toLocaleString()}
                          </time>
                        </TableCell>
                        <TableCell className='max-w-52 break-words whitespace-normal'>
                          {entry.actor.name}
                        </TableCell>
                        <TableCell className='min-w-44 whitespace-normal'>
                          {entry.actionLabel}
                        </TableCell>
                        <TableCell className='max-w-64 break-words whitespace-normal'>
                          {entry.repository ? (
                            <Link
                              className='text-primary underline-offset-4 hover:underline'
                              to='/repositories/$repositoryId'
                              params={{ repositoryId: entry.repository.id }}
                            >
                              {entry.repository.name}
                            </Link>
                          ) : (
                            <span className='text-muted-foreground'>
                              Workspace
                            </span>
                          )}
                        </TableCell>
                        <TableCell className='text-right'>
                          <Button
                            size='sm'
                            variant='ghost'
                            aria-label={`View ${entry.actionLabel} details`}
                            onClick={() => setSelected(entry)}
                          >
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {!data.items.length && (
                  <p className='p-10 text-center text-sm text-muted-foreground'>
                    {active
                      ? 'No events match these filters. Clear or adjust the filters.'
                      : search.page > 1
                        ? 'No events on this page. Go to the previous page or refresh.'
                        : 'No workspace activity recorded yet.'}
                  </p>
                )}
              </section>
            )
          )}
        </>
      )}
      <Sheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
      >
        <SheetContent className='w-full overflow-y-auto sm:max-w-lg'>
          <SheetHeader>
            <SheetTitle>Event details</SheetTitle>
            <SheetDescription>{selected?.actionLabel}</SheetDescription>
          </SheetHeader>
          {selected && (
            <dl className='space-y-4 px-4 pb-6 text-sm'>
              {[
                { label: 'Actor', value: selected.actor.name },
                {
                  label: 'Time (UTC)',
                  value: new Date(selected.createdAt).toISOString(),
                },
                {
                  label: 'Repository',
                  value: selected.repository?.name ?? 'Workspace',
                },
                ...selected.details,
                { label: 'Action identifier', value: selected.action },
                { label: 'Event ID', value: selected.id },
                ...(selected.actor.id
                  ? [{ label: 'Actor ID', value: selected.actor.id }]
                  : []),
              ].map((detail) => (
                <div key={detail.label}>
                  <dt className='text-xs text-muted-foreground'>
                    {detail.label}
                  </dt>
                  <dd className='mt-1 break-words'>{detail.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </SheetContent>
      </Sheet>
    </Main>
  )
}
