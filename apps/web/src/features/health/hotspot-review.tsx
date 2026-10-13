import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldQuestion } from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import { statusTones } from '@/lib/status-tones'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { OptionSelect } from '@/components/ui/option-select'
import { Textarea } from '@/components/ui/textarea'
import { ResultTimestamp } from '@/components/result-timestamp'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import { findingRequest } from '@/features/findings/finding-api'
import { useNavigationSession } from '@/features/workspace/navigation-session'

export type HotspotReviewData = {
  state: string
  note: string
  revision: number
  updatedAt: string | null
  canReview: boolean
}
const labels: Record<string, string> = {
  TO_REVIEW: 'To review',
  IN_REVIEW: 'In review',
  SAFE: 'Reviewed: no change needed',
  FIX_REQUIRED: 'Reviewed: fix required',
}
export function HotspotReview({
  repositoryId,
  assessmentId,
  fingerprint,
}: {
  repositoryId: string
  assessmentId: string
  fingerprint: string
}) {
  const session = useNavigationSession(),
    queryClient = useQueryClient()
  const path = `github/repositories/${repositoryId}/health/${assessmentId}/hotspots/${fingerprint}/review`
  const key = [
    'hotspot-review',
    session.data?.organizationId,
    session.data?.identityId,
    repositoryId,
    assessmentId,
    fingerprint,
    path,
  ]
  const query = useQuery({
    queryKey: key,
    enabled: session.isSuccess,
    retry: false,
    gcTime: 0,
    queryFn: ({ signal }) => findingRequest<HotspotReviewData>(path, signal),
  })
  const mutation = useMutation({
    meta: { successMessage: 'Hotspot review saved.' },
    mutationFn: async (input: {
      state: string
      note: string
      expectedRevision: number
    }) => {
      const response = await fetch(`${API_BASE_URL}/${path}`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(
          typeof body?.message === 'string'
            ? body.message
            : 'The review could not be saved. Refresh and try again.'
        )
      }
      return response.json() as Promise<HotspotReviewData>
    },
    onSuccess: async (data) => {
      queryClient.setQueryData(key, data)
      await queryClient.invalidateQueries({ queryKey: ['repository-health'] })
    },
  })
  return (
    <Card className='gap-0'>
      <CardHeader>
        <div className='flex items-center gap-3'>
          <SurfaceIcon icon={ShieldQuestion} tone='amber' size='sm' />
          <CardTitle>Hotspot review</CardTitle>
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        <p className='text-sm leading-relaxed text-muted-foreground'>
          Review the code and its use before deciding whether a fix is needed.
          This is security-sensitive code, not a confirmed vulnerability.
        </p>
        {query.isPending && (
          <p role='status' className='text-sm'>
            Loading review…
          </p>
        )}
        {query.isError && (
          <div role='alert' className='space-y-2 text-sm'>
            <p>{query.error.message}</p>
            <Button
              variant='outline'
              size='sm'
              onClick={() => void query.refetch()}
            >
              Retry review
            </Button>
          </div>
        )}
        {!query.isError && query.data && (
          <ReviewForm
            key={query.data.revision}
            review={query.data}
            pending={mutation.isPending}
            error={mutation.error?.message}
            onSave={(input) => mutation.mutate(input)}
          />
        )}
      </CardContent>
    </Card>
  )
}
function ReviewForm({
  review,
  pending,
  error,
  onSave,
}: {
  review: HotspotReviewData
  pending: boolean
  error?: string
  onSave: (input: {
    state: string
    note: string
    expectedRevision: number
  }) => void
}) {
  const [state, setState] = useState(review.state),
    [note, setNote] = useState(review.note)
  return (
    <div className='space-y-4'>
      <div role='status' aria-label='Saved hotspot review decision'>
        <StatusBadge
          tone={
            statusTones[(labels[review.state] ?? 'To review').toLowerCase()] ??
            'neutral'
          }
        >
          {labels[review.state] ?? 'To review'}
        </StatusBadge>
      </div>
      {review.updatedAt && (
        <p className='text-xs text-muted-foreground'>
          Last reviewed <ResultTimestamp value={review.updatedAt} />
        </p>
      )}
      {review.canReview ? (
        <>
          <label className='block space-y-2 text-sm font-medium'>
            <span>Review decision</span>
            <OptionSelect
              label='Review decision'
              value={state}
              onValueChange={setState}
              disabled={pending}
              options={Object.entries(labels).map(([value, label]) => ({
                value,
                label,
              }))}
            />
          </label>
          <label className='block space-y-2 text-sm font-medium'>
            <span>Review rationale</span>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={pending}
              maxLength={1000}
              rows={4}
              placeholder='Explain the relevant use, protections and next action.'
            />
          </label>
          {error && (
            <p role='alert' className='text-sm text-destructive'>
              {error}
            </p>
          )}
          <Button
            size='sm'
            disabled={
              pending ||
              (['SAFE', 'FIX_REQUIRED'].includes(state) && !note.trim())
            }
            onClick={() =>
              onSave({ state, note, expectedRevision: review.revision })
            }
          >
            {pending ? 'Saving…' : 'Save review'}
          </Button>
        </>
      ) : (
        <>
          {review.note && (
            <p className='text-sm leading-relaxed whitespace-pre-wrap'>
              {review.note}
            </p>
          )}
          <p className='text-xs text-muted-foreground'>
            Your repository role can view this review. A role with finding
            management permission is required to change it.
          </p>
        </>
      )}
      <p className='text-xs leading-relaxed text-muted-foreground'>
        The decision applies to this saved commit. It does not mark a later
        commit fixed or grant merge permission.
      </p>
    </div>
  )
}
