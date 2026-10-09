import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  UsersRound,
  Plus,
  RefreshCw,
  ArrowRight,
  Pencil,
  ShieldCheck,
} from 'lucide-react'
import { siGithub } from 'simple-icons'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { AppHeader } from '@/components/layout/app-header'
import { Main } from '@/components/layout/main'
import { PageHelpDrawer } from '@/components/page-help-drawer'
import { StatusBadge } from '@/components/status-badge'
import { governanceRequest } from '../repositories/governance-api'
import { useNavigationSession } from '../workspace/navigation-session'
import { canPerform } from '../workspace/scoped-access'

function Github({ className }: { className?: string }) {
  return (
    <svg
      viewBox='0 0 24 24'
      fill='currentColor'
      className={className}
      aria-hidden='true'
    >
      <path d={siGithub.path} />
    </svg>
  )
}

type Team = {
  id: string
  name: string
  description: string
  source: string
  syncState: string
  syncedAt: string | null
  revision: number
  members: number
  repositories: number
  pendingRepositories: number
  assignments: number
}
type Ref = { id: string; version: string }
type Options = {
  members: { id: string; name: string }[]
  repositories: { id: string; name: string; defaultBranch: string | null }[]
  standards: (Ref & { title: string })[]
  installations: { id: string; name: string }[]
}
type Detail = Omit<Team, 'members' | 'repositories' | 'assignments'> & {
  members: { id: string; name: string }[]
  repositories: {
    id: string
    name: string
    policyScopeEnabled: boolean
    providerPresent: boolean
    origin: string
  }[]
  assignments: {
    id: string
    branchRef: string
    profile: string
    packs: Ref[]
    createdAt: string
  }[]
  impact: {
    githubId: string
    name: string
    branchRef: string | null
    state: string
    revision: number | null
    current: boolean
  }[]
  activity: { id: string; event: string; createdAt: string }[]
}
type Impact = {
  previewHash: string
  conflicts: boolean
  repositories: {
    githubId: string
    name: string
    addedChecks: string[]
    conflicts: string[]
    profile: string
    sources: { teamId: string }[]
  }[]
}
const help = [
  {
    title: 'Teams and access',
    content:
      'Create a Preflyt team or import a GitHub team. Local membership groups people; it never grants Preflyt roles, repository access or GitHub permissions. Repository lists and policy counts include only repositories you can access.',
  },
  {
    title: 'GitHub import and sync',
    content:
      'Link your organization in Access Control first. Your GitHub App needs Organization Members: read. Imported identity and members are read-only. Imported repositories start outside policy scope. Sync adds new repositories for review, retains removed associations as warnings, and never expands approved scope. Sync is manual in this release; synchronize before applying policies and at least every 24 hours.',
  },
  {
    title: 'Assign standards and review impact',
    content:
      'Assignments pin standard versions for an explicit branch. Requirements combine with existing repository standards and other scoped teams; the strongest profile applies. Conflicting versions block assignment. Apply creates saved repository standards and policy drafts in one transaction. New selections require review of CI source mappings and a fresh assessment. Approve and publish each draft in Policies; activate GitHub rulesets separately.',
  },
  {
    title: 'Changes and limits',
    content:
      'Existing requirements are retained when adding assignments; this release does not support removing inherited requirements or automatic policy upgrades. Team policy scope changes invalidate affected draft publication and check publication until scope is reviewed and assignments are reapplied. Historical assessments retain their saved team sources. Teams support up to 100 scoped repositories and members, five composed standard packs and 100 assignments. Nested GitHub teams do not expand policy scope automatically.',
  },
]
function date(value: string | null) {
  return value ? new Date(value).toLocaleString() : '—'
}
function Paging({
  page,
  total,
  size = 10,
  onChange,
}: {
  page: number
  total: number
  size?: number
  onChange: (p: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / size))
  return (
    <div className='flex items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground'>
      <span>
        {total} results · Page {page} of {pages}
      </span>
      <div className='flex gap-2'>
        <Button
          size='sm'
          variant='outline'
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          size='sm'
          variant='outline'
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
function PickList({
  label,
  items,
  selected,
  onChange,
}: {
  label: string
  items: { id: string; name: string }[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const filtered = items.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase())
  )
  return (
    <section className='space-y-3'>
      <h3 className='text-sm font-semibold'>
        {label}{' '}
        <span className='font-normal text-muted-foreground'>
          ({selected.length} selected)
        </span>
      </h3>
      <Input
        aria-label={`Filter ${label.toLowerCase()}`}
        placeholder={`Filter ${label.toLowerCase()}…`}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value)
          setPage(1)
        }}
      />
      <div className='rounded-lg border'>
        {filtered.slice((page - 1) * 10, page * 10).map((i) => (
          <label
            key={i.id}
            className='flex min-h-10 cursor-pointer items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0'
          >
            <input
              type='checkbox'
              checked={selected.includes(i.id)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...selected, i.id]
                    : selected.filter((id) => id !== i.id)
                )
              }
            />
            <span className='min-w-0 break-words'>{i.name}</span>
          </label>
        ))}
        {!filtered.length && (
          <p className='p-3 text-sm text-muted-foreground'>
            No matching {label.toLowerCase()}.
          </p>
        )}
      </div>
      <Paging page={page} total={filtered.length} onChange={setPage} />
    </section>
  )
}
export function TeamsPage() {
  const session = useNavigationSession()
  return (
    <>
      <AppHeader breadcrumbs={[{ label: 'Teams' }]} />
      <Main>
        {session.isPending ? (
          <p role='status'>Checking access…</p>
        ) : session.isError ? (
          <p role='alert'>Access details unavailable. Refresh and try again.</p>
        ) : !canPerform(session.data, 'team.read') ? (
          <p role='alert'>You do not have permission to view teams.</p>
        ) : (
          <TeamsWorkspace
            key={`${session.data?.identityId}:${session.data?.organizationId}`}
            canManage={canPerform(session.data, 'team.manage')}
            canImport={canPerform(session.data, 'team.import')}
            canAssign={canPerform(session.data, 'team.policy.assign')}
            scopeKey={`${session.data?.identityId}:${session.data?.organizationId}`}
          />
        )}
      </Main>
    </>
  )
}
export function TeamsWorkspace({
  canManage,
  canImport,
  canAssign,
  scopeKey,
}: {
  canManage: boolean
  canImport: boolean
  canAssign: boolean
  scopeKey: string
}) {
  const client = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [id, setId] = useState<string | null>(null)
  const [editor, setEditor] = useState<Detail | 'new' | null>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const query = useQuery({
    queryKey: ['teams', scopeKey, page, search],
    retry: false,
    queryFn: ({ signal }) =>
      governanceRequest<{ teams: Team[]; total: number; pageSize: number }>(
        `/teams?page=${page}&q=${encodeURIComponent(search)}`,
        undefined,
        signal
      ),
  })
  const options = useQuery({
    queryKey: ['team-options', scopeKey],
    retry: false,
    queryFn: ({ signal }) =>
      governanceRequest<Options>('/teams/options', undefined, signal),
  })
  const detail = useQuery({
    queryKey: ['team-detail', scopeKey, id],
    enabled: !!id,
    retry: false,
    queryFn: ({ signal }) =>
      governanceRequest<Detail>(`/teams/${id}`, undefined, signal),
  })
  async function refresh() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['teams'] }),
      client.invalidateQueries({ queryKey: ['team-detail'] }),
      client.invalidateQueries({ queryKey: ['team-options'] }),
    ])
  }
  async function sync() {
    if (!id) return
    setBusy(true)
    setError('')
    try {
      await governanceRequest(`/teams/${id}/sync`, {})
      setNotice(
        'GitHub team synchronized. Review repository scope before applying policies.'
      )
      await refresh()
    } catch (e) {
      setError((e as Error).message)
      await refresh()
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className='space-y-6'>
      <header className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h1 className='flex items-center gap-2 text-2xl font-semibold tracking-tight'>
            <UsersRound className='size-6 text-muted-foreground' />
            Teams
          </h1>
          <p className='mt-1 text-sm text-muted-foreground'>
            Manage teams, repository scope and shared engineering standards.
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button
            size='sm'
            variant='outline'
            disabled={query.isFetching}
            onClick={() => void refresh()}
          >
            <RefreshCw className='size-4' />
            Refresh
          </Button>
          <PageHelpDrawer title='Teams' sections={help} />
        </div>
      </header>
      {(error || query.isError || options.isError) && (
        <p
          role='alert'
          className='rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive'
        >
          {error || (query.error ?? options.error)?.message}
        </p>
      )}
      {notice && (
        <p role='status' className='rounded-lg border p-3 text-sm'>
          {notice}
        </p>
      )}
      <div className='flex flex-wrap justify-between gap-3'>
        <Input
          className='max-w-sm'
          aria-label='Filter teams'
          placeholder='Filter teams…'
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
        />
        <div className='flex gap-2'>
          {canImport && (
            <Button
              variant='outline'
              size='sm'
              disabled={!options.data}
              onClick={() => setImporting(true)}
            >
              <Github className='size-4' />
              Import from GitHub
            </Button>
          )}
          {canManage && (
            <Button
              size='sm'
              disabled={!options.data}
              onClick={() => setEditor('new')}
            >
              <Plus className='size-4' />
              Create team
            </Button>
          )}
        </div>
      </div>
      <div className='overflow-x-auto rounded-xl border'>
        <table className='w-full text-left text-sm'>
          <thead className='bg-muted/40 text-muted-foreground'>
            <tr>
              {[
                'Team',
                'Source',
                'Members',
                'Policy scope',
                'Assignments',
                'Sync',
                '',
              ].map((h) => (
                <th key={h} className='px-4 py-3 font-medium whitespace-nowrap'>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!query.isError &&
              query.data?.teams.map((t) => (
                <tr key={t.id} className='border-t'>
                  <td className='px-4 py-3'>
                    <button
                      className='text-left font-medium hover:underline focus-visible:underline'
                      onClick={() => setId(t.id)}
                    >
                      {t.name}
                    </button>
                  </td>
                  <td className='px-4 py-3'>
                    <span className='inline-flex items-center gap-2'>
                      {t.source === 'GITHUB' && <Github className='size-4' />}
                      {t.source === 'GITHUB' ? 'GitHub' : 'Preflyt'}
                    </span>
                  </td>
                  <td className='px-4 py-3 tabular-nums'>{t.members}</td>
                  <td className='px-4 py-3 tabular-nums'>
                    {t.repositories} repositories
                    {t.pendingRepositories > 0 && (
                      <div className='mt-1 text-xs text-muted-foreground'>
                        {t.pendingRepositories} need review
                      </div>
                    )}
                  </td>
                  <td className='px-4 py-3 tabular-nums'>{t.assignments}</td>
                  <td className='px-4 py-3'>
                    <StatusBadge
                      tone={
                        t.syncState === 'STALE'
                          ? 'warning'
                          : t.source === 'LOCAL'
                            ? 'neutral'
                            : 'info'
                      }
                    >
                      {t.source === 'LOCAL'
                        ? 'Local team'
                        : t.syncState === 'STALE'
                          ? 'Sync needed'
                          : 'Synced'}
                    </StatusBadge>
                    {t.syncedAt && (
                      <div className='mt-1 text-xs whitespace-nowrap text-muted-foreground'>
                        {date(t.syncedAt)}
                      </div>
                    )}
                  </td>
                  <td className='px-4 py-3'>
                    <Button
                      size='sm'
                      variant='ghost'
                      aria-label={`Open ${t.name}`}
                      onClick={() => setId(t.id)}
                    >
                      <ArrowRight className='size-4' />
                    </Button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {query.isPending && (
          <p role='status' className='p-8 text-sm'>
            Loading teams…
          </p>
        )}
        {!query.isPending && !query.isError && !query.data?.teams.length && (
          <div className='space-y-2 p-10 text-center'>
            <UsersRound className='mx-auto size-8 text-muted-foreground' />
            <h2 className='font-semibold'>
              {search ? 'No matching teams' : 'No teams yet'}
            </h2>
            <p className='text-sm text-muted-foreground'>
              Create a team or import one from your connected GitHub
              organization.
            </p>
          </div>
        )}
      </div>
      {query.data && !query.isError && (
        <Paging
          page={page}
          total={query.data.total}
          size={20}
          onChange={setPage}
        />
      )}
      <Dialog
        open={!!id}
        onOpenChange={(open) => {
          if (!open) setId(null)
        }}
      >
        <DialogContent className='flex max-h-[88svh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl'>
          <DialogHeader className='border-b p-5'>
            <DialogTitle>{detail.data?.name ?? 'Team'}</DialogTitle>
            <DialogDescription>
              {detail.data?.source === 'GITHUB'
                ? 'GitHub team · membership managed in GitHub'
                : 'Preflyt team · membership does not grant access'}
            </DialogDescription>
          </DialogHeader>
          <div className='min-h-0 flex-1 overflow-y-auto p-5'>
            {detail.isPending ? (
              <p role='status'>Loading team…</p>
            ) : detail.isError ? (
              <p role='alert'>{detail.error.message}</p>
            ) : (
              detail.data && (
                <TeamDetail
                  key={`${id}:${detail.data.revision}`}
                  team={detail.data}
                  options={options.data}
                  canManage={canManage}
                  canAssign={canAssign}
                  onEdit={() => setEditor(detail.data!)}
                  onApplied={async () => {
                    setNotice(
                      'Assignment saved. Review, approve and publish the repository drafts in Policies.'
                    )
                    await refresh()
                  }}
                />
              )
            )}
          </div>
          {error && (
            <p role='alert' className='px-5 py-3 text-sm text-destructive'>
              {error}
            </p>
          )}
          <div className='flex justify-end gap-2 border-t p-4'>
            {detail.data?.source === 'GITHUB' && canImport && (
              <Button
                variant='outline'
                size='sm'
                disabled={busy}
                onClick={() => void sync()}
              >
                <RefreshCw className='size-4' />
                {busy ? 'Syncing…' : 'Sync GitHub team'}
              </Button>
            )}
            <Button size='sm' variant='outline' onClick={() => setId(null)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {editor && options.data && (
        <TeamEditor
          key={editor === 'new' ? 'new' : editor.revision}
          team={editor === 'new' ? undefined : editor}
          options={options.data}
          onClose={() => setEditor(null)}
          onSaved={async (teamId) => {
            setEditor(null)
            setId(teamId)
            await refresh()
          }}
        />
      )}
      {importing && options.data && (
        <ImportTeams
          options={options.data}
          onClose={() => setImporting(false)}
          onImported={async (teamId) => {
            setImporting(false)
            setId(teamId)
            await refresh()
          }}
        />
      )}
    </div>
  )
}
function TeamEditor({
  team,
  options,
  onClose,
  onSaved,
}: {
  team?: Detail
  options: Options
  onClose: () => void
  onSaved: (id: string) => Promise<void>
}) {
  const [name, setName] = useState(team?.name ?? '')
  const [description, setDescription] = useState(team?.description ?? '')
  const [members, setMembers] = useState(
    team?.source === 'GITHUB' ? [] : (team?.members.map((m) => m.id) ?? [])
  )
  const [repos, setRepos] = useState(
    team?.repositories.filter((r) => r.policyScopeEnabled).map((r) => r.id) ??
      []
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const imported = team?.source === 'GITHUB'
  const available = imported
    ? options.repositories.filter((r) =>
        team.repositories.some(
          (scope) => scope.id === r.id && scope.providerPresent
        )
      )
    : options.repositories
  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await governanceRequest<{ id: string }>(
        team ? `/teams/${team.id}/edit` : '/teams',
        {
          name,
          description,
          memberIds: members,
          repositoryIds: repos,
          expectedRevision: team?.revision ?? 0,
        }
      )
      await onSaved(result.id)
    } catch (e) {
      setError((e as Error).message)
    } finally {
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
      <DialogContent className='flex max-h-[88svh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl'>
        <DialogHeader className='border-b p-5'>
          <DialogTitle>{team ? 'Edit team scope' : 'Create team'}</DialogTitle>
          <DialogDescription>
            {imported
              ? 'Approve the repositories that should receive this team’s policies.'
              : 'Group existing organization members and select repositories for team policies.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void save(e)} className='flex min-h-0 flex-col'>
          <div className='min-h-0 space-y-5 overflow-y-auto p-5'>
            {error && (
              <p role='alert' className='text-sm text-destructive'>
                {error}
              </p>
            )}
            <div className='grid gap-4 md:grid-cols-2'>
              <label className='space-y-2 text-sm font-medium'>
                Name
                <Input
                  required
                  maxLength={120}
                  value={name}
                  disabled={imported || busy}
                  placeholder='Platform Engineering'
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className='space-y-2 text-sm font-medium'>
                Description
                <Input
                  maxLength={2000}
                  value={description}
                  disabled={imported || busy}
                  placeholder='Services, delivery and platform reliability'
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
            </div>
            <fieldset
              disabled={busy}
              className={`grid gap-6 ${imported ? '' : 'md:grid-cols-2'}`}
            >
              {!imported && (
                <PickList
                  label='Members'
                  items={options.members}
                  selected={members}
                  onChange={setMembers}
                />
              )}
              <PickList
                label='Repository policy scope'
                items={available}
                selected={repos}
                onChange={setRepos}
              />
            </fieldset>
            {team && (
              <p className='rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm'>
                Changing policy scope requires reviewing and reapplying affected
                assignments before publishing checks.
              </p>
            )}
          </div>
          <div className='flex justify-end gap-2 border-t p-4'>
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
              disabled={busy || members.length > 100 || repos.length > 100}
            >
              {busy ? 'Saving…' : team ? 'Save scope' : 'Create team'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
function TeamDetail({
  team,
  options,
  canManage,
  canAssign,
  onEdit,
  onApplied,
}: {
  team: Detail
  options?: Options
  canManage: boolean
  canAssign: boolean
  onEdit: () => void
  onApplied: () => Promise<void>
}) {
  const [tab, setTab] = useState('overview')
  const [page, setPage] = useState(1)
  const rows =
    tab === 'members'
      ? team.members
      : tab === 'repositories'
        ? team.repositories
        : tab === 'impact'
          ? team.impact
          : tab === 'activity'
            ? team.activity
            : team.assignments
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        setTab(value)
        setPage(1)
      }}
      className='gap-5'
    >
      <div className='overflow-x-auto'>
        <TabsList>
          {[
            ['overview', 'Overview'],
            ['members', 'Members'],
            ['repositories', 'Repositories'],
            ['policies', 'Standards & policies'],
            ['impact', 'Effective impact'],
            ['activity', 'Activity'],
          ].map(([value, title]) => (
            <TabsTrigger key={value} value={value}>
              {title}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <TabsContent value='overview'>
        <div className='grid gap-4 sm:grid-cols-3'>
          {[
            ['Members', team.members.length],
            [
              'Repositories in policy scope',
              team.repositories.filter((r) => r.policyScopeEnabled).length,
            ],
            ['Saved assignments', team.assignments.length],
          ].map(([title, value]) => (
            <div key={title} className='rounded-xl border p-4'>
              <div className='text-xs text-muted-foreground'>{title}</div>
              <div className='mt-2 text-2xl font-semibold tabular-nums'>
                {value}
              </div>
            </div>
          ))}
        </div>
        <p className='my-4 text-sm text-muted-foreground'>
          {team.description || 'No description added.'}
        </p>
        <div className='flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4'>
          <span className='text-sm'>
            {team.source === 'GITHUB'
              ? `Last GitHub sync: ${date(team.syncedAt)}`
              : 'Membership and policy scope managed in Preflyt'}
          </span>
          {canManage && (
            <Button size='sm' variant='outline' onClick={onEdit}>
              <Pencil className='size-4' />
              Edit scope
            </Button>
          )}
        </div>
        {team.syncState === 'STALE' && (
          <p role='alert' className='mt-3 text-sm text-destructive'>
            GitHub sync needs attention. Previous scope is preserved; sync
            before applying policies.
          </p>
        )}
      </TabsContent>
      <TabsContent value='members' className='space-y-3'>
        <div className='rounded-lg border'>
          {team.members.slice((page - 1) * 10, page * 10).map((m) => (
            <div
              key={m.id}
              className='border-b px-4 py-3 text-sm last:border-b-0'
            >
              {m.name}
            </div>
          ))}
          {!team.members.length && (
            <p className='p-5 text-sm text-muted-foreground'>
              No members recorded.
            </p>
          )}
        </div>
      </TabsContent>
      <TabsContent value='repositories' className='space-y-3'>
        {canManage && (
          <div className='flex justify-end'>
            <Button size='sm' variant='outline' onClick={onEdit}>
              <Pencil className='size-4' />
              Edit policy scope
            </Button>
          </div>
        )}
        <div className='overflow-x-auto rounded-lg border'>
          <table className='w-full text-left text-sm'>
            <thead className='bg-muted/40'>
              <tr>
                <th className='p-3 font-medium'>Repository</th>
                <th className='p-3 font-medium'>Policy scope</th>
                <th className='p-3 font-medium'>GitHub access</th>
              </tr>
            </thead>
            <tbody>
              {team.repositories.slice((page - 1) * 10, page * 10).map((r) => (
                <tr key={r.id} className='border-t'>
                  <td className='p-3'>{r.name}</td>
                  <td className='p-3'>
                    <StatusBadge
                      tone={r.policyScopeEnabled ? 'info' : 'neutral'}
                    >
                      {r.policyScopeEnabled ? 'Approved' : 'Not selected'}
                    </StatusBadge>
                  </td>
                  <td className='p-3'>
                    {r.origin === 'MANUAL' ? (
                      'Local association'
                    ) : (
                      <StatusBadge
                        tone={r.providerPresent ? 'neutral' : 'warning'}
                      >
                        {r.providerPresent
                          ? 'Recorded'
                          : 'Removed · review needed'}
                      </StatusBadge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!team.repositories.length && (
            <p className='p-5 text-sm text-muted-foreground'>
              No authorized repository associations.
            </p>
          )}
        </div>
      </TabsContent>
      <TabsContent value='policies' className='space-y-5'>
        {canAssign && options && (
          <Assignment team={team} options={options} onApplied={onApplied} />
        )}
        <h3 className='text-sm font-semibold'>Saved assignments</h3>
        <div className='rounded-lg border'>
          {team.assignments.slice((page - 1) * 10, page * 10).map((a) => (
            <div
              key={a.id}
              className='flex flex-wrap items-center justify-between gap-2 border-b p-3 text-sm last:border-b-0'
            >
              <span className='font-medium'>
                {a.branchRef.replace('refs/heads/', '')} ·{' '}
                {a.profile.toLowerCase()} · {a.packs.length} standards
              </span>
              <span className='text-xs text-muted-foreground'>
                {date(a.createdAt)}
              </span>
            </div>
          ))}
          {!team.assignments.length && (
            <p className='p-5 text-sm text-muted-foreground'>
              No standards assigned. Approve repository scope, then preview an
              assignment.
            </p>
          )}
        </div>
        <div className='flex justify-end'>
          <Button size='sm' variant='outline' asChild>
            <Link to='/policies'>
              Review repository drafts
              <ArrowRight className='size-4' />
            </Link>
          </Button>
        </div>
      </TabsContent>
      <TabsContent value='impact' className='space-y-3'>
        <div className='overflow-x-auto rounded-lg border'>
          <table className='w-full text-left text-sm'>
            <thead className='bg-muted/40'>
              <tr>
                <th className='p-3 font-medium'>Repository</th>
                <th className='p-3 font-medium'>Branch</th>
                <th className='p-3 font-medium'>Policy status</th>
                <th className='p-3 font-medium'>Review</th>
              </tr>
            </thead>
            <tbody>
              {team.impact?.slice((page - 1) * 10, page * 10).map((row) => (
                <tr key={row.githubId} className='border-t'>
                  <td className='p-3'>{row.name}</td>
                  <td className='p-3'>
                    {row.branchRef?.replace('refs/heads/', '') ?? '—'}
                  </td>
                  <td className='p-3'>
                    <StatusBadge
                      tone={
                        !row.current
                          ? 'warning'
                          : row.state === 'PUBLISHED'
                            ? 'info'
                            : 'neutral'
                      }
                    >
                      {row.state === 'NOT_ASSIGNED'
                        ? 'Not assigned'
                        : !row.current
                          ? 'Needs review'
                          : row.state === 'PUBLISHED'
                            ? 'Published'
                            : row.state === 'APPROVED'
                              ? 'Approved'
                              : 'Draft'}
                    </StatusBadge>
                    {row.revision && (
                      <span className='ml-2 text-xs text-muted-foreground'>
                        v{row.revision}
                      </span>
                    )}
                  </td>
                  <td className='p-3'>
                    <Button size='sm' variant='outline' asChild>
                      <Link
                        to='/policies'
                        search={{ repository: row.githubId }}
                      >
                        Open policies
                        <ArrowRight className='size-4' />
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!team.impact?.length && (
            <p className='p-5 text-sm text-muted-foreground'>
              Approve repository policy scope to review affected repositories.
            </p>
          )}
        </div>
      </TabsContent>
      <TabsContent value='activity'>
        <p className='mb-3 text-xs text-muted-foreground'>
          Most recent 100 team events.
        </p>
        <div className='rounded-lg border'>
          {team.activity.slice((page - 1) * 10, page * 10).map((a) => (
            <div
              key={a.id}
              className='flex flex-wrap items-center justify-between gap-2 border-b p-3 text-sm last:border-b-0'
            >
              <span>{a.event.replace('team.', '').replace(/_/g, ' ')}</span>
              <span className='text-xs text-muted-foreground'>
                {date(a.createdAt)}
              </span>
            </div>
          ))}
          {!team.activity.length && (
            <p className='p-5 text-sm text-muted-foreground'>
              No team activity yet.
            </p>
          )}
        </div>
      </TabsContent>
      {tab !== 'overview' && (
        <Paging page={page} total={rows.length} onChange={setPage} />
      )}
    </Tabs>
  )
}
function Assignment({
  team,
  options,
  onApplied,
}: {
  team: Detail
  options: Options
  onApplied: () => Promise<void>
}) {
  const [branch, setBranch] = useState(
    options.repositories.find((r) =>
      team.repositories.some(
        (scope) => scope.id === r.id && scope.policyScopeEnabled
      )
    )?.defaultBranch ?? 'main'
  )
  const [profile, setProfile] = useState('RECOMMENDED')
  const [packs, setPacks] = useState<string[]>(['baseline-engineering@1.0.0'])
  const [impact, setImpact] = useState<Impact | null>(null)
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const input = {
    branchRef: `refs/heads/${branch}`,
    profile,
    packs: packs.map((value) => {
      const [id, version] = value.split('@')
      return { id, version }
    }),
  }
  async function run(apply = false) {
    setBusy(true)
    setError('')
    try {
      if (apply) {
        await governanceRequest(`/teams/${team.id}/assign`, {
          ...input,
          expectedPreviewHash: impact?.previewHash,
        })
        setImpact(null)
        await onApplied()
      } else {
        setImpact(
          await governanceRequest<Impact>(`/teams/${team.id}/preview`, input)
        )
        setPage(1)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className='space-y-4 rounded-xl border p-4'>
      <div className='flex items-center gap-2'>
        <ShieldCheck className='size-4 text-muted-foreground' />
        <h3 className='font-semibold'>Assign standards</h3>
        <StatusBadge tone='neutral'>Creates drafts</StatusBadge>
      </div>
      {error && (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      )}
      <fieldset disabled={busy} className='grid gap-4 sm:grid-cols-2'>
        <label className='space-y-2 text-sm font-medium'>
          Branch
          <Input
            value={branch}
            placeholder='main'
            onChange={(e) => {
              setBranch(e.target.value)
              setImpact(null)
            }}
          />
        </label>
        <label className='space-y-2 text-sm font-medium'>
          Profile
          <select
            className='h-9 w-full rounded-md border bg-background px-3 text-sm'
            value={profile}
            onChange={(e) => {
              setProfile(e.target.value)
              setImpact(null)
            }}
          >
            {['DEFAULT', 'RECOMMENDED', 'STRICT'].map((p) => (
              <option key={p} value={p}>
                {p[0] + p.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
      <PickList
        label='Standard versions'
        items={options.standards.map((p) => ({
          id: `${p.id}@${p.version}`,
          name: `${p.title} · v${p.version}`,
        }))}
        selected={packs}
        onChange={(values) => {
          setPacks(values)
          setImpact(null)
        }}
      />
      <div className='flex justify-end'>
        <Button
          size='sm'
          variant='outline'
          disabled={busy || !branch || !packs.length || packs.length > 5}
          onClick={() => void run()}
        >
          {busy ? 'Working…' : 'Preview impact'}
          <ArrowRight className='size-4' />
        </Button>
      </div>
      {impact && (
        <div className='space-y-3 border-t pt-4'>
          <h4 className='text-sm font-semibold'>
            Impact · {impact.repositories.length} repositories
          </h4>
          <p className='rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm'>
            Applying saves new repository standards and creates policy drafts.
            Review CI source mappings, create fresh assessments, then approve
            and publish in Policies.
          </p>
          {impact.repositories.slice((page - 1) * 10, page * 10).map((r) => (
            <div
              className='space-y-2 rounded-lg border p-3 text-sm'
              key={r.githubId}
            >
              <div className='flex flex-wrap justify-between gap-2'>
                <span className='font-medium'>{r.name}</span>
                <StatusBadge tone={r.conflicts.length ? 'error' : 'info'}>
                  {r.conflicts.length ? 'Conflict' : 'Draft ready'}
                </StatusBadge>
              </div>
              <p className='text-xs text-muted-foreground'>
                {r.addedChecks.length
                  ? [...new Set(r.addedChecks)].join(', ')
                  : 'No additional checks'}{' '}
                · {r.profile.toLowerCase()} profile
              </p>
              {r.conflicts.map((c) => (
                <p key={c} className='text-xs text-destructive'>
                  {c}
                </p>
              ))}
            </div>
          ))}
          <Paging
            page={page}
            total={impact.repositories.length}
            onChange={setPage}
          />
          <div className='flex justify-end'>
            <Button
              size='sm'
              disabled={busy || impact.conflicts}
              onClick={() => void run(true)}
            >
              Apply and create drafts
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
function ImportTeams({
  options,
  onClose,
  onImported,
}: {
  options: Options
  onClose: () => void
  onImported: (id: string) => Promise<void>
}) {
  const [installation, setInstallation] = useState(
    options.installations[0]?.id ?? ''
  )
  const [teams, setTeams] = useState<
    { id: string; name: string; parentId: string | null }[]
  >([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const filtered = teams.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  )
  async function discover() {
    setBusy(true)
    setError('')
    setLoaded(false)
    try {
      const result = await governanceRequest<{ teams: typeof teams }>(
        '/teams/github/discover',
        { installationId: installation }
      )
      setTeams(result.teams)
      setLoaded(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function importTeam(id: string) {
    setBusy(true)
    setError('')
    try {
      const result = await governanceRequest<{ id: string }>(
        '/teams/github/import',
        { installationId: installation, teamId: id }
      )
      await onImported(result.id)
    } catch (e) {
      setError((e as Error).message)
    } finally {
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
      <DialogContent className='flex max-h-[85svh] flex-col sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>Import GitHub team</DialogTitle>
          <DialogDescription>
            Import membership and repository associations. Policy scope starts
            empty.
          </DialogDescription>
        </DialogHeader>
        <div className='min-h-0 space-y-4 overflow-y-auto'>
          {error && (
            <p role='alert' className='text-sm text-destructive'>
              {error}
            </p>
          )}
          {options.installations.length ? (
            <div className='flex gap-2'>
              <select
                aria-label='GitHub organization'
                className='h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm'
                value={installation}
                onChange={(e) => {
                  setInstallation(e.target.value)
                  setLoaded(false)
                  setTeams([])
                }}
              >
                {options.installations.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
              <Button
                size='sm'
                variant='outline'
                disabled={busy}
                onClick={() => void discover()}
              >
                {busy ? 'Loading…' : 'List teams'}
              </Button>
            </div>
          ) : (
            <p className='text-sm'>
              Connect and link a GitHub organization in Access Control first.
            </p>
          )}
          {loaded && (
            <>
              <Input
                aria-label='Filter GitHub teams'
                placeholder='Filter GitHub teams…'
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
              />
              <div className='rounded-lg border'>
                {filtered.slice((page - 1) * 10, page * 10).map((t) => (
                  <div
                    className='flex items-center justify-between gap-3 border-b p-3 last:border-b-0'
                    key={t.id}
                  >
                    <span className='text-sm font-medium'>
                      {t.name}
                      {t.parentId && (
                        <span className='ml-2 text-xs font-normal text-muted-foreground'>
                          Nested team
                        </span>
                      )}
                    </span>
                    <Button
                      size='sm'
                      variant='outline'
                      disabled={busy}
                      onClick={() => void importTeam(t.id)}
                    >
                      <Github className='size-4' />
                      Import
                    </Button>
                  </div>
                ))}
                {!filtered.length && (
                  <p className='p-4 text-sm text-muted-foreground'>
                    No matching GitHub teams.
                  </p>
                )}
              </div>
              <Paging page={page} total={filtered.length} onChange={setPage} />
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
