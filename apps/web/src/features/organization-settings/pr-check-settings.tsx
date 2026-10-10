import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { API_BASE_URL } from '@/lib/api'
import { RepositoryPicker } from '@/components/repository-picker'
import { ReadinessAutomation } from '@/features/repositories/readiness-automation'
import { useNavigationSession } from '@/features/workspace/navigation-session'
import { canPerform } from '@/features/workspace/scoped-access'
import { AiPrFeedback } from './ai-pr-feedback'

export function PrCheckSettings() {
  const session = useNavigationSession()
  const [selected, setSelected] = useState('')
  const inventory = useQuery({
    queryKey: [
      'pr-check-settings-repositories',
      session.data?.identityId,
      session.data?.organizationId,
    ],
    enabled: session.isSuccess && canPerform(session.data, 'policy.publish'),
    retry: false,
    queryFn: async ({
      signal,
    }): Promise<{
      repositories: { githubId: string; fullName: string; selected: boolean }[]
    }> => {
      const response = await fetch(`${API_BASE_URL}/github/repositories`, {
        credentials: 'include',
        cache: 'no-store',
        signal,
      })
      if (!response.ok)
        throw new Error(
          'Could not load repositories. Refresh and check your access.'
        )
      return response.json()
    },
  })
  if (!canPerform(session.data, 'policy.publish')) return <AiPrFeedback />
  if (inventory.isPending) return <p role='status'>Loading repositories…</p>
  if (inventory.isError)
    return (
      <p role='alert' className='text-sm text-destructive'>
        {inventory.error.message}
      </p>
    )
  const repositories = inventory.data.repositories.filter(
    (repo) =>
      repo.selected && canPerform(session.data, 'policy.publish', repo.githubId)
  )
  const repository =
    repositories.find((repo) => repo.githubId === selected) ?? repositories[0]
  return (
    <section className='space-y-4'>
      <AiPrFeedback />
      {repository ? (
        <>
          <RepositoryPicker
            repositories={repositories}
            value={repository.githubId}
            aria-label='Repository for PR check settings'
            onValueChange={setSelected}
            className='w-full sm:w-96'
          />
          <ReadinessAutomation
            key={repository.githubId}
            repositoryId={repository.githubId}
            actorId={session.data?.identityId}
            canPublish
            settingsOnly
          />
        </>
      ) : (
        <p className='text-sm text-muted-foreground'>
          No selected repositories allow you to publish PR checks.
        </p>
      )}
    </section>
  )
}
