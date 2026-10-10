import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { governanceRequest } from '../repositories/governance-api'
import { useNavigationSession } from '../workspace/navigation-session'
import { canPerform } from '../workspace/scoped-access'

type Route = {
  stage: string
  primaryId: string | null
  fallbackId: string | null
  enabled: boolean
  allowSource: boolean
  automaticReviews?: boolean
  publishSummary?: boolean
  publishInline?: boolean
  revision: number
}
type Configuration = { enabled: boolean; routes: Route[] }
export function AiPrFeedback() {
  const session = useNavigationSession(),
    client = useQueryClient()
  const key = [
    'ai-configuration',
    session.data?.identityId,
    session.data?.organizationId,
  ]
  const allowed = canPerform(session.data, 'ai.routing.manage')
  const query = useQuery({
    queryKey: key,
    enabled: allowed,
    retry: false,
    queryFn: ({ signal }) =>
      governanceRequest<Configuration>('/ai/configuration', undefined, signal),
  })
  if (!allowed) return null
  if (query.isPending) return <p role='status'>Loading AI feedback settings…</p>
  if (query.isError)
    return (
      <p role='alert' className='text-sm text-destructive'>
        {query.error.message}
      </p>
    )
  if (!query.data?.enabled) return null
  const override = query.data.routes.find((r) => r.stage === 'pull_request')
  const route = override ?? query.data.routes.find((r) => r.stage === 'default')
  return (
    <Card>
      <CardHeader>
        <CardTitle>AI review feedback</CardTitle>
      </CardHeader>
      <CardContent>
        {!route?.enabled || !route.primaryId ? (
          <p className='text-sm text-muted-foreground'>
            Choose an enabled model in{' '}
            <Link
              to='/intelligence'
              search={{ tab: 'routing' }}
              className='underline'
            >
              Model Router
            </Link>{' '}
            first.
          </p>
        ) : (
          <FeedbackForm
            key={`${override?.revision ?? 0}:${route.revision}`}
            route={route}
            revision={override?.revision ?? 0}
            onSaved={() => client.invalidateQueries({ queryKey: key })}
          />
        )}
      </CardContent>
    </Card>
  )
}
function FeedbackForm({
  route,
  revision,
  onSaved,
}: {
  route: Route
  revision: number
  onSaved: () => Promise<unknown>
}) {
  const [automatic, setAutomatic] = useState(route.automaticReviews ?? false)
  const [summary, setSummary] = useState(route.publishSummary ?? false)
  const [inline, setInline] = useState(route.publishInline ?? false)
  const mutation = useMutation({
    mutationFn: () =>
      governanceRequest('/ai/configuration/routes/pull_request', {
        primaryId: route.primaryId,
        fallbackId: route.fallbackId,
        enabled: route.enabled,
        allowSource: route.allowSource,
        automaticReviews: automatic,
        publishSummary: automatic && summary,
        publishInline: automatic && inline,
        expectedRevision: revision,
      }),
    meta: { successMessage: 'AI PR feedback saved' },
    onSuccess: onSaved,
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    mutation.mutate()
  }
  return (
    <form onSubmit={submit} className='space-y-3'>
      <p className='text-xs text-muted-foreground'>
        Applies to published PR policies across this organization. AI reviews
        provide suggestions.
      </p>
      <label className='flex items-center gap-2 text-sm'>
        <input
          type='checkbox'
          checked={automatic}
          disabled={mutation.isPending}
          onChange={(e) => setAutomatic(e.target.checked)}
        />
        Run assigned AI reviews automatically
      </label>
      <label className='flex items-center gap-2 text-sm'>
        <input
          type='checkbox'
          checked={summary}
          disabled={!automatic || mutation.isPending}
          onChange={(e) => setSummary(e.target.checked)}
        />
        Post an AI review summary
      </label>
      <label className='flex items-center gap-2 text-sm'>
        <input
          type='checkbox'
          checked={inline}
          disabled={!automatic || !route.allowSource || mutation.isPending}
          onChange={(e) => setInline(e.target.checked)}
        />
        Post comments on changed lines
      </label>
      {!route.allowSource && (
        <p className='text-xs text-muted-foreground'>
          Comments on changed lines require source sharing in{' '}
          <Link
            to='/intelligence'
            search={{ tab: 'routing' }}
            className='underline'
          >
            Model Router
          </Link>
          .
        </p>
      )}
      {mutation.isError && (
        <p role='alert' className='text-sm text-destructive'>
          {mutation.error.message}
        </p>
      )}
      <div className='flex justify-end'>
        <Button size='sm' disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save AI feedback'}
        </Button>
      </div>
    </form>
  )
}
