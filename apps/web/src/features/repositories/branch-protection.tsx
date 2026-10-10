import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { SurfaceIcon } from '@/components/surface-icon'

type Protection = {
  branch: string
  page: number
  hasMore: boolean
  rules: {
    rulesetId: number
    sourceType: string
    source: string
    type: string
    requiredApprovals: number | null
    checks: { context: string; integrationId: number | null }[]
  }[]
  legacy: {
    status: 'verified' | 'unavailable'
    requiredApprovals?: number
    checks?: string[]
    enforceAdmins?: boolean
  }
}
export function BranchProtection({
  repositoryId,
  actorId,
}: {
  repositoryId: string
  actorId?: string
}) {
  const [input, setInput] = useState('')
  const [branch, setBranch] = useState('')
  const [page, setPage] = useState(1)
  const query = useQuery({
    queryKey: ['branch-protection', actorId, repositoryId, branch, page],
    enabled: Boolean(branch),
    retry: false,
    queryFn: async ({ signal }): Promise<Protection> => {
      const response = await fetch(
        `${API_BASE_URL}/github/repositories/${repositoryId}/rulesets/branch-protection?${new URLSearchParams({ branch, page: String(page) })}`,
        { signal, credentials: 'include', cache: 'no-store' }
      )
      if (!response.ok)
        throw new Error(
          'Branch protection could not be loaded. Check the branch name and GitHub App access, then retry.'
        )
      return response.json()
    },
  })
  const data = query.isError ? undefined : query.data
  return (
    <Card>
      <CardHeader className='flex flex-row items-center gap-3'>
        <SurfaceIcon icon={ShieldCheck} tone='teal' />
        <div>
          <CardTitle>Branch protection</CardTitle>
          <p className='mt-1 text-sm text-muted-foreground'>
            View active rules inherited from GitHub and legacy branch
            protection.
          </p>
        </div>
      </CardHeader>
      <CardContent className='space-y-5'>
        <form
          className='flex flex-wrap items-end gap-3'
          onSubmit={(event) => {
            event.preventDefault()
            setPage(1)
            if (branch === input.trim()) void query.refetch()
            else setBranch(input.trim())
          }}
        >
          <div className='min-w-0 flex-1 space-y-2'>
            <label htmlFor='protection-branch' className='text-sm font-medium'>
              Branch name
            </label>
            <Input
              id='protection-branch'
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder='main'
              maxLength={255}
              required
            />
          </div>
          <Button type='submit' disabled={query.isFetching}>
            View protection
          </Button>
        </form>
        {query.isFetching && (
          <p role='status' className='text-sm text-muted-foreground'>
            Loading branch protection…
          </p>
        )}
        {query.isError && (
          <p role='alert' className='text-sm text-destructive'>
            {query.error.message}
          </p>
        )}
        {data && (
          <>
            <section className='space-y-3'>
              <h3 className='text-sm font-semibold'>
                Active rules for {data.branch}
              </h3>
              {data.rules.length ? (
                data.rules.map((rule, index) => (
                  <div
                    key={`${rule.rulesetId}-${rule.type}-${index}`}
                    className='rounded-xl border p-4'
                  >
                    <p className='text-sm font-medium'>
                      {rule.type.replace(/_/g, ' ')}
                    </p>
                    <p className='mt-1 text-xs break-all text-muted-foreground'>
                      {rule.sourceType} · {rule.source} · Ruleset{' '}
                      {rule.rulesetId}
                    </p>
                    {rule.requiredApprovals !== null && (
                      <p className='mt-2 text-sm'>
                        Required approvals: {rule.requiredApprovals}
                      </p>
                    )}
                    {rule.checks.length > 0 && (
                      <ul className='mt-2 space-y-1 text-sm'>
                        {rule.checks.map((check) => (
                          <li
                            key={`${check.context}-${check.integrationId}`}
                            className='break-all'
                          >
                            {check.context}
                            {check.integrationId
                              ? ` · App ${check.integrationId}`
                              : ''}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))
              ) : (
                <p className='text-sm text-muted-foreground'>
                  GitHub returned no active rules on this page. Legacy
                  protection is shown separately.
                </p>
              )}
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <span className='text-xs text-muted-foreground'>
                  Page {data.page} · GitHub excludes rules in evaluation mode
                  from this view.
                </span>
                <div className='flex gap-2'>
                  <Button
                    variant='outline'
                    disabled={page === 1 || query.isFetching}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant='outline'
                    disabled={!data.hasMore || query.isFetching}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </section>
            <section className='space-y-2 rounded-xl border p-4'>
              <h3 className='text-sm font-semibold'>
                Legacy branch protection
              </h3>
              {data.legacy.status === 'verified' ? (
                <>
                  <p className='text-sm'>
                    Required approvals: {data.legacy.requiredApprovals} ·
                    Applies to administrators:{' '}
                    {data.legacy.enforceAdmins ? 'Yes' : 'No'}
                  </p>
                  <p className='text-sm break-all text-muted-foreground'>
                    {data.legacy.checks?.length
                      ? `Required checks: ${data.legacy.checks.join(', ')}`
                      : 'No required status checks returned.'}
                  </p>
                </>
              ) : (
                <p className='text-sm text-muted-foreground'>
                  Could not verify legacy protection. It may be absent or
                  unavailable to this GitHub App. This does not mean the branch
                  is unprotected.
                </p>
              )}
            </section>
            <p className='text-xs text-muted-foreground'>
              This view shows configured requirements. GitHub decides whether a
              specific user can merge, including bypass permissions and other
              repository settings.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
