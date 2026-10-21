import { useEffect, useState } from 'react'
import { Link, getRouteApi } from '@tanstack/react-router'
import {
  ArrowUpRight,
  Check,
  GitBranch,
  Globe2,
  Layers,
  LoaderCircle,
  LockKeyhole,
  Plug,
  RefreshCw,
  Search as SearchIcon,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { toast } from 'sonner'
import { API_BASE_URL } from '@/lib/api'
import { chartAnimation, chartTooltipAnimation } from '@/lib/chart-motion'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { StatusBadge } from '@/components/status-badge'
import { AddRepository } from '@/features/repositories/add-repository'
import { TechIcon } from '@/features/repositories/tech-icon'
import { useNavigationSession } from '@/features/workspace/navigation-session'
import { useHealthPortfolio } from '../health/health-api'
import { healthPortfolioHelp } from '../health/health-help-content'
import {
  InventoryHealthAction,
  InventoryHealthCell,
  type InventoryHealth,
} from '../health/inventory-health'
import { canPerform } from '../workspace/scoped-access'

const route = getRouteApi('/_authenticated/repositories/')

type Repository = {
  githubId: string
  name: string
  fullName: string
  ownerLogin: string
  defaultBranch: string | null
  isPrivate: boolean
  selected: boolean
  technologies?: string[]
  profiledAt?: string | null
  profileSha?: string | null
  installation: { accountLogin: string }
}

type Installation = { id: string; accountLogin: string; active: boolean }

export function RepositoryInventoryTable({
  repositories,
  canManage,
  savingRepository,
  onSelectionChange,
  health,
}: {
  repositories: Repository[]
  health?: InventoryHealth
  canManage: boolean
  savingRepository: string | null
  onSelectionChange: (repository: Repository, selected: boolean) => void
}) {
  return (
    <div className='overflow-hidden rounded-xl border'>
      <Table aria-label='Repository inventory' className='min-w-[1100px]'>
        <TableHeader>
          <TableRow className='bg-muted/30'>
            {canManage && (
              <TableHead className='w-14'>
                <span className='sr-only'>Select repository</span>
              </TableHead>
            )}
            <TableHead className='px-4'>Repository</TableHead>
            <TableHead className='px-4'>Health status</TableHead>
            <TableHead className='px-4'>Owner</TableHead>
            <TableHead className='px-4'>Default branch</TableHead>
            <TableHead className='px-4'>Visibility</TableHead>
            <TableHead className='px-4'>Stack</TableHead>
            <TableHead className='px-4'>GitHub account</TableHead>
            <TableHead className='w-px px-4 text-right whitespace-nowrap'>
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {repositories.map((repository) => {
            const technologies = repository.selected
              ? [...new Set(repository.technologies ?? [])]
              : []
            const saving = savingRepository === repository.githubId
            return (
              <TableRow key={repository.githubId}>
                {canManage && (
                  <TableCell className='px-2'>
                    <label className='flex size-9 cursor-pointer items-center justify-center rounded-lg has-[:disabled]:cursor-not-allowed'>
                      <Checkbox
                        checked={repository.selected}
                        disabled={savingRepository !== null}
                        onCheckedChange={(checked) =>
                          onSelectionChange(repository, checked === true)
                        }
                        aria-label={`Select ${repository.fullName}`}
                        aria-busy={saving}
                      />
                      {saving && (
                        <span role='status' className='sr-only'>
                          Saving…
                        </span>
                      )}
                    </label>
                  </TableCell>
                )}
                <TableCell className='px-4 py-4'>
                  {repository.selected ? (
                    <Link
                      to='/repositories/$repositoryId'
                      params={{ repositoryId: repository.githubId }}
                      aria-label={`Open ${repository.fullName}`}
                      className='inline-flex max-w-80 items-center gap-2 rounded-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring'
                    >
                      <span className='truncate' title={repository.fullName}>
                        {repository.name}
                      </span>
                      <ArrowUpRight
                        aria-hidden='true'
                        className='size-3.5 shrink-0'
                      />
                    </Link>
                  ) : (
                    <span
                      className='block max-w-80 truncate font-medium'
                      title={repository.fullName}
                    >
                      {repository.name}
                    </span>
                  )}
                </TableCell>
                <TableCell className='px-4'>
                  <InventoryHealthCell
                    repositoryId={repository.githubId}
                    selected={repository.selected}
                    health={health}
                  />
                </TableCell>
                <TableCell className='px-4 text-muted-foreground'>
                  {repository.ownerLogin}
                </TableCell>
                <TableCell className='px-4'>
                  <span className='inline-flex items-center gap-2'>
                    <GitBranch
                      aria-hidden='true'
                      className='size-3.5 text-muted-foreground'
                    />
                    {repository.defaultBranch ?? 'No default branch'}
                  </span>
                </TableCell>
                <TableCell className='px-4'>
                  <span className='inline-flex items-center gap-2'>
                    {repository.isPrivate ? (
                      <LockKeyhole
                        aria-hidden='true'
                        className='size-3.5 text-muted-foreground'
                      />
                    ) : (
                      <Globe2
                        aria-hidden='true'
                        className='size-3.5 text-muted-foreground'
                      />
                    )}
                    {repository.isPrivate ? 'Private' : 'Public'}
                  </span>
                </TableCell>
                <TableCell className='px-4'>
                  <div
                    className='flex max-w-64 flex-wrap items-center gap-1.5'
                    role='group'
                    aria-label={
                      repository.profileSha
                        ? `Last profiled languages and frameworks at commit ${repository.profileSha.slice(0, 7)}`
                        : 'Last profiled languages and frameworks'
                    }
                  >
                    {technologies.length ? (
                      technologies.map((name) => (
                        <TechIcon key={name} name={name} compact />
                      ))
                    ) : (
                      <span className='text-xs text-muted-foreground'>
                        {!repository.selected
                          ? 'Select to view stack'
                          : repository.profiledAt === undefined
                            ? 'Stack not loaded'
                            : repository.profiledAt
                              ? 'Stack not detected'
                              : 'Not profiled'}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className='px-4 text-muted-foreground'>
                  {repository.installation.accountLogin}
                </TableCell>
                <TableCell className='w-px px-4 text-right whitespace-nowrap'>
                  <InventoryHealthAction
                    repositoryId={repository.githubId}
                    name={repository.fullName}
                    selected={repository.selected}
                    health={health}
                  />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

export function Apps() {
  const { github, account } = route.useSearch()
  const session = useNavigationSession()
  const canManage = canPerform(session.data, 'repository.manage')
  const healthQuery = useHealthPortfolio({
    pageSize: 1000,
    enabled: canPerform(session.data, 'assessment.read'),
  })
  const inventoryHealth: InventoryHealth = {
    items: new Map(
      (healthQuery.isError ? [] : (healthQuery.data?.items ?? [])).map(
        (item) => [item.repositoryId, item]
      )
    ),
    pending: healthQuery.isPending,
    failed: healthQuery.isError,
    canRead: (id) => canPerform(session.data, 'assessment.read', id),
  }
  const [search, setSearch] = useState('')
  const [selectionFilter, setSelectionFilter] = useState('all')
  const [visibilityFilter, setVisibilityFilter] = useState('all')
  const [hasLoaded, setHasLoaded] = useState(false)
  const inventoryScope = `${session.data?.identityId ?? ''}:${session.data?.organizationId ?? ''}`
  const [loadedScope, setLoadedScope] = useState('')
  const [repositoryInventory, setRepositories] = useState<Repository[]>([])
  const repositories =
    loadedScope === inventoryScope
      ? repositoryInventory.filter((repository) =>
          canPerform(session.data, 'repository.read', repository.githubId)
        )
      : []
  const [installationInventory, setInstallations] = useState<Installation[]>([])
  const installations =
    loadedScope === inventoryScope ? installationInventory : []
  const [loading, setLoading] = useState(true)
  const [savingRepository, setSavingRepository] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function loadRepositories(
    refresh = canPerform(session.data, 'repository.connect')
  ) {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(
        `${API_BASE_URL}/github/repositories${refresh ? '?refresh=true' : ''}`,
        { credentials: 'include' }
      )
      if (!response.ok) throw new Error('Could not load GitHub repositories.')
      const result = (await response.json()) as {
        repositories: Repository[]
        installations: Installation[]
      }
      setRepositories(result.repositories)
      setInstallations(result.installations)
      setLoadedScope(inventoryScope)
      setHasLoaded(true)
      if (canPerform(session.data, 'assessment.read'))
        void healthQuery.refetch()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not load GitHub repositories.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/github/repositories`, {
          credentials: 'include',
        })
        if (!response.ok) throw new Error('Could not load GitHub repositories.')
        const result = (await response.json()) as {
          repositories: Repository[]
          installations: Installation[]
        }
        if (active) {
          setRepositories(result.repositories)
          setInstallations(result.installations)
          setLoadedScope(inventoryScope)
          setHasLoaded(true)
        }
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Could not load GitHub repositories.'
          )
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [inventoryScope])

  async function setSelected(repository: Repository, selected: boolean) {
    if (!canManage || savingRepository) return
    setSavingRepository(repository.githubId)
    setError('')
    try {
      const response = await fetch(
        `${API_BASE_URL}/github/repositories/${repository.githubId}/selection`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selected }),
        }
      )
      if (!response.ok) {
        throw new Error(
          response.status === 403
            ? 'You no longer have permission to select this repository. Refresh and check your workspace role.'
            : 'Could not update repository selection.'
        )
      }
      const result = (await response.json()) as {
        inspection?: string
        message?: string
      }
      if (result.inspection === 'QUEUED')
        toast.success(result.message ?? 'Repository health assessment queued.')
      if (result.inspection === 'RETRY')
        toast.warning(
          result.message ??
            'Repository selected. Retry inspection from the repository page.'
        )
      setRepositories((current) =>
        current.map((item) =>
          item.githubId === repository.githubId
            ? {
                ...item,
                selected,
                technologies: selected ? undefined : [],
                profiledAt: selected ? undefined : null,
                profileSha: selected ? undefined : null,
              }
            : item
        )
      )
      if (canPerform(session.data, 'assessment.read'))
        void healthQuery.refetch()
      if (selected) {
        // Read only the local inventory after adoption; do not refresh GitHub.
        try {
          const overview = await fetch(
            `${API_BASE_URL}/github/repositories/overview`,
            { credentials: 'include' }
          )
          if (overview.ok) {
            const result = (await overview.json()) as {
              repositories: Repository[]
            }
            const latest = result.repositories.find(
              (item) => item.githubId === repository.githubId && item.selected
            )
            if (latest)
              setRepositories((current) =>
                current.map((item) =>
                  item.githubId === latest.githubId && item.selected
                    ? {
                        ...item,
                        technologies: latest.technologies,
                        profiledAt: latest.profiledAt,
                        profileSha: latest.profileSha,
                      }
                    : item
                )
              )
          }
        } catch {
          // Selection already succeeded. The card retains an unknown stack state.
        }
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not update repository selection.'
      )
    } finally {
      setSavingRepository(null)
    }
  }

  const selectedCount = repositories.filter(
    (repository) => repository.selected
  ).length
  const privateCount = repositories.filter(
    (repository) => repository.isPrivate
  ).length
  const activeInstallations = installations.filter(
    (installation) => installation.active
  )
  const visibleRepositories = repositories.filter((repository) => {
    const matchesSearch =
      `${repository.fullName} ${repository.installation.accountLogin} ${repository.defaultBranch ?? ''}`
        .toLowerCase()
        .includes(search.trim().toLowerCase())
    const matchesSelection =
      selectionFilter === 'all' ||
      (selectionFilter === 'selected'
        ? repository.selected
        : !repository.selected)
    const matchesVisibility =
      visibilityFilter === 'all' ||
      (visibilityFilter === 'private'
        ? repository.isPrivate
        : !repository.isPrivate)
    return matchesSearch && matchesSelection && matchesVisibility
  })
  const inventoryByAccount = new Map<
    string,
    { account: string; selected: number; available: number }
  >()
  repositories.forEach((repository) => {
    const account = repository.installation.accountLogin
    const counts = inventoryByAccount.get(account) ?? {
      account,
      selected: 0,
      available: 0,
    }
    if (repository.selected) counts.selected += 1
    else counts.available += 1
    inventoryByAccount.set(account, counts)
  })
  const accounts = [...inventoryByAccount.values()].sort(
    (a, b) => b.selected + b.available - a.selected - a.available
  )
  const chartData = accounts.slice(0, 8)
  if (accounts.length > 8) {
    chartData.push(
      accounts.slice(8).reduce(
        (total, value) => ({
          account: 'Other accounts',
          selected: total.selected + value.selected,
          available: total.available + value.available,
        }),
        { account: 'Other accounts', selected: 0, available: 0 }
      )
    )
  }
  const metrics = [
    {
      label: 'Available repositories',
      value: repositories.length,
      icon: Layers,
      accent:
        'border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400',
      detail: 'Visible through GitHub App access',
    },
    {
      label: 'Selected for Preflyt',
      value: selectedCount,
      icon: Check,
      accent:
        'border-teal-500/20 bg-teal-500/10 text-teal-600 dark:text-teal-400',
      detail: 'Explicitly enabled for tracking',
    },
    {
      label: 'Active installations',
      value: activeInstallations.length,
      icon: Plug,
      accent:
        'border-violet-500/20 bg-violet-500/10 text-violet-600 dark:text-violet-400',
      detail: 'Connected GitHub accounts',
    },
    {
      label: 'Private repositories',
      value: privateCount,
      icon: LockKeyhole,
      accent:
        'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400',
      detail: 'Within the available inventory',
    },
  ]

  return (
    <>
      <AppHeader breadcrumbs={[{ label: 'Repositories' }]} />
      <Main fixed className='overflow-y-auto'>
        <div className='space-y-6'>
          <PageHeader
            title='Repositories'
            section='Workspace'
            description='GitHub inventory, repository access and Preflyt selection.'
            icon={GitBranch}
            tone='blue'
            actions={
              <>
                {canManage && (
                  <AddRepository onAdded={() => loadRepositories(false)} />
                )}
                {canManage && (
                  <Button variant='outline' asChild>
                    <a href={`${API_BASE_URL}/github/connection`}>
                      <Plug aria-hidden='true' /> Connect GitHub App
                    </a>
                  </Button>
                )}
                <PageHelpDrawer
                  title='Repositories'
                  sections={[
                    {
                      title: 'Repository access and selection',
                      content:
                        'The inventory shows repositories available through your GitHub App installations and Preflyt permissions. Selecting a repository enables tracking and queues its initial health assessment; it does not modify code, publish a branch policy or enable merge protection. GitHub App access and Preflyt selection are separate. Connect or update the App installation to change GitHub access; authorized repository managers can change selection here.',
                    },
                    {
                      title: 'Inventory metrics and refresh',
                      content:
                        'Available repositories counts the visible inventory. Selected for Preflyt counts explicitly selected repositories. Active installations counts connected GitHub accounts, and Private repositories counts private repositories in the inventory. Refresh inventory reloads availability, selection and saved health status. Inspection and analyzer execution are separate: detected stack or setup files do not mean checks passed.',
                    },
                    {
                      title: 'Health status and reports',
                      content:
                        'Healthy means a completed executed assessment passed every applicable recorded analysis with complete evidence and no findings. It is green; partial or inspection-only reports are never Healthy. Findings reported means analysis completed with issues. This describes the saved commit and recorded scope, not a guarantee about all code or GitHub merge permission. The Health status column shows the latest saved assessment for each accessible selected repository. The assessed branch is shown in the report. Partial means some analysis or evidence is missing. Inspection only means no analyzer ran. Not assessed means no report exists; Not loaded or Unavailable means status could not be retrieved. In the Actions column, View report opens that saved report in the repository Health tab; Open Health opens a repository without a report. Health summary metrics are in Engineering Overview → Health. Navigating or refreshing status does not start an assessment.',
                    },
                    ...healthPortfolioHelp,
                  ]}
                />
              </>
            }
          />

          {github === 'connected' && (
            <div
              role='status'
              className='rounded-md border border-green-600/30 bg-green-600/5 p-3 text-sm'
            >
              GitHub installation connected{account ? ` for ${account}` : ''}.
              {canManage && ' Select the repositories Preflyt should use.'}
            </div>
          )}
          {github === 'error' && (
            <div
              role='alert'
              className='rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive'
            >
              GitHub was not connected. The authorization may have expired or
              the installation could not be verified. Try again or contact your
              Preflyt administrator.
            </div>
          )}
          {installations.some((installation) => !installation.active) && (
            <div
              role='alert'
              className='rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive'
            >
              A GitHub installation is no longer available. Its repositories
              have been deselected. Reconnect the App to restore access.
            </div>
          )}
          {error && (
            <div
              role='alert'
              className='rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive'
            >
              {error}
            </div>
          )}

          <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
            {metrics.map(({ label, value, icon: Icon, accent, detail }) => (
              <Card key={label} className='gap-3 py-4'>
                <CardContent className='flex items-start gap-3 px-4'>
                  <span
                    className={cn(
                      'flex size-10 shrink-0 items-center justify-center rounded-lg border',
                      accent
                    )}
                  >
                    <Icon aria-hidden='true' className='size-5' />
                  </span>
                  <div>
                    <p className='text-xs font-medium text-muted-foreground'>
                      {label}
                    </p>
                    <p className='mt-1 text-3xl font-semibold tracking-tight tabular-nums'>
                      {hasLoaded ? value : '—'}
                    </p>
                    <p className='mt-1 text-xs text-muted-foreground'>
                      {detail}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {hasLoaded && (
            <div className='grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(16rem,1fr)]'>
              <Card className='gap-4'>
                <CardHeader>
                  <CardTitle asChild>
                    <h2>Repository selection by account</h2>
                  </CardTitle>
                  <CardDescription>
                    Full inventory · selected and available repositories.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {repositories.length === 0 ? (
                    <div className='flex h-64 items-center justify-center rounded-lg border border-dashed bg-chart-1/5 px-6 text-center text-sm text-muted-foreground'>
                      No accessible repositories to chart. Installation details
                      are shown alongside.
                    </div>
                  ) : (
                    <div
                      role='img'
                      aria-label={`Repository inventory: ${accounts.map(({ account, selected, available }) => `${account}, ${selected} selected, ${available} available`).join('; ')}`}
                      className='h-64 min-w-0'
                    >
                      <ResponsiveContainer width='100%' height='100%'>
                        <BarChart
                          className='chart-motion'
                          data={chartData}
                          layout='vertical'
                          margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
                          barSize={24}
                          accessibilityLayer
                        >
                          <CartesianGrid
                            horizontal={false}
                            stroke='var(--border)'
                            strokeDasharray='3 3'
                          />
                          <XAxis
                            type='number'
                            allowDecimals={false}
                            axisLine={false}
                            tickLine={false}
                            tick={{
                              fill: 'var(--muted-foreground)',
                              fontSize: '0.75rem',
                            }}
                          />
                          <YAxis
                            type='category'
                            dataKey='account'
                            width={120}
                            axisLine={false}
                            tickLine={false}
                            tick={{
                              fill: 'var(--muted-foreground)',
                              fontSize: '0.75rem',
                            }}
                            tickFormatter={(value: string) =>
                              value.length > 18
                                ? `${value.slice(0, 17)}…`
                                : value
                            }
                          />
                          <Tooltip
                            {...chartTooltipAnimation}
                            cursor={{ fill: 'var(--muted)', opacity: 0.35 }}
                            contentStyle={{
                              background: 'var(--popover)',
                              borderColor: 'var(--border)',
                              borderRadius: 8,
                              color: 'var(--popover-foreground)',
                              fontSize: '0.75rem',
                            }}
                          />
                          <Legend
                            iconType='circle'
                            iconSize={8}
                            wrapperStyle={{
                              fontSize: '0.75rem',
                              paddingTop: 12,
                            }}
                          />
                          <Bar
                            dataKey='selected'
                            name='Selected for Preflyt'
                            stackId='inventory'
                            fill='var(--success)'
                            {...chartAnimation}
                          />
                          <Bar
                            dataKey='available'
                            name='Available, not selected'
                            stackId='inventory'
                            fill='var(--chart-1)'
                            radius={[0, 4, 4, 0]}
                            {...chartAnimation}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card className='gap-4'>
                <CardHeader>
                  <CardTitle asChild>
                    <h2>GitHub connections</h2>
                  </CardTitle>
                  <CardDescription>
                    Recorded App installation availability.
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-3'>
                  {installations.length === 0 ? (
                    <p className='text-sm text-muted-foreground'>
                      No installation records are available.
                    </p>
                  ) : (
                    installations.map((installation) => (
                      <div
                        key={installation.id}
                        className='flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-3'
                      >
                        <span className='flex min-w-0 items-center gap-2 text-sm font-medium'>
                          <Plug
                            aria-hidden='true'
                            className='size-4 shrink-0 text-blue-500'
                          />
                          <span className='truncate'>
                            {installation.accountLogin}
                          </span>
                        </span>
                        <StatusBadge
                          tone={installation.active ? 'success' : 'warning'}
                        >
                          {installation.active ? 'Active' : 'Unavailable'}
                        </StatusBadge>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          <section
            aria-labelledby='repository-inventory-title'
            className='space-y-4'
          >
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <div>
                <h2
                  id='repository-inventory-title'
                  className='text-base font-semibold'
                >
                  Repository inventory
                </h2>
                <p className='mt-1 text-xs text-muted-foreground'>
                  {hasLoaded
                    ? `${visibleRepositories.length} of ${repositories.length} repositories`
                    : 'Loading inventory'}{' '}
                  · selecting a repository automatically starts its Health scan.
                </p>
              </div>
              <Button
                variant='outline'
                size='sm'
                onClick={() => void loadRepositories()}
                disabled={loading}
                aria-label='Refresh repositories'
              >
                {loading ? (
                  <LoaderCircle aria-hidden='true' className='animate-spin' />
                ) : (
                  <RefreshCw aria-hidden='true' />
                )}{' '}
                Refresh inventory
              </Button>
            </div>
            <div className='flex flex-wrap gap-3'>
              <div className='relative min-w-56 flex-1'>
                <SearchIcon
                  aria-hidden='true'
                  className='absolute top-2.5 left-3 size-4 text-muted-foreground'
                />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder='Search repositories, accounts or branches'
                  aria-label='Search repositories'
                  className='ps-9'
                />
              </div>
              <Select
                value={selectionFilter}
                onValueChange={setSelectionFilter}
              >
                <SelectTrigger
                  className='w-44'
                  aria-label='Filter repository selection'
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All repositories</SelectItem>
                  <SelectItem value='selected'>Selected</SelectItem>
                  <SelectItem value='available'>Not selected</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={visibilityFilter}
                onValueChange={setVisibilityFilter}
              >
                <SelectTrigger
                  className='w-36'
                  aria-label='Filter repository visibility'
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All visibility</SelectItem>
                  <SelectItem value='private'>Private</SelectItem>
                  <SelectItem value='public'>Public</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {healthQuery.data?.bounded && !healthQuery.isError && (
              <p className='text-xs text-muted-foreground'>
                Health status is limited to 1,000 accessible repositories. Open
                a repository’s Health tab for reports not loaded here.
              </p>
            )}
            {loading ? (
              <div
                role='status'
                className='flex min-h-32 items-center justify-center rounded-lg border text-sm text-muted-foreground'
              >
                <LoaderCircle
                  aria-hidden='true'
                  className='me-2 size-4 animate-spin'
                />
                Loading repositories…
              </div>
            ) : !hasLoaded ? (
              <div className='flex min-h-32 items-center justify-center rounded-lg border text-sm text-muted-foreground'>
                Inventory is unavailable. Refresh to try again.
              </div>
            ) : repositories.length === 0 ? (
              <div className='flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed p-4 text-center'>
                <span className='mb-4 flex size-12 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10 text-blue-500'>
                  <GitBranch aria-hidden='true' className='size-6' />
                </span>
                <h3 className='font-medium'>
                  {activeInstallations.length > 0
                    ? 'Connected, no accessible repositories'
                    : installations.length > 0
                      ? 'GitHub installation unavailable'
                      : 'No repositories available'}
                </h3>
                <p className='mt-1 max-w-lg text-sm text-muted-foreground'>
                  {activeInstallations.length > 0
                    ? canManage
                      ? 'Review the GitHub App installation repository permissions, then refresh the inventory.'
                      : 'Ask an Owner or Admin to review repository permissions for the connected GitHub App.'
                    : canManage
                      ? 'Connect the Preflyt GitHub App and grant access to the repositories you want to assess.'
                      : 'Ask a Preflyt Owner or Admin to connect the GitHub App and choose repositories.'}
                </p>
              </div>
            ) : visibleRepositories.length === 0 ? (
              <div className='flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed p-4 text-center'>
                <SearchIcon
                  aria-hidden='true'
                  className='mb-3 size-6 text-muted-foreground'
                />
                <h3 className='font-medium'>No matching repositories</h3>
                <Button
                  variant='link'
                  onClick={() => {
                    setSearch('')
                    setSelectionFilter('all')
                    setVisibilityFilter('all')
                  }}
                >
                  Clear filters
                </Button>
              </div>
            ) : (
              <RepositoryInventoryTable
                repositories={visibleRepositories}
                health={inventoryHealth}
                canManage={canManage}
                savingRepository={savingRepository}
                onSelectionChange={(repository, selected) =>
                  void setSelected(repository, selected)
                }
              />
            )}
          </section>
        </div>
      </Main>
    </>
  )
}
