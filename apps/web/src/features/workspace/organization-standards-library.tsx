import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Server,
  Layers,
  PanelsTopLeft,
  Network,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHelpDrawer } from '@/components/page-help-drawer'
import { StatusBadge } from '@/components/status-badge'
import { governanceRequest } from '../repositories/governance-api'
import type { Pack } from '../repositories/repository-queries'
import { useNavigationSession } from './navigation-session'
import { canPerform } from './scoped-access'

type Version = Pack & { versionId: string; createdAt: string }
type Library = { builtIn: Pack[]; versions: Version[] }
export function OrganizationStandardsLibrary() {
  const session = useNavigationSession()
  const allowed = canPerform(session.data, 'standards.manage')
  const [tab, setTab] = useState('organization')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [editor, setEditor] = useState<{ pack?: Pack; edit: boolean } | null>(
    null
  )
  const [history, setHistory] = useState<string | null>(null)
  const [historyPage, setHistoryPage] = useState(1)
  const [details, setDetails] = useState<Pack | null>(null)
  const query = useQuery({
    queryKey: [
      'organization-standards-library',
      session.data?.identityId,
      session.data?.organizationId,
    ],
    enabled: !!session.data?.identityId,
    retry: false,
    staleTime: 0,
    queryFn: ({ signal }) =>
      governanceRequest<Library>('/standards/library', undefined, signal),
  })
  const data = query.isError ? undefined : query.data
  const latest = new Map<string, Version>()
  for (const version of data?.versions ?? [])
    if (!latest.has(version.id)) latest.set(version.id, version)
  const packs = (
    tab === 'organization' ? [...latest.values()] : (data?.builtIn ?? [])
  ).filter((p) =>
    `${p.title} ${p.description}`.toLowerCase().includes(search.toLowerCase())
  )
  const pages = Math.max(1, Math.ceil(packs.length / 12))
  return (
    <section className='space-y-5'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <Tabs
          value={tab}
          onValueChange={(value) => {
            setTab(value)
            setPage(1)
          }}
        >
          <TabsList>
            <TabsTrigger value='organization'>
              Organization standards
            </TabsTrigger>
            <TabsTrigger value='built-in'>Built-in standards</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className='flex items-center gap-2'>
          {allowed && data && (
            <Button size='sm' onClick={() => setEditor({ edit: false })}>
              <Plus className='size-4' />
              New standard
            </Button>
          )}
          <Button
            size='sm'
            variant='outline'
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw className='size-4' />
            Refresh
          </Button>
          <PageHelpDrawer
            title='Engineering standards'
            sections={[
              {
                title: 'Create and edit',
                content:
                  'Owners and Admins can create organization standards, edit them or copy a built-in standard. Choose the checks that apply; Preflyt keeps their supported evaluation and evidence requirements. New standards start with the baseline checks selected.',
              },
              {
                title: 'Versions and adoption',
                content:
                  'Saving creates a new version. Existing repository selections, policies and assessments keep their saved version. Use Policies → Standards → Edit selection to adopt a version, then review or update the policy. Editing the library does not change GitHub protections.',
              },
              {
                title: 'Supported checks',
                content:
                  'A standard groups existing supported check definitions. It does not add a new scanner, executable command or passing result. Missing required evidence still means incomplete. New check types require a tested adapter.',
              },
            ]}
          />
        </div>
      </div>
      <Input
        aria-label='Filter standards'
        placeholder='Filter standards…'
        value={search}
        onChange={(e) => {
          setSearch(e.target.value)
          setPage(1)
        }}
        className='max-w-sm'
      />
      {query.isPending && <p role='status'>Loading standards…</p>}
      {query.isError && (
        <p role='alert' className='text-destructive'>
          {query.error.message}
        </p>
      )}
      {data && (
        <>
          {!packs.length && (
            <div className='rounded-xl border p-8 text-center'>
              <p className='font-medium'>
                {search
                  ? 'No matching standards'
                  : 'No organization standards yet'}
              </p>
              {!search && (
                <p className='mt-2 text-sm text-muted-foreground'>
                  Create a standard or copy one from Built-in standards.
                </p>
              )}
            </div>
          )}
          <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
            {packs.slice((page - 1) * 12, page * 12).map((pack) => (
              <StandardLibraryCard
                key={pack.id}
                pack={pack}
                organization={tab === 'organization'}
                canEdit={allowed}
                onDetails={() => setDetails(pack)}
                onEdit={() => setEditor({ pack, edit: tab === 'organization' })}
                onHistory={() => {
                  setHistory(pack.id)
                  setHistoryPage(1)
                }}
              />
            ))}
          </div>
          {packs.length > 12 && (
            <nav aria-label='Standard pages' className='flex justify-end gap-3'>
              <Button
                size='sm'
                variant='outline'
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span className='self-center text-xs'>
                Page {page} of {pages}
              </span>
              <Button
                size='sm'
                variant='outline'
                disabled={page >= pages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </nav>
          )}
        </>
      )}
      {allowed && editor && data && (
        <StandardEditor
          key={editor.pack?.id ?? 'new'}
          library={data}
          pack={editor.pack}
          edit={editor.edit}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            await query.refetch()
            setEditor(null)
            setTab('organization')
            setPage(1)
          }}
        />
      )}
      <Dialog
        open={!!history}
        onOpenChange={(open) => {
          if (!open) setHistory(null)
        }}
      >
        <DialogContent className='max-h-[85svh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>Standard version history</DialogTitle>
            <DialogDescription>
              Saved versions stay unchanged.
            </DialogDescription>
          </DialogHeader>
          {data?.versions
            .filter((v) => v.id === history)
            .slice((historyPage - 1) * 10, historyPage * 10)
            .map((v) => (
              <article
                key={v.versionId}
                className='space-y-2 rounded-lg border p-4'
              >
                <h3 className='text-sm font-semibold'>
                  {v.title} · v{v.version}
                </h3>
                <p className='text-xs text-muted-foreground'>{v.description}</p>
                <time className='text-xs'>
                  {new Date(v.createdAt).toLocaleString()}
                </time>
                <ul className='text-xs'>
                  {v.rules.map((r) => (
                    <li key={r.id}>{r.title}</li>
                  ))}
                </ul>
              </article>
            ))}
          {!!data &&
            data.versions.filter((v) => v.id === history).length > 10 && (
              <nav
                aria-label='Standard version pages'
                className='flex justify-end gap-2'
              >
                <Button
                  size='sm'
                  variant='outline'
                  disabled={historyPage <= 1}
                  onClick={() => setHistoryPage(historyPage - 1)}
                >
                  Previous
                </Button>
                <Button
                  size='sm'
                  variant='outline'
                  disabled={
                    historyPage * 10 >=
                    data.versions.filter((v) => v.id === history).length
                  }
                  onClick={() => setHistoryPage(historyPage + 1)}
                >
                  Next
                </Button>
              </nav>
            )}
        </DialogContent>
      </Dialog>
      <Sheet
        open={!!details && !!data}
        onOpenChange={(open) => {
          if (!open) setDetails(null)
        }}
      >
        <SheetContent className='flex flex-col sm:max-w-lg'>
          <SheetHeader>
            <SheetTitle>{details?.title}</SheetTitle>
            <SheetDescription>{details?.description}</SheetDescription>
          </SheetHeader>
          <div className='flex-1 space-y-3 overflow-y-auto px-4 pb-6'>
            {data &&
              details?.rules.map((rule) => (
                <article
                  key={rule.id}
                  className='space-y-2 rounded-lg border p-4'
                >
                  <div className='flex items-start justify-between gap-3'>
                    <h3 className='text-sm font-semibold'>{rule.title}</h3>
                    <StatusBadge
                      tone={rule.capability === 'planned' ? 'neutral' : 'info'}
                    >
                      {rule.capability === 'planned'
                        ? 'Planned'
                        : rule.capability === 'available'
                          ? 'Configuration'
                          : 'CI report'}
                    </StatusBadge>
                  </div>
                  <p className='text-xs text-muted-foreground'>
                    {rule.guidance}
                  </p>
                </article>
              ))}
          </div>
        </SheetContent>
      </Sheet>
    </section>
  )
}
function StandardEditor({
  library,
  pack,
  edit,
  onClose,
  onSaved,
}: {
  library: Library
  pack?: Pack
  edit: boolean
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [title, setTitle] = useState(pack?.title ?? '')
  const [description, setDescription] = useState(pack?.description ?? '')
  const [selected, setSelected] = useState(
    (pack ?? library.builtIn[0])?.rules.map((r) => r.id) ?? []
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const rules = [
    ...new Map(
      library.builtIn.flatMap((p) => p.rules).map((r) => [r.id, r])
    ).values(),
  ]
  async function save() {
    setBusy(true)
    setError('')
    try {
      await governanceRequest(
        edit && pack
          ? `/standards/library/${pack.id}/versions`
          : '/standards/library',
        {
          title,
          description,
          ruleIds: selected,
          expectedVersionId: edit ? (pack as Version).versionId : null,
        }
      )
      await onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the standard.')
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent className='max-h-[85svh] overflow-y-auto sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>
            {edit
              ? 'Edit standard'
              : pack
                ? 'Create an editable copy'
                : 'New engineering standard'}
          </DialogTitle>
          <DialogDescription>
            Save a version for your organization. Existing policies keep their
            saved version.
          </DialogDescription>
        </DialogHeader>
        <form
          className='space-y-4'
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <label className='block space-y-2 text-sm'>
            <span>Name</span>
            <Input
              required
              maxLength={120}
              value={title}
              disabled={busy}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className='block space-y-2 text-sm'>
            <span>Description</span>
            <textarea
              maxLength={2000}
              value={description}
              disabled={busy}
              onChange={(e) => setDescription(e.target.value)}
              className='min-h-20 w-full rounded-md border bg-background p-3'
            />
          </label>
          <fieldset disabled={busy}>
            <legend className='mb-3 text-sm font-semibold'>Checks</legend>
            <div className='space-y-2'>
              {rules.map((rule) => (
                <label
                  key={rule.id}
                  className='flex items-start gap-3 rounded-lg border p-3 text-sm'
                >
                  <input
                    type='checkbox'
                    className='mt-0.5 size-4 shrink-0 accent-primary'
                    checked={selected.includes(rule.id)}
                    onChange={(event) =>
                      setSelected((old) =>
                        event.target.checked
                          ? [...old, rule.id]
                          : old.filter((id) => id !== rule.id)
                      )
                    }
                  />
                  <span className='flex-1'>{rule.title}</span>
                  <StatusBadge
                    tone={rule.capability === 'planned' ? 'neutral' : 'info'}
                  >
                    {rule.capability === 'planned'
                      ? 'Planned'
                      : rule.capability === 'available'
                        ? 'Configuration'
                        : 'CI report'}
                  </StatusBadge>
                </label>
              ))}
            </div>
          </fieldset>
          {error && (
            <p role='alert' className='text-sm text-destructive'>
              {error}
            </p>
          )}
          <div className='flex justify-end gap-2'>
            <Button
              type='button'
              variant='outline'
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type='submit'
              disabled={busy || !title.trim() || !selected.length}
            >
              {busy ? 'Saving…' : 'Save standard'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function StandardLibraryCard({
  pack,
  organization,
  canEdit,
  onEdit,
  onDetails,
  onHistory,
}: {
  pack: Pack
  organization: boolean
  canEdit: boolean
  onEdit: () => void
  onDetails: () => void
  onHistory: () => void
}) {
  const variants: Record<string, { icon: typeof Layers; color: string }> = {
    'baseline-engineering': { icon: Layers, color: 'bg-info/10 text-info' },
    'application-security': {
      icon: ShieldCheck,
      color: 'bg-chart-2/10 text-chart-2',
    },
    'backend-service': { icon: Server, color: 'bg-chart-4/10 text-chart-4' },
    'frontend-application': {
      icon: PanelsTopLeft,
      color: 'bg-chart-3/10 text-chart-3',
    },
    'infrastructure-as-code': {
      icon: Network,
      color: 'bg-chart-5/10 text-chart-5',
    },
  }
  const { icon: Icon, color } = variants[pack.id] ?? {
    icon: Layers,
    color: 'bg-info/10 text-info',
  }
  const configuration = pack.rules.filter(
    (r) => r.capability === 'available'
  ).length
  const reports = pack.rules.filter(
    (r) => r.capability === 'import_only'
  ).length
  const planned = pack.rules.filter((r) => r.capability === 'planned').length
  return (
    <article className='flex flex-col overflow-hidden rounded-xl border bg-card transition-[border-color,box-shadow] duration-150 hover:border-info/30 hover:shadow-sm'>
      <div className='flex-1 space-y-4 p-5'>
        <div className='flex items-start gap-3'>
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${color}`}
          >
            <Icon className='size-5' aria-hidden />
          </span>
          <div className='min-w-0 flex-1'>
            <h2 className='text-sm leading-5 font-semibold'>{pack.title}</h2>
            <p className='mt-1 text-xs text-muted-foreground'>
              {organization ? 'Organization standard' : 'Built-in standard'} · v
              {pack.version}
            </p>
          </div>
        </div>
        <p className='line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground'>
          {pack.description}
        </p>
        <div className='flex flex-wrap gap-2' aria-label='Check support'>
          {!!configuration && (
            <StatusBadge tone='info'>{configuration} configuration</StatusBadge>
          )}
          {!!reports && (
            <StatusBadge tone='info'>
              {reports} CI report{reports === 1 ? '' : 's'}
            </StatusBadge>
          )}
          {!!planned && (
            <StatusBadge tone='neutral'>{planned} planned</StatusBadge>
          )}
        </div>
      </div>
      <div className='flex flex-wrap items-center justify-between gap-2 border-t bg-muted/20 px-4 py-3'>
        <Button
          size='sm'
          variant='ghost'
          className='text-xs'
          onClick={onDetails}
        >
          {pack.rules.length} checks
          <ChevronRight className='size-3.5' aria-hidden />
        </Button>
        <div className='flex gap-1'>
          {organization && (
            <Button
              size='sm'
              variant='ghost'
              className='text-xs'
              onClick={onHistory}
            >
              History
            </Button>
          )}
          {canEdit && (
            <Button
              size='sm'
              variant='outline'
              className='text-xs'
              onClick={onEdit}
            >
              <Pencil className='size-3.5' aria-hidden />
              {organization ? 'Edit' : 'Customize'}
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}
