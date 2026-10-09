import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, getRouteApi } from '@tanstack/react-router'
import {
  AlertTriangle,
  ArrowLeft,
  GitBranch,
  GitCommitHorizontal,
  Info,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AppHeader } from '@/components/layout/app-header'
import { Main } from '@/components/layout/main'
import { StatusBadge } from '@/components/status-badge'
import { canPerform, type ScopedSession } from '../workspace/scoped-access'
import { EvidenceDialog } from './evidence-dialog'
import {
  PostureSummary,
  type ControlFilter,
  type RepositoryTab,
} from './posture-summary'
import { RelativeTime } from './relative-time'
import { RepositoryActivityPanel } from './repository-activity-panel'
import { RepositoryAssessments } from './repository-assessments'
import { RepositoryBindings } from './repository-bindings'
import { RepositoryCiEvidence } from './repository-ci-evidence'
import { RepositoryControls } from './repository-controls'
import { RepositoryEvents } from './repository-events'
import { RepositoryPullRequests } from './repository-pull-requests'
import type { Profile } from './repository-queries'
import { RepositoryStandards } from './repository-standards'
import { signalStatus, toneFill } from './repository-vocabulary'
import { TechIcon } from './tech-icon'

const route = getRouteApi('/_authenticated/repositories/$repositoryId')
type Result = {
  repository: {
    githubId: string
    fullName: string
    defaultBranch: string | null
  }
  profile: Profile | null
}
const stackIds = new Set(['languages', 'frameworks'])
/** Engineering controls are covered by the standards table, not repeated here. */
const toolingIds = new Set(['manifests', 'containers', 'iac', 'migrations'])
const profileNotes = [
  'Config found means a supported file or workflow reference exists at the inspected commit. Nothing was built, tested or scanned.',
  'Not found means no supported hint was found. It is not a policy failure.',
]
const evidenceNotes = [
  'CI results are reported by GitHub. Manually linking a result to a rule does not verify that the rule ran.',
  'Each assessment saves evidence for one commit. Create a new assessment to include later evidence.',
]

class ProfileRequestError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}

function RepositoryFacts({ profile }: { profile: Profile }) {
  const stack = profile.report.signals.filter((s) => stackIds.has(s.id))
  const tooling = profile.report.signals.filter((s) => toolingIds.has(s.id))
  return (
    <Card className='gap-0 py-0'>
      <section className='space-y-3 p-5'>
        <h2 className='text-sm font-semibold'>Stack</h2>
        {stack.map((signal) => (
          <div key={signal.id} className='flex flex-wrap items-center gap-2'>
            <span className='w-full text-xs text-muted-foreground'>
              {signal.label}
            </span>
            {signal.state === 'detected' && signal.observations.length ? (
              signal.observations.map((name) => (
                <TechIcon key={name} name={name} />
              ))
            ) : (
              <span className='text-sm text-muted-foreground'>
                {signalStatus[signal.state].label}
              </span>
            )}
          </div>
        ))}
      </section>
      <Separator />
      <section className='p-5'>
        <h2 className='mb-2 text-sm font-semibold'>Tooling</h2>
        <ul className='space-y-1'>
          {tooling.map((signal) => {
            const status = signalStatus[signal.state]
            return (
              <li
                key={signal.id}
                className='flex min-h-7 items-center gap-2 text-sm'
              >
                <span
                  aria-hidden='true'
                  className={cn(
                    'size-2 shrink-0 rounded-full',
                    toneFill[status.tone]
                  )}
                />
                <span className='min-w-0 flex-1 truncate'>{signal.label}</span>
                <span className='sr-only'>{status.label}</span>
                {signal.evidence.length ? (
                  <EvidenceDialog
                    compact
                    title={signal.label}
                    files={signal.evidence}
                    repositoryName={profile.fullName}
                    sourceSha={profile.sourceSha}
                  />
                ) : (
                  <span className='text-xs text-muted-foreground'>
                    {status.label}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      </section>
      <Separator />
      <section className='p-5'>
        <h2 className='mb-3 text-sm font-semibold'>Snapshot</h2>
        <dl className='grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm'>
          <dt className='text-muted-foreground'>Branch</dt>
          <dd className='truncate font-medium'>{profile.branch}</dd>
          <dt className='text-muted-foreground'>Commit</dt>
          <dd
            className='truncate font-mono text-xs leading-5'
            title={profile.sourceSha}
          >
            {profile.sourceSha}
          </dd>
          <dt className='text-muted-foreground'>Tree</dt>
          <dd
            className='truncate font-mono text-xs leading-5'
            title={profile.treeSha}
          >
            {profile.treeSha}
          </dd>
          <dt className='text-muted-foreground'>Files</dt>
          <dd className='tabular-nums'>
            {profile.report.inspectedFileCount.toLocaleString()} inspected
          </dd>
          <dt className='text-muted-foreground'>Captured</dt>
          <dd>
            <RelativeTime value={profile.createdAt} />
          </dd>
        </dl>
      </section>
    </Card>
  )
}

function InspectionBadge({ profile }: { profile: Profile }) {
  if (profile.complete)
    return <StatusBadge tone='success'>Inspection complete</StatusBadge>
  return (
    <Popover>
      <PopoverTrigger className='touch-target rounded-lg focus-visible:outline-2 focus-visible:outline-ring'>
        <StatusBadge tone='warning' className='cursor-pointer'>
          Partial inspection
        </StatusBadge>
      </PopoverTrigger>
      <PopoverContent align='start' className='w-80 text-sm'>
        <p className='flex items-center gap-2 font-medium'>
          <AlertTriangle aria-hidden='true' className='size-4 text-warning' />
          Inspection limits
        </p>
        <ul className='mt-2 list-disc space-y-1 ps-5 text-muted-foreground'>
          {profile.report.warnings.length ? (
            profile.report.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))
          ) : (
            <li>Some files could not be read within discovery limits.</li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

function ReadingGuide({ limitations }: { limitations: string[] }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant='link'
          size='sm'
          className='touch-target h-auto min-h-6 p-0 text-xs text-muted-foreground'
        >
          <Info aria-hidden='true' className='size-3.5' />
          How to read this page
        </Button>
      </PopoverTrigger>
      <PopoverContent align='start' className='w-96 text-sm'>
        <p className='font-medium'>Understanding repository status</p>
        <ul className='mt-2 list-disc space-y-1.5 ps-5 text-muted-foreground'>
          {[
            ...(limitations.length ? limitations : profileNotes),
            ...evidenceNotes,
          ].map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

export function RepositoryProfilePage() {
  const { repositoryId } = route.useParams()
  const { tab = 'overview', assessment } = route.useSearch()
  const navigate = route.useNavigate()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<ControlFilter>('all')
  const profileQuery = useQuery({
    queryKey: ['repository-profile', repositoryId],
    retry: false,
    staleTime: 0,
    queryFn: async ({ signal }): Promise<Result> => {
      const response = await fetch(
        `${API_BASE_URL}/github/repositories/${encodeURIComponent(repositoryId)}/profile`,
        { credentials: 'include', signal }
      )
      if (!response.ok)
        throw new ProfileRequestError(
          response.status,
          response.status === 403
            ? 'This repository is not selected or GitHub access is unavailable.'
            : 'Could not load the repository profile. Check API and GitHub access, then retry.'
        )
      return response.json() as Promise<Result>
    },
  })
  const sessionQuery = useQuery({
    queryKey: ['profile-view-session'],
    retry: false,
    staleTime: 0,
    queryFn: async ({ signal }): Promise<ScopedSession> => {
      const response = await fetch(`${API_BASE_URL}/auth/session`, {
        credentials: 'include',
        signal,
      })
      if (!response.ok) throw new Error('Could not check account permissions')
      return response.json() as Promise<ScopedSession>
    },
  })
  const discovery = useMutation({
    mutationFn: async (id: string): Promise<Result> => {
      const response = await fetch(
        `${API_BASE_URL}/github/repositories/${encodeURIComponent(id)}/profile`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        }
      )
      if (!response.ok)
        throw new ProfileRequestError(
          response.status,
          response.status === 403
            ? 'Repository selection, permissions, or GitHub access changed. Reload the page to check access.'
            : response.status === 429
              ? 'Discovery is already running or busy. Try again shortly.'
              : 'Discovery failed. The previous profile was preserved; check GitHub access and retry.'
        )
      return response.json() as Promise<Result>
    },
    onSuccess: (value, id) => {
      queryClient.setQueryData(['repository-profile', id], value)
      void queryClient.invalidateQueries({
        queryKey: ['repository-standards', id],
      })
    },
  })
  const loading = profileQuery.isPending || profileQuery.isFetching
  const discovering =
    discovery.isPending && discovery.variables === repositoryId
  const mutationError =
    discovery.variables === repositoryId ? discovery.error : null
  const accessDenied =
    mutationError instanceof ProfileRequestError && mutationError.status === 403
  const result =
    loading || profileQuery.isError || accessDenied
      ? undefined
      : profileQuery.data
  const error = mutationError?.message ?? profileQuery.error?.message ?? ''
  const canDiscover = canPerform(
    sessionQuery.data,
    'repository.manage',
    repositoryId
  )
  function selectTab(value: string) {
    void navigate({
      search: (old) => ({
        ...old,
        tab: value === 'overview' ? undefined : (value as typeof tab),
      }),
      replace: true,
    })
  }
  function openTab(value: RepositoryTab) {
    selectTab(value)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function filterControls(value: ControlFilter) {
    setFilter(value)
    if (tab !== 'overview') selectTab('overview')
    document
      .getElementById('repository-controls')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const profile = result?.profile
  const technologies = [
    ...new Set(
      profile?.report.signals
        .filter(
          (signal) => stackIds.has(signal.id) && signal.state === 'detected'
        )
        .flatMap((signal) => signal.observations) ?? []
    ),
  ]
  return (
    <>
      <AppHeader
        breadcrumbs={[
          { label: 'Repositories', to: '/apps' },
          { label: result?.repository.fullName ?? 'Repository' },
        ]}
      />
      <Main className='space-y-5'>
        <div>
          <Button
            asChild
            variant='ghost'
            size='sm'
            className='-ms-3 mb-2 sm:hidden'
          >
            <Link to='/apps'>
              <ArrowLeft aria-hidden='true' />
              Repositories
            </Link>
          </Button>
          <div className='flex flex-wrap items-start justify-between gap-4'>
            <div className='min-w-0 flex-1 space-y-2'>
              <div className='flex flex-wrap items-center gap-x-3 gap-y-2'>
                <h1 className='min-w-0 text-2xl font-bold tracking-tight break-words'>
                  {result?.repository.fullName ?? 'Repository'}
                </h1>
                {!!technologies.length && (
                  <div
                    className='flex flex-wrap items-center gap-1.5'
                    role='group'
                    aria-label='Detected languages and frameworks'
                  >
                    {technologies.map((name) => (
                      <TechIcon key={name} name={name} compact />
                    ))}
                  </div>
                )}
              </div>
              {profile ? (
                <div className='flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground'>
                  <span className='flex items-center gap-1.5'>
                    <GitBranch aria-hidden='true' className='size-4' />
                    {profile.branch}
                  </span>
                  <span
                    className='flex items-center gap-1.5'
                    title={profile.sourceSha}
                  >
                    <GitCommitHorizontal
                      aria-hidden='true'
                      className='size-4'
                    />
                    <code className='text-xs'>
                      {profile.sourceSha.slice(0, 7)}
                    </code>
                  </span>
                  <span>
                    Profiled <RelativeTime value={profile.createdAt} />
                  </span>
                  <InspectionBadge profile={profile} />
                </div>
              ) : (
                result && (
                  <p className='text-sm text-muted-foreground'>
                    No profile discovered yet.
                  </p>
                )
              )}
              {result && (
                <p className='flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground'>
                  <StatusBadge tone='info'>No merge blocking</StatusBadge>
                  <ReadingGuide
                    limitations={profile?.report.limitations ?? []}
                  />
                </p>
              )}
            </div>
            {canDiscover && result && (
              <Button
                size='sm'
                variant='outline'
                disabled={loading || discovering}
                onClick={() => discovery.mutate(repositoryId)}
              >
                {discovering ? (
                  <LoaderCircle className='animate-spin' />
                ) : (
                  <RefreshCw />
                )}
                {discovering
                  ? 'Discovering…'
                  : profile
                    ? 'Refresh profile'
                    : 'Discover profile'}
              </Button>
            )}
          </div>
        </div>
        {error && (
          <div
            role='alert'
            className='flex flex-wrap items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm'
          >
            <AlertTriangle
              aria-hidden='true'
              className='mt-0.5 size-4 shrink-0 text-destructive'
            />
            <p className='min-w-0 flex-1'>{error}</p>
            <Button
              size='sm'
              variant='outline'
              disabled={discovering}
              onClick={() => {
                discovery.reset()
                void profileQuery.refetch()
              }}
            >
              Reload profile
            </Button>
          </div>
        )}
        {loading ? (
          <p
            role='status'
            className='flex items-center gap-2 text-muted-foreground'
          >
            <LoaderCircle className='size-4 animate-spin' />
            Loading repository…
          </p>
        ) : (
          result && (
            <Tabs value={tab} onValueChange={selectTab} className='gap-5'>
              <TabsList className='no-scrollbar max-w-full flex-nowrap overflow-x-auto'>
                <TabsTrigger value='overview'>Overview</TabsTrigger>
                <TabsTrigger value='standards'>Standards</TabsTrigger>
                <TabsTrigger value='assessments'>Assessments</TabsTrigger>
                <TabsTrigger value='activity'>CI activity</TabsTrigger>
              </TabsList>
              <TabsContent value='overview' className='space-y-5'>
                <PostureSummary
                  repositoryId={repositoryId}
                  profile={profile}
                  filter={filter}
                  onFilter={filterControls}
                  onOpenTab={openTab}
                />
                <RepositoryActivityPanel repositoryId={repositoryId} />
                <div className='grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]'>
                  <div id='repository-controls' className='min-w-0 scroll-mt-4'>
                    <RepositoryControls
                      repositoryId={repositoryId}
                      repositoryName={result.repository.fullName}
                      filter={filter}
                      onFilter={setFilter}
                      onOpenTab={openTab}
                    />
                  </div>
                  {profile ? (
                    <RepositoryFacts profile={profile} />
                  ) : (
                    <Card>
                      <CardHeader>
                        <CardTitle asChild>
                          <h2>No profile yet</h2>
                        </CardTitle>
                        <CardDescription>
                          {canDiscover
                            ? 'Discover the default branch to detect its stack, tooling and control configuration.'
                            : 'Ask an Owner or Admin to discover this repository.'}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className='text-xs text-muted-foreground'>
                        Discovery reads GitHub metadata and selected manifests.
                        Repository code is not executed.
                      </CardContent>
                    </Card>
                  )}
                </div>
              </TabsContent>
              <TabsContent value='standards' className='space-y-5'>
                <RepositoryStandards
                  key={repositoryId}
                  repositoryId={repositoryId}
                  canManage={canPerform(
                    sessionQuery.data,
                    'policy.draft',
                    repositoryId
                  )}
                  sourceBindings={
                    <RepositoryBindings
                      repositoryId={repositoryId}
                      canManage={canPerform(
                        sessionQuery.data,
                        'policy.draft',
                        repositoryId
                      )}
                    />
                  }
                />
              </TabsContent>
              <TabsContent value='assessments' className='space-y-5'>
                <RepositoryActivityPanel repositoryId={repositoryId} />
                <RepositoryPullRequests repositoryId={repositoryId} />
                <RepositoryAssessments
                  initialAssessmentId={assessment}
                  key={`${repositoryId}:${assessment ?? ''}`}
                  repositoryId={repositoryId}
                  canCreate={canPerform(
                    sessionQuery.data,
                    'assessment.run',
                    repositoryId
                  )}
                  initialSha={profile?.sourceSha ?? ''}
                />
              </TabsContent>
              <TabsContent value='activity' className='space-y-5'>
                <RepositoryCiEvidence
                  canImport={canPerform(
                    sessionQuery.data,
                    'evidence.manage',
                    repositoryId
                  )}
                  key={repositoryId}
                  repositoryId={repositoryId}
                />
                <RepositoryEvents repositoryId={repositoryId} />
              </TabsContent>
            </Tabs>
          )
        )}
      </Main>
    </>
  )
}
