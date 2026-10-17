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
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { OptionSelect } from '@/components/ui/option-select'
import { Table } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { AppHeader } from '@/components/layout/app-header'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { PageHelpDrawer } from '@/components/page-help-drawer'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import { governanceRequest } from '../repositories/governance-api'
import { useNavigationSession } from '../workspace/navigation-session'
import { canPerform } from '../workspace/scoped-access'
import { Paging, PickList } from './team-controls'
import { TeamPolicyAssignment } from './team-policy-assignment'

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

function date(value: string | null) {
  return value ? new Date(value).toLocaleString() : '—'
}

export type Team = {
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
export type Options = {
  childTeams?: { id: string; name: string }[]
  members: { id: string; name: string }[]
  repositories: { id: string; name: string; defaultBranch: string | null }[]
  standards: (Ref & { title: string })[]
  installations: { id: string; name: string }[]
}
export type Detail = Omit<Team, 'members' | 'repositories' | 'assignments'> & {
  nestedScope?: { teamId: string }[]
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
    supersededAt?: string | null
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
export type Impact = {
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
      'Link your organization in Access Control first. Your GitHub App needs Organization Members: read. Imported identity and members are read-only. Imported repositories start outside policy scope. Sync adds new repositories for review, retains removed associations as warnings, and never expands approved scope. Manual Sync remains available. The worker checks up to five stale teams per minute, targeting a 15-minute refresh, using the original importer’s current authority. If that authority is lost, an authorized administrator must sync. Failed snapshots or snapshots older than 24 hours block assigning or publishing inherited policies.',
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
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const [id, setId] = useState<string | null>(null)
  const [editor, setEditor] = useState<Detail | 'new' | null>(null)
  const [importing, setImporting] = useState(false)
  const [baselineSetup, setBaselineSetup] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const query = useQuery({
    queryKey: ['teams', scopeKey, page, search, pageSize],
    retry: false,
    queryFn: ({ signal }) =>
      governanceRequest<{ teams: Team[]; total: number; pageSize: number }>(
        `/teams?page=${page}&pageSize=${pageSize}&q=${encodeURIComponent(search)}`,
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
  async function openBaseline() {
    setBusy(true)
    setError('')
    try {
      const result = await governanceRequest<{ id: string | null }>(
        '/teams/baseline'
      )
      if (result.id) setId(result.id)
      else setBaselineSetup(true)
    } catch (error) {
      setError((error as Error).message)
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function createBaseline() {
    setBusy(true)
    setError('')
    try {
      const result = await governanceRequest<{ id: string }>(
        '/teams/baseline',
        {}
      )
      setBaselineSetup(false)
      setId(result.id)
      toast.success('Organization scope ready. Choose standards next.')
      await refresh()
    } catch (error) {
      setError((error as Error).message)
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className='space-y-6'>
      <PageHeader
        title='Teams'
        section='Administration'
        description='Manage teams, repository scope and shared standards.'
        icon={UsersRound}
        tone='teal'
        actions={
          <>
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
          </>
        }
      />
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
              variant='outline'
              disabled={busy || !options.data}
              onClick={() => void openBaseline()}
            >
              <ShieldCheck className='size-4' />
              Manage organization-wide standards
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
        <Table
          pagination={{
            page,
            pageSize,
            total: query.data?.total ?? 0,
            onPageChange: setPage,
            onPageSizeChange: (size) => {
              setPageSize(size)
              setPage(1)
            },
          }}
          className='w-full text-left text-sm'
        >
          <thead className='bg-muted/40 text-muted-foreground'>
            <tr>
              {[
                'Team',
                'Source',
                'Members',
                'Repositories covered',
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
                      {t.source === 'GITHUB'
                        ? 'GitHub'
                        : t.source === 'ORGANIZATION'
                          ? 'Organization'
                          : 'Preflyt'}
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
                          : t.source !== 'GITHUB'
                            ? 'neutral'
                            : 'success'
                      }
                    >
                      {t.source !== 'GITHUB'
                        ? t.source === 'ORGANIZATION'
                          ? 'Organization-wide requirements'
                          : 'Local team'
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
        </Table>
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
              {detail.data?.source === 'ORGANIZATION'
                ? 'Organization-wide requirements · shared mandatory standards'
                : detail.data?.source === 'GITHUB'
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
      <Dialog
        open={baselineSetup}
        onOpenChange={(open) => {
          if (!busy) setBaselineSetup(open)
        }}
      >
        <DialogContent showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>Include all selected repositories?</DialogTitle>
            <DialogDescription>
              This approves your organization's currently selected repositories
              for organization-wide standards. No standards are assigned, no
              policies are published, and no GitHub rules are activated. Choose
              and review standards next.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role='alert' className='text-sm text-destructive'>
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              variant='outline'
              disabled={busy}
              onClick={() => setBaselineSetup(false)}
            >
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void createBaseline()}>
              {busy
                ? 'Including repositories…'
                : 'Include repositories and continue'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {importing && options.data && (
        <ImportTeams
          options={options.data}
          onClose={() => setImporting(false)}
          onBatchImported={refresh}
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
  const baseline = team?.source === 'ORGANIZATION'
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
            {baseline
              ? 'Include all connected repositories. Review impact before applying the shared standards.'
              : imported
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
              className={`grid gap-6 ${imported || baseline ? '' : 'md:grid-cols-2'}`}
            >
              {!imported && !baseline && (
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
function ChildScopePanel({
  team,
  options,
  onApplied,
}: {
  team: Detail
  options?: Options
  onApplied: () => Promise<void>
}) {
  const [children, setChildren] = useState(
    (team.nestedScope ?? []).map((child) => child.teamId)
  )
  const [preview, setPreview] = useState<{
    previewHash: string
    repositories: { githubId: string; name: string }[]
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const items = (options?.childTeams ?? []).filter(
    (child) => child.id !== team.id
  )
  async function review(approve = false) {
    if (approve && !preview) return
    setBusy(true)
    try {
      if (approve) {
        await governanceRequest(`/teams/${team.id}/child-scope/approve`, {
          childIds: children,
          expectedPreviewHash: preview!.previewHash,
        })
        await onApplied()
        setPreview(null)
        toast.success(
          'Child team scope approved. Review and apply standards next.'
        )
      } else {
        setPreview(
          await governanceRequest(`/teams/${team.id}/child-scope/preview`, {
            childIds: children,
          })
        )
      }
    } catch (error) {
      setPreview(null)
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className='overflow-hidden rounded-xl border bg-card shadow-xs'>
      <div className='flex items-center gap-3 border-b bg-muted/20 px-5 py-4'>
        <SurfaceIcon icon={UsersRound} tone='teal' />
        <div>
          <h3 className='text-sm font-semibold'>Child team repositories</h3>
          <p className='mt-1 text-xs text-muted-foreground'>
            Review the repositories this parent team should cover.
          </p>
        </div>
      </div>
      <div className='space-y-4 p-5'>
        <fieldset disabled={busy}>
          <PickList
            label='Child teams'
            items={items}
            selected={children}
            onChange={(ids) => {
              setChildren(ids)
              setPreview(null)
            }}
          />
        </fieldset>
        {preview && (
          <div className='rounded-lg border bg-muted/20 p-4'>
            <p className='text-sm font-semibold'>
              {preview.repositories.length} repositories in the reviewed scope
            </p>
            <ul className='mt-2 space-y-1 text-sm text-muted-foreground'>
              {preview.repositories.map((repo) => (
                <li key={repo.githubId}>{repo.name}</li>
              ))}
            </ul>
            <p className='mt-3 text-xs text-muted-foreground'>
              Approval updates team coverage. Existing policies keep their saved
              version until you review and apply standards again.
            </p>
          </div>
        )}
        <div className='flex flex-wrap justify-end gap-2'>
          <Button
            size='sm'
            variant='outline'
            disabled={busy || !children.length || children.length > 10}
            onClick={() => void review()}
          >
            Preview scope
          </Button>
          <Button
            size='sm'
            disabled={busy || !preview}
            onClick={() => void review(true)}
          >
            Approve scope
          </Button>
        </div>
      </div>
    </section>
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
        {canManage && team.source !== 'ORGANIZATION' && (
          <ChildScopePanel
            key={team.id}
            team={team}
            options={options}
            onApplied={onApplied}
          />
        )}
        {canManage && (
          <div className='flex justify-end'>
            <Button size='sm' variant='outline' onClick={onEdit}>
              <Pencil className='size-4' />
              Edit policy scope
            </Button>
          </div>
        )}
        <div className='overflow-x-auto rounded-lg border'>
          <Table className='w-full text-left text-sm'>
            <thead className='bg-muted/40'>
              <tr>
                <th className='p-3 font-medium'>Repository</th>
                <th className='p-3 font-medium'>Repositories covered</th>
                <th className='p-3 font-medium'>GitHub access</th>
              </tr>
            </thead>
            <tbody>
              {team.repositories.map((r) => (
                <tr key={r.id} className='border-t'>
                  <td className='p-3'>{r.name}</td>
                  <td className='p-3'>
                    <StatusBadge
                      tone={r.policyScopeEnabled ? 'success' : 'neutral'}
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
                          ? r.origin === 'NESTED'
                            ? 'Child team association'
                            : 'Recorded'
                          : 'Removed · review needed'}
                      </StatusBadge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          {!team.repositories.length && (
            <p className='p-5 text-sm text-muted-foreground'>
              No authorized repository associations.
            </p>
          )}
        </div>
      </TabsContent>
      <TabsContent value='policies' className='space-y-5'>
        {canAssign && options && (
          <TeamPolicyAssignment
            team={team}
            options={options}
            onApplied={onApplied}
          />
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
                {date(a.createdAt)}{' '}
                {a.supersededAt && (
                  <StatusBadge tone='neutral'>Replaced</StatusBadge>
                )}
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
          <Table className='w-full text-left text-sm'>
            <thead className='bg-muted/40'>
              <tr>
                <th className='p-3 font-medium'>Repository</th>
                <th className='p-3 font-medium'>Branch</th>
                <th className='p-3 font-medium'>Policy status</th>
                <th className='p-3 font-medium'>Review</th>
              </tr>
            </thead>
            <tbody>
              {team.impact?.map((row) => (
                <tr
                  key={`${row.githubId}:${row.branchRef ?? 'unassigned'}`}
                  className='border-t'
                >
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
          </Table>
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
      {!['overview', 'repositories', 'impact'].includes(tab) && (
        <Paging page={page} total={rows.length} onChange={setPage} />
      )}
    </Tabs>
  )
}
function ImportTeams({
  options,
  onClose,
  onImported,
  onBatchImported,
}: {
  options: Options
  onClose: () => void
  onImported: (id: string) => Promise<void>
  onBatchImported: () => Promise<void>
}) {
  const [installation, setInstallation] = useState(
    options.installations[0]?.id ?? ''
  )
  const [teams, setTeams] = useState<
    { id: string; name: string; parentId: string | null; imported?: boolean }[]
  >([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [batch, setBatch] = useState<{
    completed: number
    total: number
    failed: number
  } | null>(null)
  const [failures, setFailures] = useState<Record<string, string>>({})
  const pending = teams.filter((team) => !team.imported)
  const filtered = teams.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  )
  async function discover() {
    setBusy(true)
    setError('')
    setLoaded(false)
    setBatch(null)
    setFailures({})
    setSearch('')
    setPage(1)
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
  async function importAll() {
    if (busy || !pending.length) return
    setBusy(true)
    setError('')
    setFailures({})
    const selectedInstallation = installation
    const targets = [...pending]
    let completed = 0
    let failed = 0
    setBatch({ completed, total: targets.length, failed })
    try {
      // Reuse server-authorized imports, one at a time, across every list page.
      for (const team of targets) {
        try {
          await governanceRequest<{ id: string }>('/teams/github/import', {
            installationId: selectedInstallation,
            teamId: team.id,
          })
          setTeams((current) =>
            current.map((item) =>
              item.id === team.id ? { ...item, imported: true } : item
            )
          )
        } catch (e) {
          failed++
          setFailures((current) => ({
            ...current,
            [team.id]: (e as Error).message,
          }))
        }
        completed++
        setBatch({ completed, total: targets.length, failed })
      }
      if (failed) {
        toast.error(
          `Imported ${completed - failed} GitHub teams; ${failed} failed`
        )
      } else {
        toast.success(`Imported ${completed - failed} GitHub teams`)
      }
      if (completed > failed) {
        await onBatchImported()
      }
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
          <DialogTitle>Import GitHub teams</DialogTitle>
          <DialogDescription>
            Import members and repository associations. No repositories are
            covered until you approve them.
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
              <OptionSelect
                label='GitHub organization'
                disabled={busy}
                className='min-w-0 flex-1'
                value={installation}
                onValueChange={(value) => {
                  setInstallation(value)
                  setLoaded(false)
                  setTeams([])
                  setBatch(null)
                  setFailures({})
                  setError('')
                }}
                options={options.installations.map((i) => ({
                  value: i.id,
                  label: i.name,
                }))}
              />
              <Button
                size='sm'
                variant='outline'
                disabled={busy}
                onClick={() => void discover()}
              >
                {busy && !loaded ? 'Loading…' : 'List teams'}
              </Button>
            </div>
          ) : (
            <p className='text-sm'>
              Connect and link a GitHub organization in Access Control first.
            </p>
          )}
          {loaded && (
            <>
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <p className='text-sm text-muted-foreground'>
                  {teams.length} teams · {teams.length - pending.length} already
                  imported
                </p>
                <Button
                  size='sm'
                  disabled={busy || !pending.length}
                  onClick={() => void importAll()}
                >
                  <Github className='size-4' aria-hidden='true' />
                  {busy && batch
                    ? `Importing ${batch.completed} of ${batch.total}…`
                    : `Import all teams (${pending.length})`}
                </Button>
              </div>
              <p className='text-xs text-muted-foreground'>
                Import all includes every page in this organization, regardless
                of the filter.
              </p>
              {batch && (
                <p role='status' className='text-sm'>
                  {busy
                    ? `Processed ${batch.completed} of ${batch.total} teams.`
                    : `Imported ${batch.completed - batch.failed} of ${batch.total} teams.`}
                  {batch.failed > 0 &&
                    ` ${batch.failed} failed. See the team errors below and retry the remaining teams.`}
                </p>
              )}
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
                    <div className='min-w-0'>
                      <span className='text-sm font-medium'>
                        {t.name}
                        {t.parentId && (
                          <span className='ml-2 text-xs font-normal text-muted-foreground'>
                            Nested team
                          </span>
                        )}
                      </span>
                      {failures[t.id] && (
                        <p className='mt-1 text-sm text-destructive'>
                          {failures[t.id]}
                        </p>
                      )}
                    </div>
                    <Button
                      size='sm'
                      variant='outline'
                      disabled={busy || t.imported}
                      onClick={() => void importTeam(t.id)}
                    >
                      <Github className='size-4' />
                      {t.imported ? 'Imported' : 'Import'}
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
