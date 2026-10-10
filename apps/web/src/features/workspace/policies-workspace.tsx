import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RepositoryPicker } from '@/components/repository-picker'
import { StatusBadge } from '@/components/status-badge'
import { engineeringRead } from '../repositories/engineering-queries'
import {
  GatePolicyPanel,
  type Policies,
} from '../repositories/gate-policy-panel'
import { governanceRequest } from '../repositories/governance-api'
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
    <div className='space-y-6'>
      <div className='flex flex-wrap items-end gap-4 rounded-xl border p-4'>
        <div className='w-full space-y-2 sm:w-44'>
          <label
            className='text-xs font-medium text-muted-foreground'
            htmlFor='policy-scope'
          >
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
          <div className='min-w-0 flex-1'>
            <RepositoryPicker
              repositories={repositories}
              value={search.repository ?? repository?.githubId ?? ''}
              aria-label='Repository'
              className='w-full'
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
      </div>
      {scope === 'repository' ? (
        repository ? (
          <Tabs
            key={repository.githubId}
            defaultValue='branches'
            className='space-y-6'
          >
            <TabsList>
              <TabsTrigger value='branches'>Branch policies</TabsTrigger>
              <TabsTrigger value='ci'>CI jobs</TabsTrigger>
            </TabsList>
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
                actorId={session.data?.identityId}
                platformAdmin={session.data?.platformAdmin}
              />
            </TabsContent>
            <TabsContent value='ci'>
              <PolicyCiJobs
                repositoryId={repository.githubId}
                canManage={canPerform(
                  session.data,
                  'policy.draft',
                  repository.githubId
                )}
              />
            </TabsContent>
          </Tabs>
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
    </div>
  )
}

function PolicyCiJobs({
  repositoryId,
  canManage,
}: {
  repositoryId: string
  canManage: boolean
}) {
  const [chosen, setChosen] = useState<string | null>(null)
  const policies = useQuery({
    queryKey: ['gate-policies', repositoryId],
    retry: false,
    queryFn: ({ signal }) =>
      engineeringRead<Policies>(repositoryId, '/gate-policies', signal),
  })
  const active =
    policies.data?.revisions.filter((policy) =>
      ['DRAFT', 'APPROVED', 'PUBLISHED'].includes(policy.state)
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
    <div className='space-y-5'>
      <p className='max-w-2xl text-sm text-muted-foreground'>
        Use this when a policy should read test or scan results from your
        existing pipeline. These connections do not create or run jobs.
      </p>
      {!selected ? (
        <p className='rounded-xl border p-4 text-sm'>
          No branch policies yet. Create a policy in the Branch policies tab,
          then connect pipeline results here if needed.
        </p>
      ) : (
        <>
          <div className='max-w-md space-y-2'>
            <label htmlFor='ci-policy' className='text-sm font-medium'>
              Branch policy
            </label>
            <Select value={selected.id} onValueChange={setChosen}>
              <SelectTrigger id='ci-policy'>
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
          </div>
          <RepositoryBindings
            key={`${selected.id}:${selected.selectionId}`}
            repositoryId={repositoryId}
            policyId={selected.id}
            canManage={canManage}
          />
        </>
      )}
    </div>
  )
}
