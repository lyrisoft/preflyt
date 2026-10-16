import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRight, GitBranch, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import {
  useStandards,
  type Standards,
  type Selection,
} from '@/features/repositories/repository-queries'
import {
  canPerform,
  type ScopedSession,
} from '@/features/workspace/scoped-access'
import {
  inspectFirstRepository,
  saveFirstStandards,
} from './create-first-report'
import type { DashboardData } from './dashboard-types'
import { FirstReportAction } from './first-report-action'

type Repository = DashboardData['repositories'][number]
const steps = [
  {
    title: 'Inspect your repository',
    description:
      'Find its languages, frameworks and existing CI configuration.',
  },
  {
    title: 'Review and save standards',
    description: 'Choose the recommended standards you want to assess.',
  },
  {
    title: 'Create your first CI assessment',
    description: 'See recorded results and which CI evidence is still missing.',
  },
]

function RecommendedStandards({
  data,
  disabled,
  onSave,
}: {
  data: Standards
  disabled: boolean
  onSave: (packs: Selection['packs']) => void
}) {
  const [selected, setSelected] = useState(
    () => new Set(data.recommendations.map((pack) => pack.id))
  )
  return (
    <div className='space-y-4'>
      <fieldset disabled={disabled} className='space-y-3'>
        <legend className='mb-3 text-sm font-medium'>
          Recommended for this repository
        </legend>
        {data.recommendations.map((pack) => {
          const definition = data.catalogue.find(
            (item) => item.id === pack.id && item.version === pack.version
          )
          return (
            <div key={pack.id} className='space-y-2'>
              <label className='flex min-h-9 cursor-pointer items-start gap-3 text-sm'>
                <Checkbox
                  className='mt-0.5'
                  checked={selected.has(pack.id)}
                  onCheckedChange={(checked) =>
                    setSelected((previous) => {
                      const next = new Set(previous)
                      if (checked === true) next.add(pack.id)
                      else next.delete(pack.id)
                      return next
                    })
                  }
                />
                <span className='min-w-0'>
                  <span className='font-medium'>
                    {definition?.title ?? pack.id}
                  </span>
                  <span className='ml-2 text-xs text-muted-foreground'>
                    v{pack.version}
                  </span>
                  <span className='mt-1 block text-muted-foreground'>
                    {pack.reason}
                  </span>
                </span>
              </label>
              {!!definition?.rules.length && (
                <details className='ml-7 text-xs text-muted-foreground'>
                  <summary className='cursor-pointer'>
                    Review {definition.rules.length} checks
                  </summary>
                  <ul className='mt-2 list-disc space-y-1 pl-4'>
                    {definition.rules.map((rule) => (
                      <li key={rule.id}>{rule.title}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )
        })}
      </fieldset>
      <Button
        disabled={disabled || !selected.size}
        onClick={() =>
          onSave(
            data.recommendations
              .filter((pack) => selected.has(pack.id))
              .map(({ id, version }) => ({ id, version }))
          )
        }
      >
        {disabled && (
          <LoaderCircle
            aria-hidden='true'
            className='animate-spin motion-reduce:animate-none'
          />
        )}
        {disabled ? 'Saving standards…' : 'Save standards and continue'}
        {!disabled && <ArrowRight aria-hidden='true' />}
      </Button>
    </div>
  )
}

function RepositorySetup({
  repository,
  session,
}: {
  repository: Repository
  session?: ScopedSession
}) {
  const query = useStandards(repository.githubId)
  const client = useQueryClient()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const busy = useRef(false)
  const focusNext = useRef(false)
  const stepHeading = useRef<HTMLHeadingElement>(null)
  const data = query.data
  const index = !data?.profileSnapshot
    ? 0
    : !data.selection || !data.selectionIntegrity
      ? 1
      : 2
  useEffect(() => {
    if (focusNext.current) {
      stepHeading.current?.focus()
      focusNext.current = false
    }
  }, [index])
  const permission = ['repository.manage', 'policy.draft', 'assessment.run'][
    index
  ]
  const canAct = canPerform(session, permission, repository.githubId)
  async function advance(action: () => Promise<Standards>) {
    if (busy.current) return
    busy.current = true
    setPending(true)
    setError('')
    try {
      const saved = await action()
      focusNext.current = true
      client.setQueryData(['repository-standards', repository.githubId], saved)
      await client.invalidateQueries({ queryKey: ['engineering-dashboard'] })
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Could not finish this step. Try again.'
      )
      // Refresh after conflicts/access changes; the next action uses canonical saved state.
      void query.refetch()
    } finally {
      busy.current = false
      setPending(false)
    }
  }
  return (
    <>
      <ol className='grid gap-4 md:grid-cols-3' aria-label='First report setup'>
        {steps.map((step, position) => {
          const current = !!data && index === position
          const complete = !!data && position < index
          const partial =
            position === 0 && data?.profileSnapshot?.complete === false
          return (
            <li
              key={step.title}
              aria-current={current ? 'step' : undefined}
              className='min-w-0 space-y-2'
            >
              <div className='flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
                <span>Step {position + 1}</span>
                {complete ? (
                  <StatusBadge tone={partial ? 'warning' : 'success'}>
                    {partial ? 'Partial' : 'Completed'}
                  </StatusBadge>
                ) : current ? (
                  <span className='font-medium text-foreground'>Up next</span>
                ) : null}
              </div>
              <h3 className='text-sm font-semibold'>{step.title}</h3>
              <p className='text-sm leading-relaxed text-muted-foreground'>
                {step.description}
              </p>
            </li>
          )
        })}
      </ol>
      <div className='space-y-4 border-t pt-4' aria-busy={pending}>
        {query.isPending ? (
          <p role='status' className='text-sm text-muted-foreground'>
            Loading saved setup progress…
          </p>
        ) : query.isError ? (
          <>
            <p role='alert' className='text-sm text-destructive'>
              {query.error.message}
            </p>
            <Button variant='outline' onClick={() => void query.refetch()}>
              Retry setup
            </Button>
          </>
        ) : (
          data && (
            <>
              <h3
                ref={stepHeading}
                tabIndex={-1}
                className='text-sm font-semibold outline-none'
              >
                Step {index + 1}: {steps[index].title}
              </h3>
              {error && (
                <p role='alert' className='text-sm text-destructive'>
                  {error}
                </p>
              )}
              {!canAct ? (
                <p className='text-sm text-muted-foreground'>
                  Ask an organization admin or repository maintainer to complete
                  this step. Your saved progress is kept.
                </p>
              ) : index === 0 ? (
                <Button
                  onClick={() =>
                    void advance(() =>
                      inspectFirstRepository(repository.githubId)
                    )
                  }
                  disabled={pending}
                >
                  {pending && (
                    <LoaderCircle
                      aria-hidden='true'
                      className='animate-spin motion-reduce:animate-none'
                    />
                  )}
                  {pending ? 'Inspecting repository…' : 'Inspect repository'}
                  {!pending && <ArrowRight aria-hidden='true' />}
                </Button>
              ) : index === 1 ? (
                data.selection ? (
                  <p className='text-sm text-muted-foreground'>
                    Saved standard versions need review. Open the repository’s
                    Standards tab to resolve them before continuing.
                  </p>
                ) : data.recommendations.length ? (
                  <RecommendedStandards
                    key={data.profileSnapshot?.sourceSha}
                    data={data}
                    disabled={pending}
                    onSave={(packs) =>
                      void advance(() =>
                        saveFirstStandards(repository.githubId, packs)
                      )
                    }
                  />
                ) : (
                  <p className='text-sm text-muted-foreground'>
                    No standards were recommended for this stack. Choose
                    standards in the repository’s Standards tab, then return
                    here to continue.
                  </p>
                )
              ) : (
                <div className='space-y-3'>
                  <p className='max-w-prose text-sm text-muted-foreground'>
                    Your saved standards are ready. Create an assessment for the
                    inspected commit. Missing CI results will remain visible.
                  </p>
                  <ul className='list-disc space-y-1 pl-5 text-sm'>
                    {data.selection?.packs.map((pack) => (
                      <li key={pack.id}>
                        {data.catalogue.find(
                          (item) =>
                            item.id === pack.id && item.version === pack.version
                        )?.title ?? pack.id}
                        <span className='ml-2 text-xs text-muted-foreground'>
                          v{pack.version}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <FirstReportAction repositoryId={repository.githubId} />
                </div>
              )}
              {canAct && (
                <Button asChild variant='outline'>
                  <Link
                    to='/repositories/$repositoryId'
                    params={{ repositoryId: repository.githubId }}
                    search={{
                      tab:
                        index === 1
                          ? 'standards'
                          : index === 2
                            ? 'assessments'
                            : 'overview',
                    }}
                  >
                    {index === 1
                      ? 'Open repository standards'
                      : index === 2
                        ? 'View assessments'
                        : 'Open repository details'}
                    <ArrowRight aria-hidden='true' />
                  </Link>
                </Button>
              )}
              <p className='max-w-prose text-xs leading-relaxed text-muted-foreground'>
                Saving standards does not enable merge blocking or AI source
                sharing.
              </p>
            </>
          )
        )}
      </div>
    </>
  )
}

export function FirstReport({
  repositories,
  session,
}: {
  repositories: Repository[]
  session?: ScopedSession
}) {
  if (repositories.some((repository) => repository.latestAssessment))
    return null
  const repository =
    repositories.find((candidate) =>
      canPerform(session, 'assessment.run', candidate.githubId)
    ) ?? repositories[0]
  return (
    <Card>
      <CardHeader className='gap-4 sm:flex-row sm:items-start'>
        <SurfaceIcon icon={GitBranch} tone='teal' />
        <div className='min-w-0 space-y-2'>
          <CardTitle>Set up your first CI assessment</CardTitle>
          <CardDescription>
            Inspect a repository, review its standards, then create an
            assessment. Repository Health is also available without CI.
          </CardDescription>
          {repository && (
            <p className='text-xs break-all text-muted-foreground'>
              {repository.fullName}
            </p>
          )}
        </div>
      </CardHeader>
      <CardContent className='space-y-5'>
        {repository ? (
          <RepositorySetup
            key={repository.githubId}
            repository={repository}
            session={session}
          />
        ) : (
          <div className='space-y-4'>
            <p className='text-sm text-muted-foreground'>
              First, select a repository from your connected GitHub
              installation. Its inspection and standards steps will appear here.
            </p>
            {canPerform(session, 'repository.manage') ? (
              <Button asChild>
                <Link to='/repositories'>
                  Select a repository
                  <ArrowRight aria-hidden='true' />
                </Link>
              </Button>
            ) : (
              <p className='text-sm text-muted-foreground'>
                Ask an organization admin to select a repository.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
