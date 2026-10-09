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
import { API_BASE_URL } from '@/lib/api'
import { chartAnimation, chartTooltipAnimation } from '@/lib/chart-motion'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
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
import { ConfigDrawer } from '@/components/config-drawer'
import { AppBreadcrumbs } from '@/components/layout/app-breadcrumbs'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { StatusBadge } from '@/components/status-badge'
import { ThemeSwitch } from '@/components/theme-switch'
import { TechIcon } from '@/features/repositories/tech-icon'
import {
  canAdminister,
  useNavigationSession,
} from '@/features/workspace/navigation-session'

const route = getRouteApi('/_authenticated/apps/')

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

function RepositoryCardDetails({
  repository,
  canManage,
  saving,
}: {
  repository: Repository
  canManage: boolean
  saving: boolean
}) {
  const technologies = repository.selected
    ? [...new Set(repository.technologies ?? [])]
    : []
  return (
    <div className='space-y-4'>
      <div className='flex items-start justify-between gap-3'>
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg border',
            repository.selected
              ? 'border-primary/20 bg-primary/10 text-primary'
              : 'bg-muted/40 text-muted-foreground'
          )}
        >
          <GitBranch aria-hidden='true' className='size-4.5' />
        </span>
        <div className={cn('flex items-center gap-2', canManage && 'pe-8')}>
          <StatusBadge tone={repository.selected ? 'info' : 'neutral'}>
            {repository.selected ? 'Selected' : 'Not selected'}
          </StatusBadge>
        </div>
      </div>
      <div className='min-w-0'>
        <p className='truncate text-xs text-muted-foreground'>
          {repository.ownerLogin}
        </p>
        <h3
          className={cn(
            'mt-1 flex items-center justify-between gap-2 text-base font-semibold',
            repository.selected && 'text-primary'
          )}
        >
          <span
            className={cn(
              'truncate',
              repository.selected && 'group-hover:underline'
            )}
          >
            {repository.name}
          </span>
          {repository.selected && (
            <ArrowUpRight aria-hidden='true' className='size-4 shrink-0' />
          )}
        </h3>
      </div>
      <div className='flex flex-wrap gap-2'>
        <Badge variant='neutral' className='gap-1.5 font-normal'>
          <GitBranch aria-hidden='true' className='size-3' />
          {repository.defaultBranch ?? 'No default branch'}
        </Badge>
        <Badge variant='neutral' className='gap-1.5 font-normal'>
          {repository.isPrivate ? (
            <LockKeyhole aria-hidden='true' className='size-3' />
          ) : (
            <Globe2 aria-hidden='true' className='size-3' />
          )}
          {repository.isPrivate ? 'Private' : 'Public'}
        </Badge>
      </div>
      <div
        className='flex min-h-9 flex-wrap items-center gap-1.5'
        role='group'
        aria-label={
          repository.profileSha
            ? `Last profiled languages and frameworks at commit ${repository.profileSha.slice(0, 7)}`
            : 'Last profiled languages and frameworks'
        }
      >
        {technologies.length > 0 ? (
          <>
            {technologies.map((name) => (
              <TechIcon key={name} name={name} />
            ))}
            <span
              id={`repository-stack-${repository.githubId}`}
              className='sr-only group-has-[:focus-visible]:not-sr-only group-has-[:focus-visible]:w-full group-has-[:focus-visible]:text-xs group-has-[:focus-visible]:text-muted-foreground'
            >
              Last profiled stack: {technologies.join(', ')}
            </span>
          </>
        ) : (
          <span
            id={`repository-stack-${repository.githubId}`}
            className='text-xs text-muted-foreground'
          >
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
      <div className='flex items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground'>
        <span className='flex min-w-0 items-center gap-1.5'>
          <Plug aria-hidden='true' className='size-3.5 shrink-0' />
          <span className='truncate'>
            {repository.installation.accountLogin}
          </span>
        </span>
        {saving && (
          <span role='status' className='flex items-center gap-1.5'>
            <LoaderCircle aria-hidden='true' className='size-3 animate-spin' />
            Saving…
          </span>
        )}
      </div>
    </div>
  )
}

export function Apps() {
  const { github, account } = route.useSearch()
  const session = useNavigationSession()
  const canManage = canAdminister(session.data?.role)
  const [search, setSearch] = useState('')
  const [selectionFilter, setSelectionFilter] = useState('all')
  const [visibilityFilter, setVisibilityFilter] = useState('all')
  const [hasLoaded, setHasLoaded] = useState(false)
  const [repositories, setRepositories] = useState<Repository[]>([])
  const [installations, setInstallations] = useState<Installation[]>([])
  const [loading, setLoading] = useState(true)
  const [savingRepository, setSavingRepository] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function loadRepositories() {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(
        `${API_BASE_URL}/github/repositories?refresh=true`,
        { credentials: 'include' }
      )
      if (!response.ok) throw new Error('Could not load GitHub repositories.')
      const result = (await response.json()) as {
        repositories: Repository[]
        installations: Installation[]
      }
      setRepositories(result.repositories)
      setInstallations(result.installations)
      setHasLoaded(true)
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
  }, [])

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
            ? 'Only a Preflyt Owner or Admin can change repository selection.'
            : 'Could not update repository selection.'
        )
      }
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
      <Header fixed>
        <AppBreadcrumbs
          className='me-auto hidden sm:block'
          items={[{ label: 'Repositories' }]}
        />
        <Search />
        <ThemeSwitch />
        <ConfigDrawer />
        <ProfileDropdown />
      </Header>
      <Main fixed className='overflow-y-auto'>
        <div className='space-y-6'>
          <div className='flex flex-wrap items-start justify-between gap-4'>
            <div>
              <h1 className='text-2xl font-bold tracking-tight'>
                Repositories
              </h1>
              <p className='mt-1 text-sm text-muted-foreground'>
                GitHub inventory, repository access and Preflyt selection.
              </p>
            </div>
            {canManage && (
              <Button asChild>
                <a href={`${API_BASE_URL}/github/install`}>
                  <Plug aria-hidden='true' /> Connect GitHub App
                </a>
              </Button>
            )}
          </div>

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
              <Card key={label} className='gap-3 py-5'>
                <CardContent className='flex items-start gap-3 px-5'>
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
                              fontSize: 11,
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
                              fontSize: 11,
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
                              fontSize: 12,
                            }}
                          />
                          <Legend
                            iconType='circle'
                            iconSize={8}
                            wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                          />
                          <Bar
                            dataKey='selected'
                            name='Selected for Preflyt'
                            stackId='inventory'
                            fill='var(--chart-2)'
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
                  · selection does not execute or modify code.
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
              <div className='flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center'>
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
              <div className='flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center'>
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
              <div className='grid gap-4 md:grid-cols-2 2xl:grid-cols-3'>
                {visibleRepositories.map((repository) => (
                  <Card
                    key={repository.githubId}
                    className={cn(
                      'group relative gap-0 py-0',
                      repository.selected &&
                        'border-primary/30 bg-primary/[0.025] hover:border-primary/70'
                    )}
                  >
                    <CardContent className='flex flex-1 px-0'>
                      {repository.selected ? (
                        <Link
                          to='/repositories/$repositoryId'
                          params={{ repositoryId: repository.githubId }}
                          aria-label={`Open ${repository.fullName}`}
                          aria-describedby={`repository-stack-${repository.githubId}`}
                          className='block w-full rounded-xl p-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
                        >
                          <RepositoryCardDetails
                            repository={repository}
                            canManage={canManage}
                            saving={savingRepository === repository.githubId}
                          />
                        </Link>
                      ) : (
                        <div className='w-full p-5'>
                          <RepositoryCardDetails
                            repository={repository}
                            canManage={canManage}
                            saving={savingRepository === repository.githubId}
                          />
                        </div>
                      )}
                    </CardContent>
                    {canManage && (
                      <label className='absolute end-3.5 top-3.5 z-10 flex size-8 cursor-pointer items-center justify-center rounded-lg has-[:disabled]:cursor-not-allowed'>
                        <Checkbox
                          checked={repository.selected}
                          disabled={savingRepository !== null}
                          onCheckedChange={(checked) =>
                            void setSelected(repository, checked === true)
                          }
                          aria-label={`Select ${repository.fullName}`}
                        />
                      </label>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>
      </Main>
    </>
  )
}
