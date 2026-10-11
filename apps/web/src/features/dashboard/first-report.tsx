import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  Check,
  GitBranch,
  ListChecks,
  ScanSearch,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { SurfaceIcon } from '@/components/surface-icon'
import {
  canPerform,
  type ScopedSession,
} from '@/features/workspace/scoped-access'
import type { DashboardData } from './dashboard-types'
import { FirstReportAction } from './first-report-action'

type Repository = DashboardData['repositories'][number]

// Use all-time repository state, not the dashboard's period-filtered metrics.
function firstReportStep(repository: Repository) {
  if (repository.latestAssessment) return null
  if (repository.profileComplete === null) return 'inspect' as const
  if (!repository.policy) return 'standards' as const
  return 'assess' as const
}

const steps = [
  {
    id: 'inspect',
    title: 'Inspect your repository',
    description:
      'Discover languages, frameworks and existing CI configuration.',
    action: 'Inspect repository',
    permission: 'repository.manage',
    tab: 'overview',
    icon: ScanSearch,
  },
  {
    id: 'standards',
    title: 'Choose recommended standards',
    description:
      'Review the suggested checks for your stack. Start by observing results.',
    action: 'Choose standards',
    permission: 'policy.draft',
    tab: 'standards',
    icon: ListChecks,
  },
  {
    id: 'assess',
    title: 'Create your first report',
    description:
      'See which checks have results and what still needs attention.',
    action: 'Create assessment',
    permission: 'assessment.run',
    tab: 'assessments',
    icon: ScanSearch,
  },
] as const

export function FirstReport({
  repositories,
  session,
}: {
  repositories: Repository[]
  session?: ScopedSession
}) {
  // Once any report exists in this scope, the operational overview takes priority.
  if (repositories.some((repository) => repository.latestAssessment))
    return null
  const repository =
    repositories.find((candidate) =>
      canPerform(session, 'assessment.run', candidate.githubId)
    ) ?? repositories[0]
  const canCreateReport =
    !!repository &&
    ['repository.manage', 'policy.draft', 'assessment.run'].every(
      (permission) => canPerform(session, permission, repository.githubId)
    )
  const stepId = repository ? firstReportStep(repository) : null
  const index = steps.findIndex((step) => step.id === stepId)
  const step = steps[index]
  const canAct =
    repository && step
      ? canPerform(session, step.permission, repository.githubId)
      : canPerform(session, 'repository.manage')

  return (
    <Card>
      <CardHeader className='gap-4 sm:flex-row sm:items-start'>
        <SurfaceIcon icon={GitBranch} tone='teal' />
        <div className='min-w-0 space-y-2'>
          <CardTitle>Get your first repository report</CardTitle>
          <CardDescription>
            Find missing checks and engineering issues before they reach your
            main branch.
          </CardDescription>
          {repository && (
            <p className='text-xs break-all text-muted-foreground'>
              {repository.fullName}
            </p>
          )}
        </div>
      </CardHeader>
      <CardContent className='space-y-6'>
        <ol
          className='grid gap-3 md:grid-cols-3'
          aria-label='First report setup'
        >
          {steps.map((item, position) => {
            const complete = !!repository && position < index
            const current = !!repository && position === index
            return (
              <li
                key={item.id}
                aria-current={current ? 'step' : undefined}
                className={`rounded-xl border p-4 ${current ? 'border-primary/40 bg-primary/5' : 'border-border'}`}
              >
                <div className='mb-3 flex items-center gap-2 text-xs text-muted-foreground'>
                  {complete ? (
                    <Check
                      className='size-4 text-emerald-600 dark:text-emerald-400'
                      aria-label='Completed'
                    />
                  ) : (
                    <span>Step {position + 1}</span>
                  )}
                  {current && (
                    <span className='font-medium text-foreground'>Up next</span>
                  )}
                </div>
                <h3 className='text-sm font-semibold'>{item.title}</h3>
                <p className='mt-2 text-sm leading-relaxed text-muted-foreground'>
                  {item.description}
                </p>
              </li>
            )
          })}
        </ol>
        <div className='flex flex-col gap-4 border-t pt-4 sm:flex-row sm:items-center sm:justify-between'>
          <p className='max-w-xl text-xs leading-relaxed text-muted-foreground'>
            {canAct
              ? 'Uses recommended standards unless you have already chosen your own. Missing check results remain visible. Merge blocking and AI source sharing stay unchanged.'
              : 'Ask an organization admin or repository maintainer to complete the next step. Results will appear here once a report is saved.'}
          </p>
          {canCreateReport && (
            <FirstReportAction
              key={repository.githubId}
              repositoryId={repository.githubId}
            />
          )}
          {canAct &&
            (repository && step ? (
              <Button
                asChild
                variant={canCreateReport ? 'outline' : 'default'}
                className='shrink-0 self-end'
              >
                <Link
                  to='/repositories/$repositoryId'
                  params={{ repositoryId: repository.githubId }}
                  search={{ tab: step.tab }}
                >
                  {canCreateReport ? 'Customize setup' : step.action}
                  <ArrowRight aria-hidden='true' />
                </Link>
              </Button>
            ) : (
              <Button asChild className='shrink-0 self-end'>
                <Link to='/apps'>
                  Select a repository
                  <ArrowRight aria-hidden='true' />
                </Link>
              </Button>
            ))}
        </div>
      </CardContent>
    </Card>
  )
}
