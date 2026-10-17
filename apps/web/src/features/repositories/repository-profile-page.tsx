import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, getRouteApi } from '@tanstack/react-router'
import {
  AlertTriangle,
  ArrowLeft,
  GitBranch,
  GitCommitHorizontal,
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
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AppHeader } from '@/components/layout/app-header'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { PageHelpDrawer } from '@/components/page-help-drawer'
import { StatusBadge } from '@/components/status-badge'
import { useHealth } from '../health/health-api'
import { healthHelp } from '../health/health-help-content'
import { RepositoryHealth } from '../health/repository-health'
import { canPerform, type ScopedSession } from '../workspace/scoped-access'
import { BranchPicker } from './branch-picker'
import { EvidenceDialog } from './evidence-dialog'
import { InspectionBadge } from './inspection-scope'
import { RelativeTime } from './relative-time'
import { RepositoryActivityPanel } from './repository-activity-panel'
import { RepositoryAssessments } from './repository-assessments'
import { RepositoryBindings } from './repository-bindings'
import { RepositoryCheckResults } from './repository-check-results'
import { RepositoryCiEvidence } from './repository-ci-evidence'
import { repositoryConfigurationHelp } from './repository-configuration-help'
import { RepositoryControls } from './repository-controls'
import { RepositoryEvents } from './repository-events'
import { RepositoryPullRequests } from './repository-pull-requests'
import type { Profile } from './repository-queries'
import { RepositoryStandards } from './repository-standards'
import type { ControlFilter, RepositoryTab } from './repository-tabs'
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
  'Related files found means a supported file or workflow reference exists at the inspected commit. Nothing was built, tested or scanned.',
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

function RepositoryHelp({ limitations }: { limitations: string[] }) {
  return (
    <PageHelpDrawer
      title='Repository'
      sections={[
        ...healthHelp,
        ...repositoryConfigurationHelp,
        {
          title: 'Understanding repository status',
          content: (
            <ul className='list-disc space-y-1.5 ps-5'>
              {[
                ...(limitations.length ? limitations : profileNotes),
                ...evidenceNotes,
              ].map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ),
        },
      ]}
    />
  )
}

export function RepositoryProfilePage() {
  const { repositoryId } = route.useParams()
  const {
    tab = 'health',
    assessment,
    health,
    branch: requestedHealthBranch,
  } = route.useSearch()
  const navigate = route.useNavigate()
  const queryClient = useQueryClient()
  const [branchChoice, setBranchChoice] = useState<{
    repositoryId: string
    branch: string
  } | null>(null)
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
    mutationFn: async ({
      id,
      branch,
    }: {
      id: string
      branch: string
    }): Promise<Result> => {
      const response = await fetch(
        `${API_BASE_URL}/github/repositories/${encodeURIComponent(id)}/profile`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ branch }),
        }
      )
      if (!response.ok) {
        const detail = (await response.json().catch(() => ({}))) as {
          message?: unknown
        }
        throw new ProfileRequestError(
          response.status,
          response.status === 400 && typeof detail.message === 'string'
            ? detail.message
            : response.status === 403
              ? 'Repository selection, permissions, or GitHub access changed. Reload the page to check access.'
              : response.status === 429
                ? 'Discovery is already running or busy. Try again shortly.'
                : 'Discovery failed. The previous profile was preserved; check the branch name, GitHub access and retry.'
        )
      }
      return response.json() as Promise<Result>
    },
    onSuccess: (value, { id }) => {
      queryClient.setQueryData(['repository-profile', id], value)
      void queryClient.invalidateQueries({
        queryKey: ['repository-standards', id],
      })
      void queryClient.invalidateQueries({
        queryKey: ['engineering-dashboard'],
      })
    },
  })
  const loading = profileQuery.isPending || profileQuery.isFetching
  const discovering =
    discovery.isPending && discovery.variables?.id === repositoryId
  const mutationError =
    discovery.variables?.id === repositoryId ? discovery.error : null
  const accessDenied =
    mutationError instanceof ProfileRequestError && mutationError.status === 403
  const result =
    loading || profileQuery.isError || accessDenied
      ? undefined
      : profileQuery.data
  const healthTarget = useHealth(
    repositoryId,
    health,
    1,
    tab === 'health',
    requestedHealthBranch
  )
  const healthBranch = healthTarget.isSuccess
    ? (requestedHealthBranch ??
      healthTarget.data.branch ??
      result?.repository.defaultBranch ??
      '')
    : (requestedHealthBranch ?? '')
  const inspectionBranch =
    branchChoice?.repositoryId === repositoryId
      ? branchChoice.branch
      : (result?.profile?.branch ?? result?.repository.defaultBranch ?? '')
  const selectedBranch = tab === 'health' ? healthBranch : inspectionBranch
  const error = mutationError?.message ?? profileQuery.error?.message ?? ''
  const canDiscover = canPerform(
    sessionQuery.data,
    'repository.manage',
    repositoryId
  )
  const canSelectBranch =
    tab === 'health'
      ? canPerform(sessionQuery.data, 'execution.run', repositoryId)
      : canDiscover
  function selectTab(value: string) {
    void navigate({
      search: (old) => ({
        ...old,
        tab: value === 'health' ? undefined : (value as typeof tab),
      }),
      replace: true,
    })
  }
  function openTab(value: RepositoryTab) {
    selectTab(value)
    window.scrollTo({ top: 0, behavior: 'smooth' })
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
          { label: 'Repositories', to: '/repositories' },
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
            <Link to='/repositories'>
              <ArrowLeft aria-hidden='true' />
              Repositories
            </Link>
          </Button>
          <PageHeader
            title={result?.repository.fullName ?? 'Repository'}
            section='Workspace'
            icon={GitBranch}
            tone='blue'
            actions={
              <div className='flex max-w-full flex-col gap-2'>
                <div className='flex flex-wrap items-end gap-2 sm:justify-end'>
                  {canSelectBranch && result && tab !== 'assessments' ? (
                    <div className='flex flex-col gap-2'>
                      <label
                        className='text-xs font-medium text-muted-foreground'
                        htmlFor='profile-branch'
                      >
                        {tab === 'health' ? 'Branch' : 'Inspect branch'}
                      </label>
                      <div className='flex flex-wrap items-center gap-2'>
                        <BranchPicker
                          repositoryId={repositoryId}
                          actorId={sessionQuery.data?.identityId}
                          label={
                            tab === 'health'
                              ? 'Repository branch'
                              : 'Inspect branch'
                          }
                          value={selectedBranch}
                          disabled={
                            tab === 'health'
                              ? healthTarget.isPending || healthTarget.isError
                              : discovering
                          }
                          onValueChange={(branch) => {
                            if (tab === 'health') {
                              void navigate({
                                search: (old) => ({
                                  ...old,
                                  branch,
                                  health: undefined,
                                }),
                                replace: true,
                              })
                            } else setBranchChoice({ repositoryId, branch })
                          }}
                        />
                        {tab !== 'health' && (
                          <Button
                            size='sm'
                            variant='outline'
                            disabled={
                              loading || discovering || !inspectionBranch.trim()
                            }
                            onClick={() =>
                              discovery.mutate({
                                id: repositoryId,
                                branch: inspectionBranch.trim(),
                              })
                            }
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
                  ) : null}
                  {result && (
                    <RepositoryHelp
                      limitations={profile?.report.limitations ?? []}
                    />
                  )}
                </div>
                {canSelectBranch &&
                  result &&
                  tab !== 'assessments' &&
                  tab !== 'health' && (
                    <p className='max-w-sm text-xs text-muted-foreground sm:text-right'>
                      Refresh profile to inspect the selected branch.
                    </p>
                  )}
              </div>
            }
          >
            <div className='flex flex-wrap items-center gap-x-3 gap-y-2'>
              {tab !== 'assessments' && !!technologies.length && (
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
            {tab !== 'assessments' &&
              (profile ? (
                <div className='flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground'>
                  <span className='flex items-center gap-1.5'>
                    <GitBranch aria-hidden='true' className='size-4' />
                    Inspected branch: {profile.branch}
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
              ))}
            {result && tab !== 'assessments' && (
              <p className='flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground'>
                <StatusBadge tone='info'>No merge blocking</StatusBadge>
              </p>
            )}
          </PageHeader>
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
                <TabsTrigger value='health'>Health</TabsTrigger>
                <TabsTrigger value='overview'>Checks</TabsTrigger>
                <TabsTrigger value='standards'>Standards</TabsTrigger>
                <TabsTrigger value='assessments'>Assessments</TabsTrigger>
                <TabsTrigger value='activity'>CI activity</TabsTrigger>
              </TabsList>
              <TabsContent value='health'>
                <RepositoryHealth
                  key={`${repositoryId}:${healthBranch}:${health ?? ''}`}
                  repositoryId={repositoryId}
                  name={result.repository.fullName}
                  defaultBranch={result.repository.defaultBranch}
                  assessmentId={health}
                  selectedBranch={healthBranch}
                  onAssessmentQueued={(assessment) =>
                    navigate({
                      search: (old) => ({
                        ...old,
                        branch: assessment.branch,
                        health: assessment.id,
                      }),
                      replace: true,
                    })
                  }
                />
              </TabsContent>
              <TabsContent value='overview' className='space-y-5'>
                <div className='grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]'>
                  <div className='min-w-0 space-y-5'>
                    <RepositoryActivityPanel repositoryId={repositoryId} />
                    <RepositoryCheckResults
                      repositoryId={repositoryId}
                      profile={profile}
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
                            ? 'Choose a branch above to detect its languages, frameworks and configuration.'
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
                  sourceBindings={(policyId) => (
                    <RepositoryBindings
                      repositoryId={repositoryId}
                      policyId={policyId}
                      canManage={canPerform(
                        sessionQuery.data,
                        'policy.draft',
                        repositoryId
                      )}
                    />
                  )}
                />
                <RepositoryControls
                  repositoryId={repositoryId}
                  repositoryName={result.repository.fullName}
                  filter={filter}
                  onFilter={setFilter}
                  onOpenTab={openTab}
                />
              </TabsContent>
              <TabsContent value='assessments' className='space-y-5'>
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
                <RepositoryActivityPanel repositoryId={repositoryId} />
                <RepositoryPullRequests repositoryId={repositoryId} />
                <Tabs defaultValue='results' className='space-y-4'>
                  <TabsList aria-label='CI activity views'>
                    <TabsTrigger value='results'>CI results</TabsTrigger>
                    <TabsTrigger value='deliveries'>
                      Delivery timeline
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value='results'>
                    <RepositoryCiEvidence
                      canManageEvidence={canPerform(
                        sessionQuery.data,
                        'evidence.manage',
                        repositoryId
                      )}
                      key={repositoryId}
                      repositoryId={repositoryId}
                    />
                  </TabsContent>
                  <TabsContent value='deliveries'>
                    <RepositoryEvents repositoryId={repositoryId} />
                  </TabsContent>
                </Tabs>
              </TabsContent>
            </Tabs>
          )
        )}
      </Main>
    </>
  )
}
