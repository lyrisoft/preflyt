import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw, ShieldAlert } from 'lucide-react'
import { statusTones } from '@/lib/status-tones'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import { engineeringPath, engineeringRead } from './engineering-queries'

type Policy = {
  id: string
  selectionId: string
  definitionHash: string
  branchRef: string
  definition: { rules: { id: string; title: string; required: boolean }[] }
}
export type PolicyException = {
  id: string
  state: string
  sourceSha: string
  ruleIds: string[]
  reason: string
  requestedById: string
  expiresAt: string
  requestHash: string
  revision: number
}
const labels: Record<string, string> = {
  REQUESTED: 'Pending review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  REVOKED: 'Revoked',
  EXPIRED: 'Expired',
}
export function PolicyExceptions({
  repositoryId,
  policy,
  actorId,
  canRequest,
  canApprove,
}: {
  repositoryId: string
  policy: Policy
  actorId?: string
  canRequest: boolean
  canApprove: boolean
}) {
  const [open, setOpen] = useState(false),
    [sourceSha, setSourceSha] = useState(''),
    [rules, setRules] = useState<string[]>([]),
    [reason, setReason] = useState(''),
    [hours, setHours] = useState('24')
  const client = useQueryClient(),
    path = `/gate-policies/${policy.id}/exceptions`,
    key = ['policy-exceptions', repositoryId, policy.id, actorId, path]
  const query = useQuery({
    queryKey: key,
    retry: false,
    queryFn: ({ signal }) =>
      engineeringRead<{ exceptions: PolicyException[]; truncated: boolean }>(
        repositoryId,
        path,
        signal
      ),
    refetchInterval: 30000,
  })
  const saved = useQuery({
    queryKey: [
      'exception-assessments',
      repositoryId,
      policy.selectionId,
      actorId,
    ],
    enabled: open && canRequest,
    retry: false,
    queryFn: ({ signal }) =>
      engineeringRead<{
        assessments: {
          id: string
          sourceSha: string
          selectionId: string
          createdAt: string
        }[]
      }>(repositoryId, '/assessments', signal),
  })
  const commits = [
    ...new Set(
      (saved.isError ? undefined : saved.data)?.assessments
        .filter((row) => row.selectionId === policy.selectionId)
        .map((row) => row.sourceSha) ?? []
    ),
  ]
  const mutation = useMutation({
    mutationFn: async ({ action, body }: { action: string; body: object }) => {
      const response = await fetch(
        engineeringPath(repositoryId, path + action),
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      )
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(
          Array.isArray(error.message)
            ? error.message.join(' · ')
            : (error.message ??
                'Could not update this exception. Refresh and try again.')
        )
      }
      return response.json()
    },
    meta: { successMessage: 'Policy exception updated' },
    onSuccess: async (_result, { action }) => {
      await client.invalidateQueries({ queryKey: key })
      if (!action) {
        setOpen(false)
        setRules([])
        setReason('')
      }
    },
  })
  const decide = (row: PolicyException, decision: string) =>
    mutation.mutate({
      action: `/${row.id}/${decision}`,
      body: { expectedHash: row.requestHash, expectedRevision: row.revision },
    })
  if (query.isError)
    return (
      <section
        aria-label='Policy exceptions'
        className='space-y-3 rounded-xl border p-4'
      >
        <h3 className='text-sm font-semibold'>Policy exceptions</h3>
        <p role='alert' className='text-sm text-destructive'>
          {query.error.message}
        </p>
        <Button
          size='sm'
          variant='outline'
          onClick={() => void query.refetch()}
        >
          Try again
        </Button>
      </section>
    )
  return (
    <section
      aria-label='Policy exceptions'
      className='space-y-4 rounded-xl border bg-card p-4'
    >
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex items-center gap-3'>
          <SurfaceIcon icon={ShieldAlert} tone='amber' size='sm' />
          <div>
            <h3 className='text-sm font-semibold'>Policy exceptions</h3>
            <p className='mt-1 text-xs text-muted-foreground'>
              Temporary, independently reviewed exceptions for one commit.
            </p>
          </div>
        </div>
        <div className='flex items-center gap-2'>
          <Button
            size='icon'
            variant='ghost'
            aria-label='Refresh exceptions'
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw className='size-4' />
          </Button>
          {canRequest && (
            <Button size='sm' onClick={() => setOpen((value) => !value)}>
              <Plus className='size-4' />
              Request exception
            </Button>
          )}
        </div>
      </div>
      {query.isPending && (
        <p className='text-sm text-muted-foreground'>Loading exceptions…</p>
      )}
      {open && (
        <form
          className='space-y-5 rounded-lg border bg-muted/10 p-4'
          onSubmit={(event) => {
            event.preventDefault()
            mutation.mutate({
              action: '',
              body: {
                expectedPolicyHash: policy.definitionHash,
                sourceSha,
                ruleIds: rules,
                reason: reason.trim(),
                expiresAt: new Date(
                  Date.now() + Number(hours) * 3600000
                ).toISOString(),
              },
            })
          }}
        >
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='space-y-2'>
              <Label htmlFor='exception-commit'>Assessed commit</Label>
              <Select value={sourceSha} onValueChange={setSourceSha}>
                <SelectTrigger id='exception-commit'>
                  <SelectValue placeholder='Choose a saved commit' />
                </SelectTrigger>
                <SelectContent>
                  {commits.map((sha) => (
                    <SelectItem key={sha} value={sha}>
                      {sha.slice(0, 12)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {saved.isPending && (
                <p className='text-xs text-muted-foreground'>
                  Loading saved commits…
                </p>
              )}
              {saved.error && (
                <p role='alert' className='text-xs text-destructive'>
                  {saved.error.message}
                </p>
              )}
              {saved.data && !commits.length && (
                <p className='text-xs text-muted-foreground'>
                  Save an assessment using the current standards first.
                </p>
              )}
            </div>
            <div className='space-y-2'>
              <Label htmlFor='exception-expiry'>Expires after</Label>
              <Select value={hours} onValueChange={setHours}>
                <SelectTrigger id='exception-expiry'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='4'>4 hours</SelectItem>
                  <SelectItem value='24'>24 hours</SelectItem>
                  <SelectItem value='72'>3 days</SelectItem>
                  <SelectItem value='168'>7 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <fieldset className='space-y-2'>
            <legend className='mb-2 text-sm font-medium'>
              Checks needing an exception
            </legend>
            {policy.definition.rules
              .filter((rule) => rule.required)
              .map((rule) => (
                <label
                  key={rule.id}
                  className='flex items-start gap-3 rounded-lg border p-3 text-sm'
                >
                  <Checkbox
                    checked={rules.includes(rule.id)}
                    onCheckedChange={(checked) =>
                      setRules((current) =>
                        checked
                          ? [...current, rule.id]
                          : current.filter((id) => id !== rule.id)
                      )
                    }
                  />
                  <span>{rule.title}</span>
                </label>
              ))}
          </fieldset>
          <div className='space-y-2'>
            <Label htmlFor='exception-reason'>Reason and follow-up</Label>
            <Textarea
              id='exception-reason'
              placeholder='For example: scanner false positive tracked in issue #123; remove the exception after the vendor fix.'
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
              minLength={20}
              maxLength={2000}
              rows={3}
            />
          </div>
          <p className='text-xs leading-5 text-muted-foreground'>
            Another authorized person must approve. This applies only to the
            selected commit and policy. Original results stay in the assessment;
            at least one required execution check must still pass. Automatic
            checks must be enabled to use an approved exception.
          </p>
          <div className='flex justify-end gap-2'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type='submit'
              size='sm'
              disabled={
                mutation.isPending ||
                !sourceSha ||
                saved.isError ||
                !commits.includes(sourceSha) ||
                !rules.length ||
                rules.length > 10 ||
                reason.trim().length < 20
              }
            >
              Submit request
            </Button>
          </div>
        </form>
      )}
      {query.data && !query.data.exceptions.length && (
        <p className='text-sm text-muted-foreground'>
          No exceptions for this policy.
        </p>
      )}
      {query.data?.exceptions.map((row) => (
        <article key={row.id} className='space-y-3 rounded-lg border p-4'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <span className='font-mono text-xs text-muted-foreground'>
              {row.sourceSha.slice(0, 12)}
            </span>
            <StatusBadge
              tone={
                statusTones[(labels[row.state] ?? row.state).toLowerCase()] ??
                'neutral'
              }
            >
              {labels[row.state] ?? row.state}
            </StatusBadge>
          </div>
          <p className='text-sm leading-6 break-words'>{row.reason}</p>
          <p className='text-xs text-muted-foreground'>
            {row.ruleIds
              .map(
                (id) =>
                  policy.definition.rules.find((rule) => rule.id === id)
                    ?.title ?? id
              )
              .join(' · ')}
          </p>
          <p className='text-xs text-muted-foreground'>
            Expires {new Date(row.expiresAt).toLocaleString()}
            {row.requestedById === actorId ? ' · Requested by you' : ''}
          </p>
          <div className='flex flex-wrap justify-end gap-2'>
            {row.state === 'REQUESTED' &&
              canApprove &&
              row.requestedById !== actorId && (
                <>
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={mutation.isPending}
                    onClick={() => decide(row, 'reject')}
                  >
                    Reject
                  </Button>
                  <Button
                    size='sm'
                    disabled={mutation.isPending}
                    onClick={() => decide(row, 'approve')}
                  >
                    Approve exception
                  </Button>
                </>
              )}
            {['REQUESTED', 'APPROVED'].includes(row.state) &&
              (canApprove || row.requestedById === actorId) && (
                <Button
                  size='sm'
                  variant='destructive'
                  disabled={mutation.isPending}
                  onClick={() => decide(row, 'revoke')}
                >
                  {row.state === 'REQUESTED' ? 'Withdraw' : 'Revoke'}
                </Button>
              )}
          </div>
        </article>
      ))}
      {query.data?.truncated && (
        <p role='status' className='text-xs text-muted-foreground'>
          Showing the latest 50 requests. Older requests remain in the audit
          history.
        </p>
      )}
    </section>
  )
}
