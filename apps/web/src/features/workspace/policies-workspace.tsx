import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { ArrowRight, Link2, Workflow } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
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
  SheetTrigger,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RepositoryPicker } from '@/components/repository-picker'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import { engineeringRead } from '../repositories/engineering-queries'
import {
  GatePolicyPanel,
  type Policies,
} from '../repositories/gate-policy-panel'
import { governanceRequest } from '../repositories/governance-api'
import { PipelineWorkflowSetup } from '../repositories/pipeline-workflow-setup'
import { RepositoryBindings } from '../repositories/repository-bindings'
import { TeamPolicyAssignment } from '../teams/team-policy-assignment'
import type { Detail, Options, Team } from '../teams/teams-page'
import { useNavigationSession } from './navigation-session'
import { canPerform } from './scoped-access'

type Repository = {
  githubId: string
  fullName: string
  selected: boolean
  defaultBranch?: string | null
}
export function PoliciesWorkspace({
  repositories,
}: {
  repositories: Repository[]
}) {
  const session = useNavigationSession()
  const [policyTab, setPolicyTab] = useState('branches')
  const search = useSearch({ strict: false }) as {
    repository?: string
    policyScope?: 'repository' | 'team' | 'organization'
    team?: string
    policy?: string
  }
  const scope = search.policyScope ?? 'repository'
  const navigate = useNavigate({ from: '/policies' })
  const client = useQueryClient()
  const [preparedId, setPreparedId] = useState<string | null>(null)
  const identityKey = `${session.data?.identityId}:${session.data?.organizationId}`
  const canReadTeams = canPerform(session.data, 'team.read')
  const canAssign = canPerform(session.data, 'team.policy.assign')
  const canManageTeams = canPerform(session.data, 'team.manage')
  const repository = search.repository
    ? repositories.find((r) => r.githubId === search.repository)
    : repositories[0]
  const options = useQuery({
    queryKey: ['team-options', identityKey],
    queryFn: ({ signal }) =>
      governanceRequest<Options>('/teams/options', undefined, signal),
    enabled: scope !== 'repository' && canReadTeams,
    retry: false,
  })
  const baseline = useQuery({
    queryKey: ['organization-policy-scope', identityKey],
    queryFn: ({ signal }) =>
      governanceRequest<{ teams: Team[] }>(
        '/teams?page=1&q=Organization%20baseline',
        undefined,
        signal
      ),
    enabled: scope === 'organization' && canReadTeams,
    retry: false,
  })
  const organizationTeam = baseline.isError
    ? undefined
    : baseline.data?.teams.find((t) => t.source === 'ORGANIZATION')
  const teamId =
    scope === 'organization'
      ? (organizationTeam?.id ?? preparedId)
      : search.team
  const availableTeam =
    scope === 'organization'
      ? !!teamId
      : options.data?.childTeams?.some((t) => t.id === teamId)
  const detail = useQuery({
    queryKey: ['team-detail', identityKey, teamId],
    queryFn: ({ signal }) =>
      governanceRequest<Detail>(
        `/teams/${encodeURIComponent(teamId!)}`,
        undefined,
        signal
      ),
    enabled:
      scope !== 'repository' &&
      canReadTeams &&
      !options.isError &&
      !!availableTeam,
    retry: false,
  })
  const prepare = useMutation({
    mutationFn: () => governanceRequest<{ id: string }>('/teams/baseline', {}),
    meta: { successMessage: 'Organization scope prepared' },
    onSuccess: async (result) => {
      setPreparedId(result.id)
      await client.invalidateQueries({
        queryKey: ['organization-policy-scope', identityKey],
      })
    },
  })
  async function refreshAssignment() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['team-detail'] }),
      client.invalidateQueries({ queryKey: ['gate-policies'] }),
      client.invalidateQueries({ queryKey: ['repository-standards'] }),
    ])
  }
  const team = detail.isError ? undefined : detail.data
  return (
    <Tabs value={policyTab} onValueChange={setPolicyTab} className='gap-3'>
      <div className='flex flex-wrap items-center gap-2 rounded-xl border p-2.5'>
        <div className='w-full sm:w-36'>
          <label className='sr-only' htmlFor='policy-scope'>
            Policy scope
          </label>
          <Select
            value={scope}
            onValueChange={(
              policyScope: 'repository' | 'team' | 'organization'
            ) =>
              void navigate({
                to: '/policies',
                search: (previous) => ({
                  ...previous,
                  policyScope,
                  team: undefined,
                  policy: undefined,
                }),
              })
            }
          >
            <SelectTrigger id='policy-scope' className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='repository'>Repository</SelectItem>
              <SelectItem value='team'>Team</SelectItem>
              <SelectItem value='organization'>Organization</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {scope === 'repository' && (
          <div className='w-full min-w-0 sm:w-auto sm:flex-1'>
            <RepositoryPicker
              repositories={repositories}
              value={search.repository ?? repository?.githubId ?? ''}
              aria-label='Repository'
              className='w-full sm:max-w-xl'
              onValueChange={(repository) =>
                void navigate({
                  to: '/policies',
                  search: (previous) => ({
                    ...previous,
                    repository,
                    policy: undefined,
                  }),
                })
              }
            />
          </div>
        )}
        {scope === 'team' &&
          canReadTeams &&
          options.data &&
          !options.isError && (
            <div className='w-full min-w-0 space-y-2 sm:flex-1'>
              <label
                htmlFor='policy-team'
                className='text-xs font-medium text-muted-foreground'
              >
                Team
              </label>
              <Select
                value={search.team ?? ''}
                onValueChange={(team) =>
                  void navigate({
                    to: '/policies',
                    search: (previous) => ({ ...previous, team }),
                  })
                }
              >
                <SelectTrigger id='policy-team' className='w-full'>
                  <SelectValue placeholder='Choose a team' />
                </SelectTrigger>
                <SelectContent>
                  {options.data.childTeams?.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        {scope === 'repository' && repository && (
          <TabsList className='w-full p-1 sm:ml-auto sm:w-auto'>
            <TabsTrigger
              value='branches'
              className='min-h-8 flex-1 py-1 sm:flex-none'
            >
              Branch policies
            </TabsTrigger>
            <TabsTrigger
              value='ci'
              className='min-h-8 flex-1 py-1 sm:flex-none'
            >
              CI jobs
            </TabsTrigger>
          </TabsList>
        )}
      </div>
      {scope === 'repository' ? (
        repository ? (
          <>
            <TabsContent value='branches'>
              <GatePolicyPanel
                key={`${repository.githubId}:${search.policy ?? ''}`}
                repositoryId={repository.githubId}
                initialPolicyId={search.policy}
                initialBranch={repository.defaultBranch ?? ''}
                canDraft={canPerform(
                  session.data,
                  'policy.draft',
                  repository.githubId
                )}
                canPublish={canPerform(
                  session.data,
                  'policy.publish',
                  repository.githubId
                )}
                canRequestExceptions={canPerform(
                  session.data,
                  'policy.exception.request',
                  repository.githubId
                )}
                canApproveExceptions={canPerform(
                  session.data,
                  'policy.exception.approve',
                  repository.githubId
                )}
                actorId={session.data?.identityId}
                platformAdmin={session.data?.platformAdmin}
              />
            </TabsContent>
            <TabsContent value='ci'>
              <PolicyCiJobs
                key={repository.githubId}
                onChoosePolicy={() => setPolicyTab('branches')}
                repositoryId={repository.githubId}
                canManage={canPerform(
                  session.data,
                  'policy.draft',
                  repository.githubId
                )}
              />
            </TabsContent>
          </>
        ) : (
          <p role='alert' className='text-sm'>
            This repository is no longer selected or accessible. Choose another
            repository.
          </p>
        )
      ) : !canReadTeams ? (
        <p role='alert' className='text-sm'>
          You need permission to view teams for this assignment scope.
          Repository policies remain available.
        </p>
      ) : options.isPending ||
        (scope === 'organization' && baseline.isPending) ? (
        <div role='status' aria-label='Loading policy scope'>
          <Skeleton className='h-28 rounded-xl' />
        </div>
      ) : options.isError || (scope === 'organization' && baseline.isError) ? (
        <div role='alert' className='space-y-3 rounded-xl border p-4'>
          <p className='text-sm'>
            {options.isError ? options.error.message : baseline.error?.message}
          </p>
          <Button
            size='sm'
            variant='outline'
            onClick={() => {
              void options.refetch()
              if (scope === 'organization') void baseline.refetch()
            }}
          >
            Try again
          </Button>
        </div>
      ) : scope === 'organization' && !teamId ? (
        <section className='space-y-4 rounded-xl border p-4'>
          <h2 className='text-base font-semibold'>Set organization scope</h2>
          <p className='max-w-prose text-sm text-muted-foreground'>
            This includes all {repositories.length} currently selected
            repositories. Future repositories stay outside the scope until
            reviewed. No standards or GitHub rules are applied yet.
          </p>
          <details>
            <summary className='cursor-pointer text-sm'>
              Review selected repositories
            </summary>
            <ul className='mt-3 max-h-48 space-y-1 overflow-y-auto text-sm'>
              {repositories.map((r) => (
                <li key={r.githubId}>{r.fullName}</li>
              ))}
            </ul>
          </details>
          {canManageTeams ? (
            <Button
              size='sm'
              disabled={prepare.isPending || !repositories.length}
              onClick={() => prepare.mutate()}
            >
              {prepare.isPending ? 'Preparing…' : 'Prepare organization scope'}
            </Button>
          ) : (
            <p className='text-sm text-muted-foreground'>
              Ask an organization administrator to prepare this scope.
            </p>
          )}
          {prepare.isError && (
            <p role='alert' className='text-sm text-destructive'>
              {prepare.error.message}
            </p>
          )}
        </section>
      ) : scope === 'team' && !search.team ? (
        <div className='space-y-2 py-3'>
          <p className='text-sm font-medium'>
            Choose a team to assign standards
          </p>
          <p className='text-sm text-muted-foreground'>
            Only its approved repositories are included. Manage team membership
            and repository scope in{' '}
            <Link to='/teams' className='underline'>
              Teams
            </Link>
            .
          </p>
        </div>
      ) : !availableTeam ? (
        <p role='alert' className='text-sm'>
          This team is unavailable. Choose an accessible team.
        </p>
      ) : detail.isPending ? (
        <div role='status' aria-label='Loading team assignment'>
          <Skeleton className='h-28 rounded-xl' />
        </div>
      ) : detail.isError ? (
        <div role='alert' className='space-y-3 rounded-xl border p-4'>
          <p className='text-sm'>{detail.error.message}</p>
          <Button
            size='sm'
            variant='outline'
            onClick={() => void detail.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : (
        team &&
        options.data && (
          <div className='space-y-6'>
            <div className='space-y-2'>
              <h2 className='text-lg font-semibold'>{team.name}</h2>
              <p className='max-w-prose text-sm text-muted-foreground'>
                Choose standards, preview each repository’s changes, then create
                drafts. Existing team requirements are retained. Approval and
                publication stay separate.
              </p>
            </div>
            {canAssign &&
            team.repositories.some((r) => r.policyScopeEnabled) ? (
              <TeamPolicyAssignment
                key={`${team.id}:${team.revision}`}
                team={team}
                options={options.data}
                onApplied={refreshAssignment}
              />
            ) : (
              <p className='rounded-xl border p-4 text-sm'>
                {canAssign
                  ? 'Approve repository scope in Teams before assigning standards.'
                  : 'You can review assignments. Ask an authorized administrator to make changes.'}
              </p>
            )}
            {!!team.impact.length && (
              <section className='space-y-3'>
                <h3 className='text-sm font-semibold'>
                  Review branch policies
                </h3>
                <div className='divide-y rounded-lg border'>
                  {team.impact.slice(0, 10).map((row) => (
                    <div
                      key={`${row.githubId}:${row.branchRef}`}
                      className='flex flex-wrap items-center justify-between gap-3 p-3 text-sm'
                    >
                      <div className='min-w-0'>
                        <p className='font-medium break-words'>{row.name}</p>
                        <p className='text-xs text-muted-foreground'>
                          {row.branchRef?.replace('refs/heads/', '') ??
                            'No branch assigned'}
                        </p>
                      </div>
                      <div className='flex flex-wrap items-center gap-2'>
                        <StatusBadge
                          tone={!row.current ? 'warning' : 'neutral'}
                        >
                          {!row.current
                            ? 'Needs review'
                            : row.state === 'PUBLISHED'
                              ? 'Published'
                              : row.state === 'APPROVED'
                                ? 'Approved'
                                : row.state === 'DRAFT'
                                  ? 'Draft'
                                  : 'Not assigned'}
                        </StatusBadge>
                        <Button size='sm' variant='outline' asChild>
                          <Link
                            to='/policies'
                            search={{ repository: row.githubId }}
                          >
                            Review
                            <ArrowRight className='size-4' />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                {team.impact.length > 10 && (
                  <p className='text-xs text-muted-foreground'>
                    Showing the first 10 repositories. All assignments remain
                    available in{' '}
                    <Link to='/teams' className='underline'>
                      Teams
                    </Link>
                    .
                  </p>
                )}
              </section>
            )}
          </div>
        )
      )}
    </Tabs>
  )
}

function PolicyCiJobs({
  repositoryId,
  canManage,
  onChoosePolicy,
}: {
  repositoryId: string
  canManage: boolean
  onChoosePolicy: () => void
}) {
  const session = useNavigationSession()
  const [chosen, setChosen] = useState<string | null>(null)
  const policies = useQuery({
    queryKey: ['gate-policies', repositoryId],
    retry: false,
    queryFn: ({ signal }) =>
      engineeringRead<Policies>(repositoryId, '/gate-policies', signal),
  })
  const active =
    policies.data?.revisions.filter(
      (policy) =>
        ['DRAFT', 'APPROVED', 'PUBLISHED'].includes(policy.state) &&
        (policy.state !== 'PUBLISHED' ||
          !policies.data?.revisions.some(
            (other) =>
              other.state === 'PUBLISHED' &&
              other.branchRef === policy.branchRef &&
              other.revision > policy.revision
          ))
    ) ?? []
  const selected =
    active.find((policy) => policy.id === chosen) ??
    active.find((policy) => policy.state === 'PUBLISHED') ??
    active[0]
  if (policies.isPending)
    return (
      <p role='status' className='text-sm text-muted-foreground'>
        Loading policies…
      </p>
    )
  if (policies.isError)
    return (
      <div role='alert' className='space-y-3 rounded-xl border p-4'>
        <p>{policies.error.message}</p>
        <Button variant='outline' onClick={() => void policies.refetch()}>
          Retry
        </Button>
      </div>
    )
  return (
    <div className='space-y-3'>
      {(!selected || selected.state !== 'PUBLISHED') && (
        <Card>
          <CardHeader>
            <div className='flex items-center gap-3'>
              <SurfaceIcon icon={Workflow} tone='teal' />
              <div>
                <CardTitle>Connect GitHub Actions</CardTitle>
                <CardDescription>
                  Run your policy in an existing workflow and see its results in
                  Preflyt.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className='space-y-3'>
            <div className='grid gap-3 text-sm sm:grid-cols-3'>
              <div className='rounded-lg border p-3'>
                <p className='font-medium'>1. Choose a policy</p>
                <p className='mt-1 text-muted-foreground'>
                  Create and publish the standards for your PR target branch.
                </p>
              </div>
              <div className='rounded-lg border p-3'>
                <p className='font-medium'>2. Connect a workflow</p>
                <p className='mt-1 text-muted-foreground'>
                  Open your GitHub workflow, add the policy checks and review a
                  setup PR.
                </p>
              </div>
              <div className='rounded-lg border p-3'>
                <p className='font-medium'>3. See results</p>
                <p className='mt-1 text-muted-foreground'>
                  Completed runs become assessments, with optional PR summary
                  comments.
                </p>
              </div>
            </div>
            <Button onClick={onChoosePolicy}>
              Choose branch policy <ArrowRight className='size-4' />
            </Button>
          </CardContent>
        </Card>
      )}
      {!selected ? null : (
        <>
          <div className='flex flex-wrap items-center gap-2'>
            <label
              htmlFor='ci-policy'
              className='text-xs font-medium text-muted-foreground'
            >
              Branch policy
            </label>
            <Select value={selected.id} onValueChange={setChosen}>
              <SelectTrigger id='ci-policy' className='w-full sm:w-80'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {active.map((policy) => (
                  <SelectItem key={policy.id} value={policy.id}>
                    {policy.branchRef.replace(/^refs\/heads\//, '')} · v
                    {policy.revision} · {policy.state.toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Sheet key={`sources:${selected.id}`}>
              <SheetTrigger asChild>
                <Button variant='outline' size='sm' className='sm:ml-auto'>
                  <Link2 className='size-4' /> Check sources
                </Button>
              </SheetTrigger>
              <SheetContent className='w-full gap-0 sm:max-w-2xl'>
                <SheetHeader className='border-b pr-12'>
                  <SheetTitle>Check sources</SheetTitle>
                  <SheetDescription>
                    Workflow setup connects sources automatically. Review or
                    change them here when reusing existing CI jobs.
                  </SheetDescription>
                </SheetHeader>
                <div className='min-h-0 flex-1 overflow-y-auto p-4'>
                  <RepositoryBindings
                    key={`${selected.id}:${selected.selectionId}`}
                    repositoryId={repositoryId}
                    policyId={selected.id}
                    canManage={canManage}
                  />
                </div>
              </SheetContent>
            </Sheet>
          </div>
          {selected.state === 'PUBLISHED' && (
            <PipelineWorkflowSetup
              key={`pipeline:${selected.id}`}
              repositoryId={repositoryId}
              policyId={selected.id}
              canManage={
                canManage &&
                canPerform(session.data, 'policy.publish', repositoryId)
              }
            />
          )}
        </>
      )}
    </div>
  )
}
