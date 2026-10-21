import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearch } from '@tanstack/react-router'
import {
  ShieldCheck,
  UsersRound,
  Plus,
  Search,
  History,
  KeyRound,
  GitBranch,
  Pencil,
  LoaderCircle,
  RefreshCw,
  ChevronsUpDown,
  Check,
} from 'lucide-react'
import { siGithub } from 'simple-icons'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover'
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
  SheetFooter,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AppHeader } from '@/components/layout/app-header'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { useNavigationSession } from '../workspace/navigation-session'
import { canPerform } from '../workspace/scoped-access'
import { beginOrganizationLink } from './github-link-request'
import { GitHubOrganizationLink } from './github-organization-link'

type Member = {
  id: string
  identity: {
    id: string
    subject: string
    displayName: string | null
    email: string | null
    githubAccounts?: { login: string; avatarUrl: string | null }[]
  }
  role: string
  active: boolean
  repositoryIds: string[]
}
type Audit = {
  id: string
  event: string
  actorId: string
  createdAt: string
  metadata: { role?: string; active?: boolean; repositoryIds?: string[] }
}
type Directory = {
  syncedAt: string
  total: number
  page: number
  pageSize: number
  hasMore: boolean
  members: {
    id: string
    login: string
    avatarUrl: string | null
    membershipId: string | null
    role: string | null
    active: boolean
  }[]
}
type Members = { roles: string[]; members: Member[]; audit: Audit[] }
type Access = {
  organization: { id: string; name: string } | null
  repositories: { id: string; fullName: string }[]
  githubLinked: boolean
  githubLoginEnabled: boolean
  roles: { id: string; permissions: string[] }[]
}
const roleName = (id: string) =>
  id
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
const roleDescription: Record<string, string> = {
  OWNER: 'Manage organization settings, people, repositories and policies.',
  ADMIN:
    'Manage people, repositories and policies. Owner assignment is restricted.',
  POLICY_MANAGER:
    'Create, review and publish policies. Read assessments and contributor evidence.',
  SECURITY_ENGINEER:
    'Review security evidence, manage imported reports and read policies.',
  ENGINEERING_LEAD:
    'Add repositories, create skills, standards and policy drafts, and run and review assessments. Skill approval and policy publication need separate permissions.',
  DEVELOPER: 'Run assessments and review results for assigned repositories.',
  AUDITOR:
    'Read audit history, assessments, policies and contributor evidence. No changes.',
  VIEWER:
    'Read repositories, assessments, policies and contributor lists. No changes.',
}
const permissionName: Record<string, string> = {
  'audit.read': 'View workspace and authorized repository audit history',
  'organization.members.manage': 'Manage members and roles',
  'organization.settings.update': 'Update organization settings',
  'repository.connect': 'Connect GitHub repositories',
  'repository.read': 'View repositories',
  'repository.manage': 'Manage repository selection and profiles',
  'assessment.read': 'Read assessments and check results',
  'assessment.run': 'Create assessments',
  'policy.read': 'Read policies and standards',
  'team.read': 'View teams and authorized policy scope',
  'team.manage': 'Create teams and approve repository scope',
  'team.import': 'Import and sync GitHub teams',
  'team.policy.assign': 'Preview and assign team standards',
  'standards.manage': 'Create and edit organization standards',
  'execution.run': 'Request and cancel sandbox checks',
  'policy.draft': 'Create policies and choose standards',
  'github.ruleset.manage': 'Manage GitHub rulesets',
  'policy.enforcement.manage': 'Approve and activate merge protection',
  'policy.publish': 'Approve and publish policies',
  'evidence.manage': 'Import and verify CI reports',
  'contributors.read': 'View contributors',
  'contributors.activity.read': 'Read contributor activity',
  'contributors.policy_evidence.read': 'Read contributor policy evidence',
}
async function read<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/organizations/${path}`, {
    credentials: 'include',
    signal,
    cache: 'no-store',
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(
      typeof error.message === 'string'
        ? error.message
        : response.status === 403
          ? 'You do not have permission to manage access in this organization.'
          : 'Access details could not be loaded. Try again.'
    )
  }
  return response.json()
}
async function change(path: string, body: unknown, method = 'POST') {
  const response = await fetch(`${API_BASE_URL}/organizations${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok)
    throw new Error(
      Array.isArray(result.message)
        ? result.message.join(', ')
        : result.message || 'The change could not be saved. Try again.'
    )
  return result
}
export function AccessControlPage() {
  const session = useNavigationSession(),
    client = useQueryClient()
  const canManage = canPerform(session.data, 'organization.members.manage')
  const members = useQuery({
    queryKey: ['organization-members', session.data?.organizationId],
    queryFn: ({ signal }) => read<Members>('members', signal),
    enabled: canManage,
    retry: false,
  })
  const access = useQuery({
    queryKey: ['organization-access', session.data?.organizationId],
    queryFn: ({ signal }) => read<Access>('access', signal),
    retry: false,
  })
  const { tab: initialTab, githubLink } = useSearch({
    from: '/_authenticated/access-control',
  })
  const [tab, setTab] = useState<string>(initialTab),
    [search, setSearch] = useState(''),
    [roleFilter, setRoleFilter] = useState('all'),
    [statusFilter, setStatusFilter] = useState('all')
  const [githubPageSize, setGithubPageSize] = useState(10)
  const [githubSearch, setGithubSearch] = useState(''),
    [githubPage, setGithubPage] = useState(1)
  const directory = useQuery({
    queryKey: [
      'github-member-directory',
      session.data?.organizationId,
      githubSearch,
      githubPageSize,
      githubPage,
    ],
    queryFn: ({ signal }) =>
      read<Directory>(
        `github-directory?search=${encodeURIComponent(githubSearch)}&page=${githubPage}&pageSize=${githubPageSize}`,
        signal
      ),
    enabled: canManage && !!access.data?.githubLinked && tab === 'github',
    retry: false,
    staleTime: 60000,
  })
  const sync = useMutation({
    meta: { successMessage: 'GitHub members synchronized' },
    mutationFn: () => change('/github-directory/sync', {}),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['github-member-directory'] })
    },
  })
  const [open, setOpen] = useState(false),
    [editing, setEditing] = useState<Member | null>(null),
    [subject, setSubject] = useState(''),
    [displayName, setName] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false),
    [candidateSearch, setCandidateSearch] = useState(''),
    [candidatePage, setCandidatePage] = useState(1)
  const candidates = useQuery({
    queryKey: [
      'github-member-directory',
      session.data?.organizationId,
      'unassigned',
      candidateSearch,
      candidatePage,
    ],
    queryFn: ({ signal }) =>
      read<Directory>(
        `github-directory?unassigned=true&search=${encodeURIComponent(candidateSearch)}&page=${candidatePage}`,
        signal
      ),
    enabled:
      open &&
      !editing &&
      canManage &&
      !!access.data?.githubLinked &&
      pickerOpen,
    retry: false,
    staleTime: 30000,
  })
  const [role, setRole] = useState('DEVELOPER'),
    [active, setActive] = useState(true),
    [repoIds, setRepos] = useState<string[]>([])
  const [legacyOpen, setLegacyOpen] = useState(false),
    [orgName, setOrgName] = useState('')
  const data = useMemo(() => members.data?.members ?? [], [members.data])
  const visible = useMemo(
    () =>
      data.filter(
        (m) =>
          (roleFilter === 'all' || m.role === roleFilter) &&
          (statusFilter === 'all' ||
            m.active === (statusFilter === 'active')) &&
          [
            m.identity.displayName,
            m.identity.email,
            m.identity.subject,
            m.identity.githubAccounts?.[0]?.login,
          ].some((value) => value?.toLowerCase().includes(search.toLowerCase()))
      ),
    [data, search, roleFilter, statusFilter]
  )
  const roles = access.data?.roles ?? []
  const administrative = ['OWNER', 'ADMIN'].includes(role)
  const unavailableRepositoryIds = (editing?.repositoryIds ?? []).filter(
    (id) =>
      !access.data?.repositories.some((repository) => repository.id === id)
  )
  const assignable = roles.filter(
    (r) => session.data?.role === 'OWNER' || !['OWNER', 'ADMIN'].includes(r.id)
  )
  const save = useMutation({
    meta: { successMessage: 'Access settings saved' },
    mutationFn: () => {
      const github = access.data?.githubLinked && !editing
      return change(
        editing
          ? `/members/${editing.id}`
          : github
            ? '/github-members'
            : '/members',
        {
          ...(github
            ? { username: subject.trim() }
            : { subject: subject.trim(), displayName }),
          role,
          active,
          repositoryIds: administrative ? [] : repoIds,
        },
        editing ? 'PATCH' : 'POST'
      )
    },
    onSuccess: () => {
      setOpen(false)
      void client.invalidateQueries({ queryKey: ['organization-members'] })
      void client.invalidateQueries({ queryKey: ['github-member-directory'] })
      void client.invalidateQueries({ queryKey: ['profile-view-session'] })
    },
  })
  const create = useMutation({
    mutationFn: () => change('', { name: orgName }),
    onSuccess: async (org) => {
      await change(`/${org.id}/activate`, {})
      window.location.assign('/access-control')
    },
  })
  function start(member?: Member, initialRole = 'DEVELOPER') {
    setEditing(member ?? null)
    setSubject(member?.identity.subject ?? '')
    setPickerOpen(false)
    setCandidateSearch('')
    setCandidatePage(1)
    setName(member?.identity.displayName ?? '')
    setRole(member?.role ?? initialRole)
    setActive(member?.active ?? true)
    setRepos(member?.repositoryIds ?? [])
    save.reset()
    setOpen(true)
  }
  return (
    <>
      <AppHeader breadcrumbs={[{ label: 'Access control' }]} />
      <Main className='space-y-6'>
        <PageHeader
          title='Access Control'
          section='Administration'
          description={`Manage who can access ${access.data?.organization?.name ?? 'your workspace'} and what they can do.`}
          icon={ShieldCheck}
          tone='teal'
          actions={
            canManage ||
            (session.data?.platformAdmin &&
              access.data &&
              !access.data.githubLinked) ? (
              <>
                {session.data?.platformAdmin &&
                  access.data &&
                  !access.data.githubLinked && (
                    <Button
                      variant='outline'
                      onClick={() => setLegacyOpen(true)}
                    >
                      Create legacy workspace
                    </Button>
                  )}
                {canManage && (
                  <Button
                    disabled={!access.data?.githubLinked}
                    onClick={() => start()}
                  >
                    <Plus className='size-4' />
                    Give access
                  </Button>
                )}
              </>
            ) : undefined
          }
        />
        {access.isError && (
          <p
            role='alert'
            className='rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive'
          >
            {access.error.message}
            <Button
              size='sm'
              variant='outline'
              className='ml-3'
              onClick={() => void access.refetch()}
            >
              Retry
            </Button>
          </p>
        )}
        <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
          {[
            {
              label: 'Members',
              value: canManage && members.data ? data.length : '—',
              icon: UsersRound,
              tone: 'text-info bg-info/10',
            },
            {
              label: 'Active access',
              value:
                canManage && members.data
                  ? data.filter((m) => m.active).length
                  : '—',
              icon: ShieldCheck,
              tone: 'text-success bg-success/10',
            },
            {
              label: 'Built-in roles',
              value: roles.length || '—',
              icon: KeyRound,
              tone: 'text-primary bg-primary/10',
            },
            {
              label: 'Available repositories',
              value: access.data ? access.data.repositories.length : '—',
              icon: GitBranch,
              tone: 'text-warning bg-warning/10',
            },
          ].map(({ label, value, icon: Icon, tone }) => (
            <Card key={label} className='gap-0 py-4'>
              <CardContent className='flex items-center gap-3 px-4'>
                <span
                  className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${tone}`}
                >
                  <Icon className='size-5' aria-hidden='true' />
                </span>
                <div>
                  <p className='text-xs text-muted-foreground'>{label}</p>
                  <p className='mt-1 text-2xl font-semibold tabular-nums'>
                    {value}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <Tabs value={tab} onValueChange={setTab} className='gap-5'>
          <TabsList>
            <TabsTrigger value='people'>
              <UsersRound />
              People
            </TabsTrigger>
            <TabsTrigger value='github'>
              <svg
                aria-hidden='true'
                viewBox='0 0 24 24'
                className='size-4 shrink-0 fill-current'
              >
                <path d={siGithub.path} />
              </svg>
              GitHub members
            </TabsTrigger>
            <TabsTrigger value='roles'>
              <KeyRound />
              Roles &amp; permissions
            </TabsTrigger>
            <TabsTrigger value='activity'>
              <History />
              Activity
            </TabsTrigger>
          </TabsList>
          <TabsContent value='people'>
            <Card>
              <CardHeader className='gap-4'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <CardTitle>Workspace members</CardTitle>
                  <StatusBadge tone='info'>
                    {access.data?.githubLinked
                      ? 'GitHub organization'
                      : 'Organization access'}
                  </StatusBadge>
                </div>
                <div className='flex flex-wrap gap-3'>
                  <div className='relative min-w-48 flex-1'>
                    <Search
                      aria-hidden='true'
                      className='absolute top-2.5 left-3 size-4 text-muted-foreground'
                    />
                    <Input
                      aria-label='Search members'
                      placeholder='Search by name or username'
                      className='pl-9'
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <Select value={roleFilter} onValueChange={setRoleFilter}>
                    <SelectTrigger className='w-48' aria-label='Filter by role'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>All roles</SelectItem>
                      {roles.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {roleName(r.id)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger
                      className='w-40'
                      aria-label='Filter by access status'
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>All access</SelectItem>
                      <SelectItem value='active'>Active</SelectItem>
                      <SelectItem value='revoked'>Revoked</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {!canManage ? (
                  <p className='py-8 text-center text-sm text-muted-foreground'>
                    {session.isPending
                      ? 'Checking your permissions…'
                      : 'An Owner or Admin role is required to manage people. You can review the built-in roles in the next tab.'}
                  </p>
                ) : members.isPending ? (
                  <p
                    role='status'
                    className='flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground'
                  >
                    <LoaderCircle className='size-4 animate-spin' />
                    Loading members…
                  </p>
                ) : members.isError ? (
                  <p role='alert' className='py-6 text-sm text-destructive'>
                    {members.error.message}
                    <Button
                      variant='outline'
                      size='sm'
                      className='ml-3'
                      onClick={() => void members.refetch()}
                    >
                      Retry
                    </Button>
                  </p>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Person</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Repositories</TableHead>
                          <TableHead>Access</TableHead>
                          <TableHead className='text-right'>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visible.map((m) => (
                          <TableRow key={m.id}>
                            <TableCell>
                              <div className='flex items-center gap-3'>
                                <span className='flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary'>
                                  {(
                                    m.identity.displayName ??
                                    m.identity.githubAccounts?.[0]?.login ??
                                    m.identity.subject
                                  )
                                    .slice(0, 2)
                                    .toUpperCase()}
                                </span>
                                <div>
                                  <p className='font-medium'>
                                    {m.identity.displayName ??
                                      m.identity.githubAccounts?.[0]?.login ??
                                      m.identity.email ??
                                      m.identity.subject}
                                  </p>
                                  <p className='mt-0.5 text-xs text-muted-foreground'>
                                    {m.identity.githubAccounts?.[0]
                                      ? '@' + m.identity.githubAccounts[0].login
                                      : (m.identity.email ??
                                        'Organization account')}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <StatusBadge
                                tone={
                                  ['OWNER', 'ADMIN'].includes(m.role)
                                    ? 'info'
                                    : 'neutral'
                                }
                              >
                                {roleName(m.role)}
                              </StatusBadge>
                            </TableCell>
                            <TableCell className='text-xs text-muted-foreground'>
                              {['OWNER', 'ADMIN'].includes(m.role)
                                ? 'All authorized repositories'
                                : `${m.repositoryIds.length} assigned`}
                            </TableCell>
                            <TableCell>
                              <StatusBadge
                                tone={m.active ? 'success' : 'warning'}
                              >
                                {m.active ? 'Active' : 'Revoked'}
                              </StatusBadge>
                            </TableCell>
                            <TableCell className='text-right'>
                              <Button
                                size='sm'
                                variant='ghost'
                                disabled={
                                  m.identity.id === session.data?.identityId ||
                                  (session.data?.role !== 'OWNER' &&
                                    ['OWNER', 'ADMIN'].includes(m.role))
                                }
                                onClick={() => start(m)}
                                aria-label={`Edit access for ${m.identity.displayName ?? m.identity.subject}`}
                              >
                                <Pencil className='size-3.5' />
                                Edit
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {!visible.length && (
                      <div className='py-10 text-center'>
                        <UsersRound className='mx-auto size-8 text-muted-foreground/50' />
                        <p className='mt-3 text-sm font-medium'>
                          {data.length
                            ? 'No matching members'
                            : 'No members added yet'}
                        </p>
                        <p className='mt-1 text-xs text-muted-foreground'>
                          {data.length
                            ? 'Change your filters to see more people.'
                            : 'Give access and choose a built-in role to get started.'}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value='github'>
            <Card>
              <CardHeader>
                <div className='flex flex-wrap items-center justify-between gap-3'>
                  <div>
                    <CardTitle>GitHub organization members</CardTitle>
                    <p className='mt-2 text-sm text-muted-foreground'>
                      Choose a member and assign a Preflyt role. Syncing the
                      list does not grant access.
                    </p>
                  </div>
                  <Button
                    variant='outline'
                    disabled={
                      !canManage || !access.data?.githubLinked || sync.isPending
                    }
                    onClick={() => sync.mutate()}
                  >
                    <RefreshCw
                      className={
                        sync.isPending ? 'size-4 animate-spin' : 'size-4'
                      }
                    />
                    {sync.isPending ? 'Syncing…' : 'Sync members'}
                  </Button>
                </div>
                {access.data?.githubLinked && canManage && (
                  <div className='relative mt-3'>
                    <Search className='absolute top-2.5 left-3 size-4 text-muted-foreground' />
                    <Input
                      className='pl-9'
                      aria-label='Search GitHub members'
                      placeholder='Search GitHub username'
                      value={githubSearch}
                      maxLength={100}
                      onChange={(e) => {
                        setGithubSearch(e.target.value)
                        setGithubPage(1)
                      }}
                    />
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {!canManage ? (
                  <p className='py-8 text-sm text-muted-foreground'>
                    An Owner or Admin role is required to view GitHub
                    organization members.
                  </p>
                ) : !access.data?.githubLinked ? (
                  <div className='space-y-3 rounded-lg border border-info/20 bg-info/5 p-4'>
                    <p className='text-sm'>
                      Your GitHub repository connection can be used for member
                      access. Link this workspace to that organization to sync
                      members and assign roles.
                    </p>
                    <p className='text-xs text-muted-foreground'>
                      A Preflyt Owner must start linking and then authorize with
                      a GitHub organization owner account. Your connected
                      repositories, policies and history stay in this workspace.
                    </p>
                    {session.data?.role === 'OWNER' &&
                    access.data?.githubLoginEnabled ? (
                      <Button onClick={beginOrganizationLink}>
                        <svg
                          aria-hidden='true'
                          viewBox='0 0 24 24'
                          className='size-4 fill-current'
                        >
                          <path d={siGithub.path} />
                        </svg>
                        Link GitHub organization
                      </Button>
                    ) : (
                      <p className='text-xs text-muted-foreground'>
                        {access.data?.githubLoginEnabled
                          ? 'Ask a workspace Owner to link the organization.'
                          : 'Enable GitHub sign-in and register its callback in the App settings before linking.'}
                      </p>
                    )}
                  </div>
                ) : directory.isPending ? (
                  <p
                    role='status'
                    className='flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground'
                  >
                    <LoaderCircle className='size-4 animate-spin' />
                    Loading GitHub members…
                  </p>
                ) : directory.isError ? (
                  <p role='alert' className='py-6 text-sm text-destructive'>
                    {directory.error.message}
                    <Button
                      size='sm'
                      variant='outline'
                      className='ml-3'
                      onClick={() => void directory.refetch()}
                    >
                      Retry
                    </Button>
                  </p>
                ) : (
                  <>
                    <p className='mb-4 text-xs text-muted-foreground'>
                      {directory.data?.total ?? 0} matching members · Last
                      synced{' '}
                      {directory.data?.syncedAt
                        ? new Date(directory.data.syncedAt).toLocaleString()
                        : '—'}
                    </p>
                    <Table
                      pagination={{
                        page: githubPage,
                        pageSize: githubPageSize,
                        total: directory.data?.total ?? 0,
                        onPageChange: setGithubPage,
                        onPageSizeChange: (size) => {
                          setGithubPageSize(size)
                          setGithubPage(1)
                        },
                      }}
                    >
                      <TableHeader>
                        <TableRow>
                          <TableHead>GitHub member</TableHead>
                          <TableHead>Preflyt role</TableHead>
                          <TableHead>Access</TableHead>
                          <TableHead className='text-right'>Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {directory.data?.members.map((person) => (
                          <TableRow key={person.id}>
                            <TableCell>
                              <div className='flex items-center gap-3'>
                                {person.avatarUrl ? (
                                  <img
                                    src={person.avatarUrl}
                                    alt=''
                                    className='size-8 rounded-full'
                                    loading='lazy'
                                    referrerPolicy='no-referrer'
                                  />
                                ) : (
                                  <span className='flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs text-primary'>
                                    {person.login.slice(0, 2).toUpperCase()}
                                  </span>
                                )}
                                <span className='font-medium'>
                                  @{person.login}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {person.role ? (
                                <StatusBadge tone='info'>
                                  {roleName(person.role)}
                                </StatusBadge>
                              ) : (
                                <span className='text-sm text-muted-foreground'>
                                  No role assigned
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <StatusBadge
                                tone={
                                  person.active
                                    ? 'success'
                                    : person.membershipId
                                      ? 'warning'
                                      : 'neutral'
                                }
                              >
                                {person.active
                                  ? 'Access given'
                                  : person.membershipId
                                    ? 'Revoked'
                                    : 'No access'}
                              </StatusBadge>
                            </TableCell>
                            <TableCell className='text-right'>
                              <Button
                                size='sm'
                                variant='outline'
                                disabled={
                                  (!!person.membershipId &&
                                    !data.some(
                                      (m) => m.id === person.membershipId
                                    )) ||
                                  data.some(
                                    (m) =>
                                      m.id === person.membershipId &&
                                      (m.identity.id ===
                                        session.data?.identityId ||
                                        (session.data?.role !== 'OWNER' &&
                                          ['OWNER', 'ADMIN'].includes(m.role)))
                                  )
                                }
                                onClick={() => {
                                  const existing = data.find(
                                    (m) => m.id === person.membershipId
                                  )
                                  if (existing) start(existing)
                                  else {
                                    start()
                                    setSubject(person.login)
                                  }
                                }}
                              >
                                {person.membershipId
                                  ? 'Edit access'
                                  : 'Assign role'}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {!directory.data?.members.length && (
                      <p className='py-8 text-center text-sm text-muted-foreground'>
                        No matching GitHub members.
                      </p>
                    )}
                  </>
                )}
                {sync.isError && (
                  <p role='alert' className='mt-3 text-sm text-destructive'>
                    {sync.error.message}
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value='roles' className='space-y-4'>
            <div>
              <h2 className='text-lg font-semibold'>Ready-to-use roles</h2>
              <p className='mt-1 text-sm text-muted-foreground'>
                Assign a role to a person. Permissions are already configured
                and enforced by the API.
              </p>
            </div>
            <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
              {roles.map((r) => (
                <Card key={r.id} className='gap-4'>
                  <CardHeader>
                    <div className='flex items-center justify-between'>
                      <span className='flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary'>
                        <KeyRound className='size-4' />
                      </span>
                      <StatusBadge tone='neutral'>Built-in</StatusBadge>
                    </div>
                    <CardTitle className='mt-3 text-base'>
                      {roleName(r.id)}
                    </CardTitle>
                    <p className='text-xs leading-relaxed text-muted-foreground'>
                      {roleDescription[r.id]}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <details>
                      <summary className='cursor-pointer text-xs font-medium text-primary'>
                        {r.permissions.length} included permissions
                      </summary>
                      <ul className='mt-3 space-y-2'>
                        {r.permissions.map((p) => (
                          <li
                            key={p}
                            className='flex gap-2 text-xs text-muted-foreground'
                          >
                            <ShieldCheck className='size-3.5 shrink-0 text-success' />
                            {permissionName[p] ?? p}
                          </li>
                        ))}
                      </ul>
                    </details>
                    {canManage && assignable.some((a) => a.id === r.id) && (
                      <Button
                        size='sm'
                        variant='outline'
                        className='mt-4 ml-auto flex w-fit'
                        disabled={!access.data?.githubLinked}
                        onClick={() => start(undefined, r.id)}
                      >
                        Assign this role
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
            <p className='text-xs text-muted-foreground'>
              Owner and Admin roles cover authorized repositories across the
              organization. Other roles use explicit repository assignments.
              Super Admin is a separate deployment recovery account, not an
              organization role.
            </p>
          </TabsContent>
          <TabsContent value='activity'>
            <Card>
              <CardHeader>
                <CardTitle>Access history</CardTitle>
                <p className='text-xs text-muted-foreground'>
                  The last 20 recorded membership and role changes in this
                  organization.
                </p>
              </CardHeader>
              <CardContent>
                {!canManage ? (
                  <p className='py-6 text-sm text-muted-foreground'>
                    An Owner or Admin role is required to view access history.
                  </p>
                ) : members.isPending ? (
                  <p role='status'>Loading access history…</p>
                ) : members.isError ? (
                  <p role='alert' className='text-sm text-destructive'>
                    {members.error.message}
                  </p>
                ) : members.data?.audit.length ? (
                  <ol className='space-y-4'>
                    {members.data.audit.map((a) => (
                      <li
                        key={a.id}
                        className='flex flex-wrap justify-between gap-3 border-b pb-4 last:border-0'
                      >
                        <div className='flex gap-3'>
                          <span className='flex size-8 shrink-0 items-center justify-center rounded-lg bg-info/10 text-info'>
                            <History className='size-3.5' />
                          </span>
                          <div>
                            <p className='text-sm font-medium'>
                              {a.event === 'organization_membership_changed'
                                ? 'Member access updated'
                                : 'Workspace created'}
                            </p>
                            <p className='mt-1 text-xs text-muted-foreground'>
                              {roleName(a.metadata.role ?? 'OWNER')} ·{' '}
                              {a.metadata.active === false
                                ? 'Revoked'
                                : 'Active'}{' '}
                              · {a.metadata.repositoryIds?.length ?? 0}{' '}
                              repository assignments
                            </p>
                            <p className='mt-1 text-xs text-muted-foreground'>
                              Recorded actor: {a.actorId}
                            </p>
                          </div>
                        </div>
                        <time
                          className='text-xs text-muted-foreground'
                          dateTime={a.createdAt}
                        >
                          {new Date(a.createdAt).toLocaleString()}
                        </time>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className='py-8 text-center text-sm text-muted-foreground'>
                    No access changes recorded yet.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent className='flex flex-col sm:max-w-lg'>
            <SheetHeader className='border-b p-6'>
              <SheetTitle>
                {editing ? 'Edit access' : 'Give workspace access'}
              </SheetTitle>
              <SheetDescription>
                {editing
                  ? 'Update this person’s role and repositories. Changes apply on their next API request.'
                  : access.data?.githubLinked
                    ? 'Choose a GitHub organization member without active Preflyt access, then assign a role and repositories.'
                    : 'Link this workspace to its GitHub organization before granting new members access.'}
              </SheetDescription>
            </SheetHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                save.mutate()
              }}
              className='flex min-h-0 flex-1 flex-col'
            >
              <div className='flex-1 space-y-5 overflow-y-auto p-6'>
                <div className='space-y-2'>
                  <Label htmlFor='member-subject'>
                    {!editing && access.data?.githubLinked
                      ? 'GitHub member'
                      : 'Organization user ID'}
                  </Label>
                  {access.data?.githubLinked && !editing ? (
                    <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          id='member-subject'
                          type='button'
                          variant='outline'
                          role='combobox'
                          aria-expanded={pickerOpen}
                          className='w-full justify-between'
                          disabled={!canManage}
                        >
                          <span
                            className={subject ? '' : 'text-muted-foreground'}
                          >
                            {subject ? '@' + subject : 'Select a GitHub member'}
                          </span>
                          <ChevronsUpDown className='size-4 shrink-0 text-muted-foreground' />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align='start'
                        className='w-[var(--radix-popover-trigger-width)] p-0'
                      >
                        <Command shouldFilter={false}>
                          <CommandInput
                            placeholder='Filter by GitHub username…'
                            value={candidateSearch}
                            maxLength={100}
                            onValueChange={(value) => {
                              setCandidateSearch(value)
                              setCandidatePage(1)
                            }}
                          />
                          <CommandList>
                            {candidates.isPending ? (
                              <p
                                role='status'
                                className='p-4 text-sm text-muted-foreground'
                              >
                                Loading members…
                              </p>
                            ) : candidates.isError ? (
                              <p
                                role='alert'
                                className='p-4 text-sm text-destructive'
                              >
                                {candidates.error.message}
                              </p>
                            ) : (
                              <>
                                <CommandEmpty>
                                  No GitHub members without access match your
                                  search.
                                </CommandEmpty>
                                <CommandGroup>
                                  {candidates.data?.members.map((person) => (
                                    <CommandItem
                                      key={person.id}
                                      value={person.id}
                                      disabled={
                                        (!!person.membershipId &&
                                          !data.some(
                                            (m) => m.id === person.membershipId
                                          )) ||
                                        (session.data?.role !== 'OWNER' &&
                                          ['OWNER', 'ADMIN'].includes(
                                            person.role ?? ''
                                          ))
                                      }
                                      onSelect={() => {
                                        const existing = data.find(
                                          (m) => m.id === person.membershipId
                                        )
                                        if (existing) {
                                          start(existing)
                                          setActive(true)
                                        } else {
                                          setSubject(person.login)
                                          setPickerOpen(false)
                                        }
                                      }}
                                    >
                                      <Check
                                        className={
                                          subject === person.login
                                            ? 'size-4'
                                            : 'size-4 opacity-0'
                                        }
                                      />
                                      {person.avatarUrl && (
                                        <img
                                          src={person.avatarUrl}
                                          alt=''
                                          className='size-6 rounded-full'
                                          loading='lazy'
                                          referrerPolicy='no-referrer'
                                        />
                                      )}
                                      @{person.login}
                                      {person.membershipId && (
                                        <span className='ml-auto text-xs text-muted-foreground'>
                                          Revoked
                                        </span>
                                      )}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </>
                            )}
                          </CommandList>
                          <div className='flex items-center justify-between gap-2 border-t p-2 text-xs text-muted-foreground'>
                            <span>{candidates.data?.total ?? 0} available</span>
                            <div className='flex gap-1'>
                              <Button
                                type='button'
                                size='sm'
                                variant='ghost'
                                disabled={
                                  candidatePage === 1 || candidates.isFetching
                                }
                                onClick={() => setCandidatePage((p) => p - 1)}
                              >
                                Previous
                              </Button>
                              <Button
                                type='button'
                                size='sm'
                                variant='ghost'
                                disabled={
                                  !candidates.data?.hasMore ||
                                  candidates.isFetching
                                }
                                onClick={() => setCandidatePage((p) => p + 1)}
                              >
                                Next
                              </Button>
                            </div>
                          </div>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <Input
                      id='member-subject'
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      disabled={!!editing}
                      required
                      maxLength={320}
                      placeholder='User ID from your identity provider'
                    />
                  )}
                </div>
                {!access.data?.githubLinked && !editing && (
                  <div className='space-y-2'>
                    <Label htmlFor='member-name'>Display name (optional)</Label>
                    <Input
                      id='member-name'
                      value={displayName}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={120}
                    />
                  </div>
                )}
                <div className='space-y-2'>
                  <Label htmlFor='member-role'>Role</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger id='member-role'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {assignable.map((r) => (
                        <SelectItem value={r.id} key={r.id}>
                          {roleName(r.id)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className='text-xs leading-relaxed text-muted-foreground'>
                    {roleDescription[role]}
                  </p>
                </div>
                <label className='flex items-center gap-2 text-sm'>
                  <Checkbox
                    checked={active}
                    onCheckedChange={(value) => setActive(value === true)}
                  />
                  Active access
                </label>
                {administrative ? (
                  <p className='rounded-lg border border-info/20 bg-info/5 p-3 text-xs leading-relaxed text-muted-foreground'>
                    This role covers repositories across the organization.
                    GitHub users can access only repositories available to both
                    their GitHub account and the installed App.
                  </p>
                ) : (
                  <fieldset className='space-y-3 rounded-lg border p-4'>
                    <legend className='px-1 text-xs font-medium'>
                      Assigned repositories
                    </legend>
                    {access.data?.repositories.map((repo) => (
                      <label
                        key={repo.id}
                        className='flex items-center gap-2 text-sm'
                      >
                        <Checkbox
                          checked={repoIds.includes(repo.id)}
                          onCheckedChange={(value) =>
                            setRepos((ids) =>
                              value === true
                                ? [...ids, repo.id]
                                : ids.filter((id) => id !== repo.id)
                            )
                          }
                        />
                        {repo.fullName}
                      </label>
                    ))}
                    {unavailableRepositoryIds.length > 0 && (
                      <div className='space-y-3 border-t pt-3'>
                        <p className='text-xs leading-relaxed text-muted-foreground'>
                          These existing assignments are outside your current
                          repository list. Keep them selected to preserve
                          access, or clear them to remove it. They do not bypass
                          GitHub access checks.
                        </p>
                        {unavailableRepositoryIds.map((id) => (
                          <label
                            key={id}
                            className='flex items-center gap-2 text-sm'
                          >
                            <Checkbox
                              checked={repoIds.includes(id)}
                              onCheckedChange={(checked) =>
                                setRepos((ids) =>
                                  checked === true
                                    ? [...ids, id]
                                    : ids.filter((value) => value !== id)
                                )
                              }
                            />
                            Repository {id} (currently unavailable)
                          </label>
                        ))}
                      </div>
                    )}
                    {!access.data?.repositories.length && (
                      <p className='text-xs text-muted-foreground'>
                        Connect repositories before assigning repository access.
                      </p>
                    )}
                  </fieldset>
                )}
                {save.isError && (
                  <p
                    role='alert'
                    className='rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive'
                  >
                    {save.error.message}
                  </p>
                )}
              </div>
              <SheetFooter className='flex-row justify-end border-t p-6'>
                <Button
                  type='button'
                  variant='outline'
                  disabled={save.isPending}
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  disabled={
                    save.isPending ||
                    !subject.trim() ||
                    (!editing && !access.data?.githubLinked)
                  }
                >
                  {save.isPending
                    ? 'Saving…'
                    : editing
                      ? 'Save changes'
                      : 'Give access'}
                </Button>
              </SheetFooter>
            </form>
          </SheetContent>
        </Sheet>
        <Dialog open={legacyOpen} onOpenChange={setLegacyOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create legacy workspace</DialogTitle>
              <DialogDescription>
                This compatibility action is for existing identity-provider
                deployments. GitHub workspaces are created from verified
                organization onboarding.
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                create.mutate()
              }}
              className='space-y-4'
            >
              <Label htmlFor='legacy-name'>Workspace name</Label>
              <Input
                id='legacy-name'
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
                maxLength={120}
              />
              {create.isError && (
                <p role='alert' className='text-sm text-destructive'>
                  {create.error.message}
                </p>
              )}
              <Button disabled={create.isPending}>Create and switch</Button>
            </form>
          </DialogContent>
        </Dialog>
        <GitHubOrganizationLink status={githubLink} />
      </Main>
    </>
  )
}
