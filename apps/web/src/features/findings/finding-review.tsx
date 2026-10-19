import { useId, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardCheck, LoaderCircle } from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { OptionSelect } from '@/components/ui/option-select'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import { findingRequest } from './finding-api'
import { classificationLabels } from './finding-classification'

type Review = {
  classification: string | null
  reason: string
  revision: number
  canManage: boolean
  eligible: boolean
  updatedAt: string | null
  history: { at: string; classification: string; reason: string }[]
}
export function FindingReview({
  path,
  scope,
}: {
  path: string
  scope: string
}) {
  const id = useId(),
    client = useQueryClient()
  const [classification, setClassification] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const query = useQuery({
    queryKey: ['finding-review', scope, path],
    gcTime: 0,
    retry: false,
    queryFn: ({ signal }) => findingRequest<Review>(path, signal),
  })
  const save = useMutation({
    meta: { successMessage: 'Finding classification saved' },
    mutationFn: async () => {
      const response = await fetch(`${API_BASE_URL}/${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classification:
            classification ?? query.data?.classification ?? 'POTENTIAL',
          reason,
          expectedRevision: query.data?.revision ?? 0,
        }),
      })
      const body = await response.json()
      if (!response.ok)
        throw new Error(body.message ?? 'Could not save the classification.')
    },
    onSuccess: async () => {
      setReason('')
      setClassification(null)
      await Promise.all([
        query.refetch(),
        client.invalidateQueries({ queryKey: ['findings'] }),
        client.invalidateQueries({ queryKey: ['finding-detail'] }),
        client.invalidateQueries({ queryKey: ['payment-risk-report'] }),
      ])
    },
  })
  const data = query.isError ? undefined : query.data
  if (data && !data.eligible) return null
  return (
    <Card className='gap-0 overflow-hidden' aria-labelledby={`${id}-title`}>
      <CardHeader className='flex flex-row items-center justify-between gap-3 border-b'>
        <div className='flex min-w-0 items-center gap-3'>
          <SurfaceIcon icon={ClipboardCheck} tone='blue' />
          <CardTitle asChild>
            <h2 id={`${id}-title`}>Finding review</h2>
          </CardTitle>
        </div>
        {data && (
          <StatusBadge tone='neutral' compact>
            {classificationLabels[data.classification ?? ''] ?? 'Needs review'}
          </StatusBadge>
        )}
      </CardHeader>
      <CardContent className='space-y-4 pt-4'>
        {query.isPending && <p role='status'>Loading finding review…</p>}
        {query.isError && (
          <div role='alert'>
            <p>{query.error.message}</p>
            <Button variant='outline' onClick={() => void query.refetch()}>
              Retry
            </Button>
          </div>
        )}
        {data && (
          <>
            <p className='text-sm text-muted-foreground'>
              Record your assessment of this issue. Potential needs more
              evidence; Likely has supporting evidence; Confirmed is
              independently verified; False positive is ruled out.
            </p>
            {data.reason && (
              <div className='space-y-1 text-sm'>
                <p className='font-medium'>Latest review evidence</p>
                <p className='wrap-anywhere whitespace-pre-wrap'>
                  {data.reason}
                </p>
                {data.updatedAt && (
                  <p className='text-xs text-muted-foreground'>
                    {new Date(data.updatedAt).toLocaleString()}
                  </p>
                )}
              </div>
            )}
            <p className='text-xs text-muted-foreground'>
              Applies only to this assessment and commit. Saved scan results and
              merge checks stay unchanged.
            </p>
            {data.canManage && (
              <form
                className='space-y-4'
                onSubmit={(event) => {
                  event.preventDefault()
                  if (reason.trim() && !save.isPending) save.mutate()
                }}
              >
                <div className='space-y-2'>
                  <label
                    htmlFor={`${id}-classification`}
                    className='text-sm font-medium'
                  >
                    Classification
                  </label>
                  <OptionSelect
                    id={`${id}-classification`}
                    label='Classification'
                    value={classification ?? data.classification ?? 'POTENTIAL'}
                    onValueChange={setClassification}
                    options={Object.entries(classificationLabels).map(
                      ([value, label]) => ({ value, label })
                    )}
                  />
                </div>
                <div className='space-y-2'>
                  <label
                    htmlFor={`${id}-reason`}
                    className='text-sm font-medium'
                  >
                    Evidence and reasoning
                  </label>
                  <Textarea
                    id={`${id}-reason`}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    maxLength={4000}
                    required
                    rows={5}
                    placeholder='Explain the source, conditions, checks and evidence supporting your decision. Do not include secrets.'
                  />
                  <p className='text-xs text-muted-foreground'>
                    Required for every decision. Include verification evidence
                    for Confirmed or False positive.
                  </p>
                </div>
                {save.isError && (
                  <div role='alert' className='space-y-2 text-sm'>
                    <p className='text-destructive'>{save.error.message}</p>
                    <Button
                      type='button'
                      variant='outline'
                      onClick={() => void query.refetch()}
                    >
                      Refresh review decision
                    </Button>
                  </div>
                )}
                <Button
                  className='w-full'
                  disabled={save.isPending || !reason.trim()}
                >
                  {save.isPending && <LoaderCircle className='animate-spin' />}
                  Save classification
                </Button>
              </form>
            )}
            {!!data.history.length && (
              <details>
                <summary className='cursor-pointer text-sm font-medium'>
                  Review history ({data.history.length})
                </summary>
                <ol className='mt-3 space-y-3 text-sm'>
                  {data.history.map((item, i) => (
                    <li key={`${item.at}:${i}`}>
                      <StatusBadge tone='neutral' compact>
                        {classificationLabels[item.classification]}
                      </StatusBadge>
                      <p className='mt-1 wrap-anywhere whitespace-pre-wrap'>
                        {item.reason}
                      </p>
                      <time className='text-xs text-muted-foreground'>
                        {new Date(item.at).toLocaleString()}
                      </time>
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
