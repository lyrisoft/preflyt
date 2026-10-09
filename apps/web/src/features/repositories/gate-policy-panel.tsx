import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GitBranch, ShieldCheck } from 'lucide-react'
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
import { StatusBadge } from '@/components/status-badge'
import { engineeringPath, engineeringRead } from './engineering-queries'
import { useStandards } from './repository-queries'

type Revision = {
  id: string
  branchRef: string
  revision: number
  selectionId: string
  state: string
  definitionHash: string
  draftedById: string
  approvedById: string | null
  definition: {
    mode: string
    packs: { id: string; version: string; digest: string }[]
    rules: {
      id: string
      title: string
      required: boolean
      capability: string
    }[]
  }
}
type Policies = {
  currentSelectionId: string | null
  truncated: boolean
  revisions: Revision[]
}
export function GatePolicyPanel({
  repositoryId,
  canDraft,
  canPublish,
  actorId,
}: {
  repositoryId: string
  canDraft: boolean
  canPublish: boolean
  actorId?: string
}) {
  const [branch, setBranch] = useState('')
  const [required, setRequired] = useState<string[]>([])
  const client = useQueryClient(),
    standards = useStandards(repositoryId)
  const key = ['gate-policies', repositoryId]
  const query = useQuery({
    queryKey: key,
    retry: false,
    queryFn: ({ signal }) =>
      engineeringRead<Policies>(repositoryId, '/gate-policies', signal),
  })
  const mutation = useMutation({
    mutationFn: async ({ path, body }: { path: string; body: object }) => {
      const response = await fetch(
        engineeringPath(repositoryId, `/gate-policies${path}`),
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      )
      if (!response.ok) {
        const error = (await response.json().catch(() => ({}))) as {
          message?: string | string[]
        }
        throw new Error(
          Array.isArray(error.message)
            ? error.message.join(' · ')
            : (error.message ?? 'Policy update failed. Reload and try again.')
        )
      }
      return response.json() as Promise<Revision>
    },
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  })
  return (
    <Card className='border-info/20'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <ShieldCheck className='size-5 text-info' />
          Versioned advisory policies
        </CardTitle>
        <CardDescription>
          Freeze your standards baseline for an explicit branch, then request
          independent approval. Assessment previews continue to use saved
          standards selections. Publishing saves an advisory definition; GitHub
          checks and enforcement remain disabled.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {query.isPending ? (
          <p role='status'>Loading policy revisions…</p>
        ) : query.isError ? (
          <div role='alert'>
            {query.error.message}
            <Button variant='outline' onClick={() => void query.refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <>
            {canDraft && (
              <form
                className='space-y-3 rounded-lg border bg-info/5 p-4'
                onSubmit={(e) => {
                  e.preventDefault()
                  mutation.mutate({
                    path: '',
                    body: {
                      expectedSelectionId: query.data.currentSelectionId,
                      branchRef: branch,
                      requiredRules: required,
                    },
                  })
                }}
              >
                <label
                  htmlFor={`policy-branch-${repositoryId}`}
                  className='flex items-center gap-2 text-sm font-medium'
                >
                  <GitBranch className='size-4' />
                  Target branch
                </label>
                <div className='flex flex-wrap gap-2'>
                  <Input
                    id={`policy-branch-${repositoryId}`}
                    className='max-w-md'
                    placeholder='refs/heads/development'
                    value={branch}
                    maxLength={255}
                    onChange={(e) => setBranch(e.target.value)}
                    required
                  />
                  <Button
                    type='submit'
                    disabled={
                      mutation.isPending ||
                      !query.data.currentSelectionId ||
                      !branch
                    }
                  >
                    Create draft
                  </Button>
                </div>
                {!query.data.currentSelectionId && (
                  <p className='text-sm text-warning'>
                    Save a standards selection before drafting a policy.
                  </p>
                )}
                {!!standards.data?.controls.filter((rule) => !rule.required)
                  .length && (
                  <fieldset className='space-y-2'>
                    <legend className='mb-2 text-sm text-muted-foreground'>
                      Optional: make advisory rules mandatory. Baseline
                      requirements cannot be weakened.
                    </legend>
                    {standards.data.controls
                      .filter((rule) => !rule.required)
                      .map((rule) => (
                        <label
                          key={rule.id}
                          className='flex items-center gap-2 text-sm'
                        >
                          <Checkbox
                            checked={required.includes(rule.id)}
                            onCheckedChange={(checked) =>
                              setRequired((previous) =>
                                checked === true
                                  ? [...previous, rule.id]
                                  : previous.filter((id) => id !== rule.id)
                              )
                            }
                          />
                          {rule.title}
                        </label>
                      ))}
                  </fieldset>
                )}
              </form>
            )}
            {mutation.isError && (
              <p role='alert' className='text-sm text-destructive'>
                {mutation.error.message}
              </p>
            )}
            {mutation.isSuccess && (
              <p role='status' className='text-sm text-success'>
                Policy revision saved.
              </p>
            )}
            {query.data.truncated && (
              <p role='status' className='text-sm text-warning'>
                Showing the latest 50 revisions. Publication is unavailable
                while history is incomplete.
              </p>
            )}
            {!query.data.revisions.length && (
              <p className='text-sm text-muted-foreground'>
                No policy drafts yet. Choose a branch to freeze the saved
                baseline.
              </p>
            )}
            {query.data.revisions.map((policy) => {
              const stale = policy.selectionId !== query.data.currentSelectionId
              const current = query.data.revisions.find(
                (p) =>
                  p.branchRef === policy.branchRef && p.state === 'PUBLISHED'
              )
              return (
                <div
                  key={policy.id}
                  className='space-y-3 rounded-lg border p-4'
                >
                  <div className='flex flex-wrap items-center justify-between gap-3'>
                    <div>
                      <p className='text-sm font-medium'>
                        {policy.branchRef} · v{policy.revision}
                      </p>
                      <p className='text-xs text-muted-foreground'>
                        Advisory definition
                      </p>
                    </div>
                    <StatusBadge
                      tone={
                        stale
                          ? 'warning'
                          : policy.state === 'PUBLISHED'
                            ? 'success'
                            : 'info'
                      }
                    >
                      {stale ? 'Baseline changed' : policy.state}
                    </StatusBadge>
                  </div>
                  <details>
                    <summary className='cursor-pointer text-sm'>
                      Review frozen requirements (
                      {policy.definition.rules.length})
                    </summary>
                    <ul className='mt-2 space-y-1 text-sm'>
                      {policy.definition.rules.map((rule) => (
                        <li key={rule.id}>
                          {rule.title} ·{' '}
                          {rule.required ? 'Required' : 'Advisory'} ·{' '}
                          {rule.capability.replace('_', ' ')}
                        </li>
                      ))}
                    </ul>
                    <p className='mt-3 text-xs text-muted-foreground'>
                      Pack versions:{' '}
                      {policy.definition.packs
                        .map((pack) => `${pack.id}@${pack.version}`)
                        .join(' · ')}
                    </p>
                    <code className='mt-2 block text-xs break-all text-muted-foreground'>
                      {policy.definitionHash}
                    </code>
                  </details>
                  {canPublish && !stale && (
                    <div className='flex flex-wrap gap-2'>
                      {policy.state === 'DRAFT' && (
                        <Button
                          size='sm'
                          variant='outline'
                          disabled={
                            mutation.isPending ||
                            !actorId ||
                            actorId === policy.draftedById
                          }
                          onClick={() =>
                            mutation.mutate({
                              path: `/${encodeURIComponent(policy.id)}/approve`,
                              body: { expectedHash: policy.definitionHash },
                            })
                          }
                        >
                          Approve reviewed definition
                        </Button>
                      )}
                      {policy.state === 'APPROVED' && (
                        <Button
                          size='sm'
                          disabled={mutation.isPending || query.data.truncated}
                          onClick={() =>
                            mutation.mutate({
                              path: `/${encodeURIComponent(policy.id)}/publish`,
                              body: {
                                expectedHash: policy.definitionHash,
                                expectedPublishedId: current?.id ?? null,
                              },
                            })
                          }
                        >
                          Publish advisory definition
                        </Button>
                      )}
                      {policy.state === 'DRAFT' &&
                        actorId === policy.draftedById && (
                          <p className='text-xs text-muted-foreground'>
                            Another authorized policy publisher must approve
                            your draft.
                          </p>
                        )}
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}
      </CardContent>
    </Card>
  )
}
