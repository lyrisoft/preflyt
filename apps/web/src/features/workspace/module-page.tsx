import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import {
  ArrowLeft,
  ArrowUpRight,
  ClipboardCheck,
  GitBranch,
  Layers,
  Link2,
  PlugZap,
  SlidersHorizontal,
} from 'lucide-react'
import { IconGithub } from '@/assets/brand-icons'
import { API_BASE_URL } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AppHeader } from '@/components/layout/app-header'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { PageHelpDrawer } from '@/components/page-help-drawer'
import { RepositoryPicker } from '@/components/repository-picker'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import { CheckPublications } from '@/features/repositories/check-publications'
import { RepositoryActivityPanel } from '@/features/repositories/repository-activity-panel'
import { RepositoryAssessments } from '@/features/repositories/repository-assessments'
import { RepositoryCiEvidence } from '@/features/repositories/repository-ci-evidence'
import { RepositoryPullRequests } from '@/features/repositories/repository-pull-requests'
import {
  RepositoryRulesets,
  RulesetDetail,
} from '@/features/repositories/repository-rulesets'
import {
  IntegrationCatalogue,
  type IntegrationId,
} from './integration-catalogue'
import { useNavigationSession } from './navigation-session'
import { OrganizationStandardsLibrary } from './organization-standards-library'
import { PoliciesWorkspace } from './policies-workspace'
import { canPerform } from './scoped-access'

type Module =
  'quality-gates' | 'assessments' | 'standards' | 'policies' | 'integrations'
const modules = {
  'quality-gates': {
    title: 'Merge Protection',
    section: 'Governance',
    icon: ClipboardCheck,
    description:
      'Review branch rules and the checks GitHub requires before merge.',
  },
  assessments: {
    title: 'Assessments',
    section: 'Workspace',
    icon: ClipboardCheck,
    description:
      'See what passed, what needs attention and the evidence behind each result.',
  },
  standards: {
    title: 'Standards',
    section: 'Governance',
    icon: Layers,
    description:
      'Create, edit and adopt versioned standards for your organization.',
  },
  policies: {
    title: 'Policies',
    section: 'Governance',
    icon: SlidersHorizontal,
    description:
      'Define branch requirements and connect them to GitHub Actions.',
  },
  integrations: {
    title: 'Integrations',
    section: 'Administration',
    icon: PlugZap,
    description:
      'Review GitHub access and the check results and reports available to Preflyt.',
  },
}
type Repository = { githubId: string; fullName: string; selected: boolean }
type Inventory = {
  repositories: Repository[]
  installations: { id: string; accountLogin: string; active: boolean }[]
}

async function read<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    signal,
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('Could not load workspace data. Try again.')
  return response.json() as Promise<T>
}

export function WorkspaceModule({ module }: { module: Module }) {
  const [integration, setIntegration] = useState<IntegrationId | null>('github')
  const config = modules[module]
  const search = useSearch({ strict: false }) as {
    repository?: string
    assessment?: string
    from?: 'quality-gates'
    ruleset?: number
    rulesetView?: 'github' | 'drafts' | 'deployments'
    gate?: 'assessments' | 'rulesets' | 'checks'
    tab?: 'commits' | 'pull-requests' | 'activity'
  }
  const rulesetDetailView = module === 'quality-gates' && !!search.ruleset
  const reportView = module === 'assessments' && !!search.assessment
  // Legacy results links now open protection controls; assessment history has one home.
  const gateView = search.gate === 'checks' ? 'checks' : 'rulesets'
  const assessmentView =
    search.tab === 'pull-requests' ? 'pull-requests' : 'commits'
  const navigate = useNavigate()
  const inventory = useQuery({
    queryKey: ['workspace-repositories'],
    queryFn: ({ signal }) => read<Inventory>('/github/repositories', signal),
    staleTime: 30_000,
    retry: false,
  })
  const session = useNavigationSession()
  const repositories =
    inventory.data?.repositories.filter((repo) => repo.selected) ?? []
  // An inaccessible URL selection must never fall through to another repository.
  const repository = search.repository
    ? repositories.find((repo) => repo.githubId === search.repository)
    : reportView || rulesetDetailView
      ? undefined
      : repositories[0]
  const canManage = canPerform(session.data, 'repository.connect')
  if (rulesetDetailView)
    return (
      <>
        <AppHeader
          breadcrumbs={[
            { label: 'Merge Protection', to: '/quality-gates' },
            { label: 'Ruleset details' },
          ]}
        />
        <Main>
          <PageHeader
            className='mb-5'
            title='Ruleset details'
            description={`Rules reported by GitHub for ${repository?.fullName ?? 'the selected repository'}.`}
            section='Governance'
            icon={ClipboardCheck}
            tone='blue'
            actions={
              <>
                <Button variant='outline' size='sm' asChild>
                  <Link
                    to='/quality-gates'
                    search={{
                      repository: search.repository,
                      gate: 'rulesets',
                      rulesetView: 'github',
                    }}
                  >
                    <ArrowLeft className='size-4' />
                    Back to rulesets
                  </Link>
                </Button>
                <PageHelpDrawer
                  title='Ruleset details help'
                  sections={[
                    {
                      title: 'Configuration',
                      content: (
                        <p>
                          Shows the branch patterns and rules GitHub reports for
                          this repository. Use View on GitHub to manage the
                          ruleset.
                        </p>
                      ),
                    },
                    {
                      title: 'Insights',
                      content: (
                        <p>
                          The graph and counts cover the matching rule results
                          on the current page, grouped by UTC date or hour. Use
                          Filter to choose the history source, period, result,
                          branch and user. Use Next to view more evaluations.
                          These are GitHub ruleset results; Preflyt policy
                          results are available under Assessments.
                        </p>
                      ),
                    },
                  ]}
                />
              </>
            }
          />
          {inventory.isPending ? (
            <Skeleton className='h-48' />
          ) : inventory.isError ? (
            <Card>
              <CardContent className='space-y-3'>
                <p role='alert'>{inventory.error.message}</p>
                <Button
                  variant='outline'
                  onClick={() => void inventory.refetch()}
                >
                  Try again
                </Button>
              </CardContent>
            </Card>
          ) : repository ? (
            <RulesetDetail
              key={`${repository.githubId}-${search.ruleset}`}
              repositoryId={repository.githubId}
              actorId={session.data?.identityId}
              id={search.ruleset!}
              canRead={canPerform(
                session.data,
                'policy.read',
                repository.githubId
              )}
            />
          ) : (
            <p role='alert' className='rounded-lg border p-4 text-sm'>
              This ruleset needs an accessible, selected repository. Return to
              the list and choose a repository.
            </p>
          )}
        </Main>
      </>
    )
  return (
    <Tabs
      value={module === 'assessments' ? assessmentView : gateView}
      onValueChange={(value) =>
        void navigate({
          ...(module === 'assessments'
            ? {
                to: '/assessments' as const,
                search: {
                  repository: search.repository,
                  tab: value as 'commits' | 'pull-requests' | 'activity',
                },
              }
            : {
                to: '/quality-gates' as const,
                search: {
                  repository: search.repository,
                  gate: value as 'assessments' | 'rulesets' | 'checks',
                },
              }),
        })
      }
      className='contents'
    >
      <AppHeader
        breadcrumbs={
          reportView
            ? [
                { label: 'Assessments', to: '/assessments' },
                { label: 'Report' },
              ]
            : [{ label: config.title }]
        }
      />
      <Main>
        {module !== 'standards' && (
          <PageHeader
            className={module === 'policies' ? 'mb-3 gap-3 p-3' : 'mb-5'}
            title={reportView ? 'Assessment report' : config.title}
            description={
              reportView
                ? `Checks and evidence for ${repository?.fullName ?? 'the selected repository'}.`
                : config.description
            }
            section={module === 'policies' ? undefined : config.section}
            icon={config.icon}
            tone={module === 'integrations' ? 'teal' : 'blue'}
            actions={
              <>
                {reportView ? (
                  <Button variant='outline' size='sm' asChild>
                    {search.from === 'quality-gates' ? (
                      <Link
                        to='/quality-gates'
                        search={{
                          repository: search.repository,
                          gate: 'rulesets',
                        }}
                      >
                        <ArrowLeft aria-hidden='true' />
                        Back to merge protection
                      </Link>
                    ) : (
                      <Link
                        to='/assessments'
                        search={{
                          repository: search.repository,
                          tab: 'commits',
                        }}
                      >
                        <ArrowLeft aria-hidden='true' />
                        Back to assessments
                      </Link>
                    )}
                  </Button>
                ) : (
                  <Button variant='outline' size='sm' asChild>
                    <Link to='/apps'>
                      <GitBranch className='size-3.5' aria-hidden='true' />
                      Manage repositories
                    </Link>
                  </Button>
                )}
                {module === 'quality-gates' && (
                  <Button variant='outline' size='sm' asChild>
                    <Link
                      to='/assessments'
                      search={{ repository: repository?.githubId }}
                    >
                      <ClipboardCheck aria-hidden='true' />
                      View assessments
                    </Link>
                  </Button>
                )}
                {module === 'policies' && (
                  <PageHelpDrawer
                    title='Policies'
                    sections={[
                      {
                        title: 'What is a policy?',
                        content:
                          'A branch policy defines which standards a repository branch must follow. Standards group checks; assessments show the results of evaluating those checks.',
                      },
                      {
                        title: 'Create a branch policy',
                        content:
                          'Select a repository, open Branch policies and choose New policy. Choose the branch and standards, then save the draft. Review its requirements, obtain approval and publish it. Publishing makes the approved policy available for PR evaluation. Users other than a local Super Admin need another authorized reviewer to approve it.',
                      },
                      {
                        title: 'What are CI jobs?',
                        content:
                          'Choose a published policy and open its repository workflow in the YAML editor. Add checks from the policy panel or request an AI proposal, review the changes, then create a setup PR. The PR includes the workflow and Preflyt Action files. GitHub runs your checks; Preflyt verifies results and saves assessments. Workflow setup connects check sources automatically. Use Check sources beside the policy selector to review existing CI job mappings. PR summary comments are optional.',
                      },
                      {
                        title: 'When no CI jobs appear',
                        content:
                          'Run the repository’s existing GitHub workflow, then refresh jobs. If jobs are still missing, check that the connected GitHub App sends workflow and check events to Preflyt. A successful job alone may not provide the verified report needed to evaluate a check. Missing results stay incomplete.',
                      },
                      {
                        title: 'See results and enable merge protection',
                        content:
                          'Open Assessments to see evaluated checks and their evidence. Configure automatic PR check publishing under Settings → PR checks. Publishing a policy does not run tests or block merging by itself. GitHub blocks merging only when active branch rules require the Preflyt check; manage those rules under Merge Protection.',
                      },
                      {
                        title: 'Organization and team scope',
                        content:
                          'Organization and team assignments apply shared standards to their authorized repositories. Review the affected repositories before applying changes. Branch policies include inherited requirements alongside the standards you select.',
                      },
                    ]}
                  />
                )}
                {module === 'quality-gates' && (
                  <PageHelpDrawer
                    title='Merge Protection'
                    sections={[
                      {
                        title: 'Branch protection and assessment results',
                        content:
                          'This page shows GitHub branch rules and manages approved Preflyt protections. GitHub enforces active rules and decides whether merging is allowed. Assessment history and saved check evidence are under Assessments. Use View assessments to open that repository’s reports.',
                      },
                      {
                        title: 'GitHub rulesets',
                        content:
                          'Rulesets come from GitHub for the selected repository, including inherited organization or enterprise rules. Active rules are enforced by GitHub; Evaluate records evaluations without blocking, and Disabled rules are not enforced. The discovery view does not report legacy branch protection. Deployments manages only the dedicated Preflyt ruleset.',
                      },
                      {
                        title: 'Publishing merge review results',
                        content:
                          'Automatic checks evaluate the published policy against current PR and workflow evidence. Only verified passing execution can produce success. Missing evidence remains incomplete. The worker invalidates old results before reevaluation and retries failed requests. Checks are refreshed at least once per polling cycle; GitHub outages can delay updates. Manual reviewed publication remains available. Forks, draft PRs and merge queues are unsupported.',
                      },
                      {
                        title: 'Ruleset Insights',
                        content:
                          'Open a GitHub ruleset and choose Insights to see GitHub rule evaluations. Counts cover matching rule results on the current page, not all activity in the selected period. Active failures can block pushes; Evaluate mode records failures without blocking. Suite-wide bypasses do not prove this particular ruleset was bypassed. Preflyt readiness results are shown separately in Merge review result. Insights needs repository Administration: read on the assessment App. Choose Current GitHub history for an on-demand page or Saved GitHub history for evaluations collected by the worker. Saved history shows collection freshness, failures and retention. It cannot recover older evaluations that were never collected; a completed collection sweep does not prove complete period coverage.',
                      },
                      {
                        title: 'Local ruleset drafts',
                        content:
                          'Choose one repository, select up to 20 exact branches, and use a Standard, Strict or Custom profile. The server generates the preview and saves the current standards version with the draft. If standards or the draft change while you edit, reload and review again. Drafts do not change GitHub protections. In Deployments, review affected PRs and exact GitHub configuration, obtain independent administrator approval, then activate. Every target branch needs a recent automatically verified passing check. Old drafts may need saving again to refresh their verification hash.',
                      },
                      {
                        title: 'Scope and freshness',
                        content:
                          'Lists show 20 rulesets per page. Open a ruleset to see branch patterns, rule types and required check sources. GitHub patterns such as ~DEFAULT_BRANCH and ~ALL retain their GitHub meaning. Data is cached for up to one minute; the fetched time reflects the source read. Ruleset absence does not prove the branch is unprotected.',
                      },
                      {
                        title: 'Access and limitations',
                        content:
                          'Only authorized, selected repositories are shown. This uses read-only repository metadata permission. The GitHub discovery view omits bypass actors and full rule parameters. Local drafts show their complete generated configuration. Activation requires separate governance credentials and both ruleset management and enforcement permissions. GitHub changes outside Preflyt are reported as drift and never overwritten. Rollback disables only the dedicated managed ruleset after verifying its current state. Organization-wide targeting and legacy protection remain outside this slice. Unavailable access, plans or throttled requests are reported as errors.',
                      },
                    ]}
                  />
                )}
              </>
            }
          />
        )}
        {module === 'standards' ? (
          <OrganizationStandardsLibrary
            key={`${session.data?.identityId}:${session.data?.organizationId}`}
            renderHeader={(actions) => (
              <PageHeader
                title={config.title}
                description={config.description}
                section={config.section}
                icon={config.icon}
                tone='teal'
                actions={
                  <>
                    <Button variant='outline' size='sm' asChild>
                      <Link to='/apps'>
                        <GitBranch className='size-3.5' aria-hidden='true' />
                        Manage repositories
                      </Link>
                    </Button>
                    {actions}
                  </>
                }
              />
            )}
          />
        ) : inventory.isPending ? (
          <div
            role='status'
            aria-label='Loading workspace repositories'
            className='space-y-4'
          >
            <Skeleton className='h-16 rounded-xl' />
            <div className='grid gap-4 md:grid-cols-2'>
              <Skeleton className='h-56 rounded-xl' />
              <Skeleton className='h-56 rounded-xl' />
            </div>
          </div>
        ) : inventory.isError ? (
          <div
            role='alert'
            className='flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/20 bg-warning/5 p-4'
          >
            <p className='text-sm'>{inventory.error.message}</p>
            <Button
              size='sm'
              variant='outline'
              onClick={() => void inventory.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : reportView ? (
          repository ? (
            <RepositoryAssessments
              key={`${repository.githubId}:${search.assessment}`}
              repositoryId={repository.githubId}
              initialSha=''
              initialAssessmentId={search.assessment}
              canCreate={false}
            />
          ) : (
            <p role='alert' className='rounded-lg border p-4 text-sm'>
              This assessment needs an accessible, selected repository. Return
              to the list and choose a repository.
            </p>
          )
        ) : module === 'policies' ? (
          repositories.length ? (
            <PoliciesWorkspace
              key={`${session.data?.identityId}:${session.data?.organizationId}`}
              repositories={repositories}
            />
          ) : (
            <div className='space-y-3 rounded-xl border p-4'>
              <p className='text-sm'>
                Connect and select a repository before assigning standards.
              </p>
              <Button size='sm' variant='outline' asChild>
                <Link to='/apps'>Manage repositories</Link>
              </Button>
            </div>
          )
        ) : (
          <div className='space-y-6'>
            {module === 'integrations' && (
              <IntegrationCatalogue
                connected={inventory.data.installations.some(
                  (item) => item.active
                )}
                selected={integration}
                onSelect={setIntegration}
              />
            )}
            {module === 'integrations' && integration === 'github' && (
              <Card className='gap-4 overflow-hidden border-chart-2/20'>
                <CardHeader className='flex flex-wrap items-center justify-between gap-3'>
                  <div className='flex items-center gap-3'>
                    <span className='flex size-10 items-center justify-center rounded-lg bg-chart-2/10 text-chart-2'>
                      <IconGithub className='size-5' aria-hidden='true' />
                    </span>
                    <div>
                      <CardTitle asChild>
                        <h2>GitHub connections</h2>
                      </CardTitle>
                      <p className='mt-1 text-xs text-muted-foreground'>
                        Repository access through your GitHub App.
                      </p>
                    </div>
                  </div>
                  {canManage && (
                    <Button size='sm' asChild>
                      <a href={`${API_BASE_URL}/github/install`}>
                        <Link2 className='size-3.5' aria-hidden='true' />
                        Connect GitHub App
                      </a>
                    </Button>
                  )}
                </CardHeader>
                <CardContent className='space-y-4'>
                  <div className='grid grid-cols-2 gap-3'>
                    <div className='rounded-lg border border-chart-2/15 bg-chart-2/5 px-4 py-3'>
                      <p className='text-xs text-muted-foreground'>
                        Active connections
                      </p>
                      <p className='mt-1 text-2xl font-semibold tabular-nums'>
                        {
                          inventory.data.installations.filter(
                            (installation) => installation.active
                          ).length
                        }
                        <span className='ml-2 text-xs font-normal text-muted-foreground'>
                          of {inventory.data.installations.length}
                        </span>
                      </p>
                    </div>
                    <div className='rounded-lg border border-chart-1/15 bg-chart-1/5 px-4 py-3'>
                      <p className='text-xs text-muted-foreground'>
                        Selected repositories
                      </p>
                      <p className='mt-1 text-2xl font-semibold tabular-nums'>
                        {repositories.length}
                      </p>
                    </div>
                  </div>
                  {inventory.data.installations.length === 0 ? (
                    <div className='flex items-start gap-3 rounded-lg border bg-muted/10 px-4 py-4'>
                      <IconGithub
                        className='mt-0.5 size-5 shrink-0 text-muted-foreground'
                        aria-hidden='true'
                      />
                      <div>
                        <p className='text-sm font-medium'>Connect GitHub</p>
                        <p className='mt-1 text-xs text-muted-foreground'>
                          {canManage
                            ? 'Connect the GitHub App, then select the repositories Preflyt can access.'
                            : 'An Owner or Admin can connect the GitHub App and select repositories.'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className='grid gap-3 xl:grid-cols-2'>
                      {inventory.data.installations.map((installation) => (
                        <div
                          key={installation.id}
                          className='flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background/50 p-4'
                        >
                          <div className='flex min-w-0 items-center gap-3'>
                            <span className='flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted text-sm font-semibold'>
                              {installation.accountLogin
                                .slice(0, 2)
                                .toUpperCase()}
                            </span>
                            <div className='min-w-0'>
                              <p
                                className='truncate text-sm font-semibold'
                                title={installation.accountLogin}
                              >
                                {installation.accountLogin}
                              </p>
                              <p className='mt-1 text-xs text-muted-foreground'>
                                {installation.active
                                  ? 'Choose the repositories you want to review.'
                                  : 'Restore GitHub App access to reconnect this account.'}
                              </p>
                              <details className='mt-1 text-xs text-muted-foreground'>
                                <summary className='cursor-pointer'>
                                  Connection details
                                </summary>
                                <span className='font-mono'>
                                  Installation {installation.id}
                                </span>
                              </details>
                            </div>
                          </div>
                          <StatusBadge
                            tone={installation.active ? 'success' : 'warning'}
                          >
                            {installation.active ? 'Active' : 'Unavailable'}
                          </StatusBadge>
                          {canManage && (
                            <Button size='sm' variant='outline' asChild>
                              {installation.active ? (
                                <Link to='/apps'>Manage repositories</Link>
                              ) : (
                                <a href={`${API_BASE_URL}/github/install`}>
                                  Reconnect GitHub
                                </a>
                              )}
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(module !== 'integrations' || integration === 'ci') &&
              (repositories.length === 0 ? (
                <Card>
                  <CardContent className='flex flex-wrap items-center justify-between gap-4 pt-1'>
                    <div className='flex items-start gap-3'>
                      <SurfaceIcon icon={GitBranch} tone='blue' />
                      <div>
                        <h2 className='text-sm font-semibold'>
                          Select a repository to get started
                        </h2>
                        <p className='mt-1 text-xs text-muted-foreground'>
                          Connect GitHub and select repositories to review{' '}
                          {config.title.toLowerCase()}.
                        </p>
                      </div>
                    </div>
                    <Button variant='outline' size='sm' asChild>
                      <Link to='/apps'>
                        View repositories{' '}
                        <ArrowUpRight className='size-3.5' aria-hidden='true' />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className='flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3'>
                    <div className='flex min-w-0 flex-wrap items-center gap-3'>
                      <div className='flex items-center gap-2 text-sm'>
                        <GitBranch
                          className='size-4 text-chart-1'
                          aria-hidden='true'
                        />
                        <label
                          id='workspace-repository-label'
                          className='font-medium'
                        >
                          Repository scope
                        </label>
                      </div>
                      <RepositoryPicker
                        repositories={repositories}
                        value={repository?.githubId ?? ''}
                        aria-labelledby='workspace-repository-label'
                        className='w-full sm:w-80'
                        onValueChange={(value) =>
                          void navigate({
                            to: `/${module}`,
                            search: { ...search, repository: value },
                          })
                        }
                      />
                    </div>
                    <div className='flex flex-wrap items-center gap-2'>
                      {module === 'integrations' && (
                        <Badge
                          variant='outline'
                          className='text-muted-foreground'
                        >
                          {repositories.length} selected{' '}
                          {repositories.length === 1
                            ? 'repository'
                            : 'repositories'}
                        </Badge>
                      )}
                      {repository && (
                        <Button variant='ghost' size='sm' asChild>
                          <Link
                            to='/repositories/$repositoryId'
                            params={{ repositoryId: repository.githubId }}
                          >
                            Open repository{' '}
                            <ArrowUpRight
                              className='size-3.5'
                              aria-hidden='true'
                            />
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                  {repository ? (
                    <div
                      key={`${module}-${repository.githubId}`}
                      className='space-y-5'
                    >
                      {module === 'quality-gates' && (
                        <TabsList
                          aria-label='Merge protection sections'
                          className='h-auto max-w-full flex-wrap justify-start'
                        >
                          <TabsTrigger value='rulesets'>
                            Branch rules
                          </TabsTrigger>
                          <TabsTrigger value='checks'>PR checks</TabsTrigger>
                        </TabsList>
                      )}
                      {module === 'assessments' && (
                        <>
                          <RepositoryActivityPanel
                            repositoryId={repository.githubId}
                          />
                          <TabsList
                            aria-label='Assessment sections'
                            className='h-auto max-w-full flex-wrap justify-start'
                          >
                            <TabsTrigger value='commits'>
                              Commit assessments
                            </TabsTrigger>
                            <TabsTrigger value='pull-requests'>
                              Pull requests
                            </TabsTrigger>
                          </TabsList>
                          <TabsContent
                            value='pull-requests'
                            forceMount
                            className='data-[state=inactive]:hidden'
                          >
                            <RepositoryPullRequests
                              repositoryId={repository.githubId}
                            />
                          </TabsContent>
                          <TabsContent
                            value='commits'
                            forceMount
                            className='data-[state=inactive]:hidden'
                          >
                            <RepositoryAssessments
                              repositoryId={repository.githubId}
                              canCreate={canPerform(
                                session.data,
                                'assessment.run',
                                repository.githubId
                              )}
                              initialSha=''
                            />
                          </TabsContent>
                        </>
                      )}
                      {module === 'quality-gates' &&
                        gateView === 'rulesets' && (
                          <TabsContent value='rulesets'>
                            <RepositoryRulesets
                              key={`${repository.githubId}:${search.rulesetView ?? 'github'}`}
                              initialView={search.rulesetView}
                              repositoryId={repository.githubId}
                              repositoryName={repository.fullName}
                              actorId={session.data?.identityId}
                              canManage={
                                canPerform(
                                  session.data,
                                  'github.ruleset.manage',
                                  repository.githubId
                                ) &&
                                canPerform(
                                  session.data,
                                  'policy.enforcement.manage',
                                  repository.githubId
                                )
                              }
                              canDraft={canPerform(
                                session.data,
                                'policy.draft',
                                repository.githubId
                              )}
                              canRead={canPerform(
                                session.data,
                                'policy.read',
                                repository.githubId
                              )}
                            />
                          </TabsContent>
                        )}
                      {module === 'quality-gates' && gateView === 'checks' && (
                        <TabsContent value='checks'>
                          <CheckPublications
                            key={repository.githubId}
                            repositoryId={repository.githubId}
                            actorId={session.data?.identityId}
                            canRead={canPerform(
                              session.data,
                              'policy.read',
                              repository.githubId
                            )}
                            canPublish={canPerform(
                              session.data,
                              'policy.publish',
                              repository.githubId
                            )}
                          />
                        </TabsContent>
                      )}
                      {module === 'integrations' && (
                        <RepositoryCiEvidence
                          showIntegrationLink={false}
                          repositoryId={repository.githubId}
                          canImport={canPerform(
                            session.data,
                            'evidence.manage',
                            repository.githubId
                          )}
                        />
                      )}
                    </div>
                  ) : (
                    <div
                      role='alert'
                      className='rounded-lg border border-warning/20 bg-warning/5 px-4 py-3 text-sm'
                    >
                      This repository is no longer selected or accessible.
                      Choose another repository.
                    </div>
                  )}
                </>
              ))}
          </div>
        )}
      </Main>
    </Tabs>
  )
}
