import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ResultTimestamp } from '@/components/result-timestamp'
import { StatusBadge } from '@/components/status-badge'
import { reviewReason } from '@/features/repositories/assessment-result'
import { triageLabels, type Finding } from './finding-types'

export function FindingContext({ finding }: { finding: Finding }) {
  return (
    <section aria-labelledby='finding-context-title' className='space-y-4'>
      <h3 id='finding-context-title' className='text-sm font-semibold'>
        Repository context
      </h3>
      <dl className='grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2'>
        <div className='min-w-0'>
          <dt className='text-xs text-muted-foreground'>Repository</dt>
          <dd className='mt-1 font-medium break-words'>{finding.repository}</dd>
        </div>
        <div>
          <dt className='text-xs text-muted-foreground'>Recorded</dt>
          <dd className='mt-1'>
            <ResultTimestamp value={finding.observedAt} />
          </dd>
        </div>
        {finding.pullRequest && (
          <div>
            <dt className='text-xs text-muted-foreground'>Pull request</dt>
            <dd className='mt-1'>
              <a
                href={finding.pullRequestUrl}
                target='_blank'
                rel='noopener noreferrer'
                className='underline underline-offset-4'
              >
                PR #{finding.pullRequest}
              </a>
            </dd>
          </div>
        )}
        <div className='min-w-0 sm:col-span-2'>
          <dt className='text-xs text-muted-foreground'>Commit</dt>
          <dd className='mt-1 rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs break-all'>
            {finding.sourceSha}
          </dd>
        </div>
        <div className='min-w-0'>
          <dt className='text-xs text-muted-foreground'>Rule</dt>
          <dd className='mt-1 font-mono text-xs break-all'>
            {finding.ruleId ?? 'Not supplied'}
          </dd>
        </div>
        <div className='min-w-0'>
          <dt className='text-xs text-muted-foreground'>File</dt>
          <dd className='mt-1 break-all'>
            {finding.path ? (
              <code className='text-xs'>
                {finding.path}
                {finding.line
                  ? `:${finding.line}${finding.endLine && finding.endLine > finding.line ? `–${finding.endLine}` : ''}`
                  : ''}
              </code>
            ) : (
              <span className='text-muted-foreground'>Not supplied</span>
            )}
          </dd>
        </div>
        {finding.category && (
          <div>
            <dt className='text-xs text-muted-foreground'>Category</dt>
            <dd className='mt-1 capitalize'>
              {finding.category.replace(/_/g, ' ')}
            </dd>
          </div>
        )}
      </dl>
      <div className='rounded-lg border bg-muted/20 px-4 py-3'>
        <p className='text-xs text-muted-foreground'>
          Report source verification
        </p>
        <p className='mt-1 text-sm break-words'>
          {finding.verification === 'ADMIN_ASSOCIATED_UNVERIFIED'
            ? 'Admin-associated report; source not independently verified'
            : finding.verification}
        </p>
      </div>
    </section>
  )
}

const findingEvidenceLabels: Record<string, string> = {
  CI_SUCCESS_NOT_ESTABLISHED: 'A successful CI result has not been confirmed.',
  EXECUTION_ENVIRONMENT_UNVERIFIED:
    'The execution environment has not been verified.',
  REPORT_PROVENANCE_UNVERIFIED:
    'The report source has not been independently verified.',
  RULE_COVERAGE_UNVERIFIED:
    'The report has not been verified to cover this check.',
  TOOL_IDENTITY_UNVERIFIED:
    'The tool that produced the result has not been verified.',
}
const isEvidenceCode = (value: string) =>
  /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(value)

export function FindingEvidence({ evidence }: { evidence: string[] }) {
  const codes = evidence.filter(isEvidenceCode)
  return (
    <section aria-labelledby='finding-evidence-title' className='space-y-3'>
      <h3 id='finding-evidence-title' className='text-sm font-semibold'>
        Evidence
      </h3>
      {evidence.length ? (
        <ul className='divide-y rounded-xl border bg-muted/10 px-4'>
          {evidence.map((value, index) => (
            <li key={index} className='py-3 text-sm leading-5 break-words'>
              {/^[a-f0-9]{64}$/i.test(value) ? (
                <>
                  <p className='mb-1 text-xs text-muted-foreground'>
                    Report digest (SHA-256)
                  </p>
                  <code className='block font-mono text-xs break-all'>
                    {value}
                  </code>
                </>
              ) : isEvidenceCode(value) ? (
                (findingEvidenceLabels[value] ?? reviewReason(value))
              ) : (
                value
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className='text-sm text-muted-foreground'>
          No additional evidence was supplied.
        </p>
      )}
      {codes.length > 0 && (
        <details className='group text-xs'>
          <summary className='w-fit cursor-pointer rounded-sm py-1 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'>
            Technical evidence
          </summary>
          <ul className='mt-2 space-y-2 rounded-lg border bg-muted/20 p-3 font-mono'>
            {codes.map((code, index) => (
              <li key={index} className='break-all'>
                {code}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

export function FindingTriage({
  finding,
  canManage,
  onSaved,
}: {
  finding: Finding
  canManage: boolean
  onSaved: (triage: NonNullable<Finding['triage']>) => void
}) {
  const client = useQueryClient()
  const [state, setState] = useState(finding.triage?.state ?? 'REPORTED')
  const [assignee, setAssignee] = useState(
    finding.triage?.assigneeId ?? 'unassigned'
  )
  const [note, setNote] = useState(finding.triage?.note ?? '')
  const assignees = useQuery({
    queryKey: ['finding-assignees', finding.id],
    enabled: canManage,
    retry: false,
    gcTime: 0,
    queryFn: async ({ signal }): Promise<{ id: string; label: string }[]> => {
      const response = await fetch(
        `${API_BASE_URL}/findings/${finding.id}/assignees`,
        { credentials: 'include', cache: 'no-store', signal }
      )
      if (!response.ok)
        throw new Error(
          'Assignees are unavailable. Refresh and check repository access.'
        )
      return response.json()
    },
  })
  const save = useMutation({
    meta: { successMessage: 'Issue updated' },
    mutationFn: async () => {
      const response = await fetch(
        `${API_BASE_URL}/findings/${finding.id}/triage`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            state,
            assigneeId: assignee === 'unassigned' ? null : assignee,
            note,
            expectedRevision: finding.triage?.revision ?? 0,
          }),
        }
      )
      const data = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(
          data?.message ?? 'Could not update this issue. Try again.'
        )
      return data as NonNullable<Finding['triage']>
    },
    onSuccess: async (data) => {
      onSaved(data)
      await client.invalidateQueries({ queryKey: ['findings'] })
    },
  })
  if (!canManage)
    return (
      <div className='space-y-3 rounded-xl border bg-muted/10 p-4'>
        <h3 className='text-sm font-semibold'>Manage issue</h3>
        <StatusBadge
          tone={finding.triage?.state === 'RESOLVED' ? 'success' : 'info'}
        >
          {triageLabels[finding.triage?.state ?? 'REPORTED']}
        </StatusBadge>
        {finding.triage?.note && (
          <p className='text-sm break-words whitespace-pre-wrap'>
            {finding.triage.note}
          </p>
        )}
      </div>
    )
  return (
    <form
      className='space-y-4 rounded-xl border bg-muted/10 p-4'
      onSubmit={(event) => {
        event.preventDefault()
        save.mutate()
      }}
    >
      <h3 className='text-sm font-semibold'>Manage issue</h3>
      <div className='grid gap-4 sm:grid-cols-2'>
        <div className='space-y-2'>
          <label className='text-sm font-medium' htmlFor='finding-state'>
            Status
          </label>
          <Select value={state} onValueChange={setState}>
            <SelectTrigger id='finding-state' className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(triageLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className='space-y-2'>
          <label className='text-sm font-medium' htmlFor='finding-assignee'>
            Assignee
          </label>
          <Select value={assignee} onValueChange={setAssignee}>
            <SelectTrigger id='finding-assignee' className='w-full'>
              <SelectValue placeholder='Unassigned' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='unassigned'>Unassigned</SelectItem>
              {assignees.data?.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className='space-y-2'>
        <label className='text-sm font-medium' htmlFor='finding-note'>
          Resolution or review note
        </label>
        <Textarea
          id='finding-note'
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={1000}
          required={state === 'RESOLVED'}
          className='min-h-24 resize-y bg-background'
          placeholder='Explain the review or how the issue was resolved.'
        />
      </div>
      <p className='text-xs text-muted-foreground'>
        Your changes apply to this commit. Assessment evidence and gate results
        stay unchanged.
      </p>
      {(save.error || assignees.error) && (
        <p role='alert' className='text-sm text-destructive'>
          {(save.error ?? assignees.error)?.message}
        </p>
      )}
      <div className='flex justify-end'>
        <Button size='sm' disabled={save.isPending || assignees.isFetching}>
          Save changes
        </Button>
      </div>
    </form>
  )
}
