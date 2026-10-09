import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { StatusBadge } from '@/components/status-badge'
import {
  type ContextRequest,
  useSnapshot,
  identityLabel,
} from './engineering-queries'
import { EvidenceValidationPanel } from './evidence-validation-panel'
import { coverageStatus, sentence } from './repository-vocabulary'

export function AssessmentContext({ request }: { request: ContextRequest }) {
  return (
    <section
      className='space-y-3 rounded-md border p-4 text-sm'
      aria-label='Assessment context'
    >
      <div className='flex flex-wrap gap-2'>
        <StatusBadge tone='neutral'>
          {request.subjectKind === 'PULL_REQUEST'
            ? `PR #${request.pullRequest?.number}`
            : 'Commit snapshot'}
        </StatusBadge>
        <StatusBadge tone='info'>{sentence(request.trigger)}</StatusBadge>
      </div>
      {request.pullRequest && (
        <dl className='grid gap-2 sm:grid-cols-2'>
          <div>
            <dt className='text-muted-foreground'>Head branch</dt>
            <dd className='break-all'>
              {request.pullRequest.head.ref}
              <code className='block text-xs'>
                {request.pullRequest.head.sha}
              </code>
            </dd>
          </div>
          <div>
            <dt className='text-muted-foreground'>Base branch</dt>
            <dd className='break-all'>
              {request.pullRequest.base.ref}
              <code className='block text-xs'>
                {request.pullRequest.base.sha}
              </code>
            </dd>
          </div>
          <div>
            <dt className='text-muted-foreground'>Recorded PR state</dt>
            <dd>
              {request.pullRequest.draft ? 'Draft · ' : ''}
              {sentence(request.pullRequest.state)}
              {request.pullRequest.merged ? ' · merged' : ''}
            </dd>
          </div>
        </dl>
      )}
      {request.sourceBindings ? (
        <div>
          <p className='font-medium'>
            Approved sources · revision {request.sourceBindings.revision}
          </p>
          <ul className='mt-1 space-y-1 text-xs text-muted-foreground'>
            {request.sourceBindings.bindings.map((b) => (
              <li key={b.ruleId}>
                {b.ruleId}: {identityLabel(b)}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className='text-xs text-muted-foreground'>
          No approved CI sources were saved with this assessment.
        </p>
      )}
      <p className='text-xs text-muted-foreground'>
        This shows the context when the assessment was saved. Approving a CI
        source does not prove that a check ran or passed.
      </p>
    </section>
  )
}
export function AssessmentSnapshotDialog({
  repositoryId,
  id,
  onClose,
}: {
  repositoryId: string
  id: string | null
  onClose: () => void
}) {
  const query = useSnapshot(repositoryId, id)
  return (
    <Dialog open={!!id} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='max-h-[85dvh] overflow-y-auto sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>Assessment snapshot</DialogTitle>
          <DialogDescription>
            Evidence saved for a specific commit. This assessment does not
            decide whether the change can merge.
          </DialogDescription>
        </DialogHeader>
        {query.isPending ? (
          <p role='status'>Loading snapshot…</p>
        ) : query.isError ? (
          <p role='alert' className='text-destructive'>
            {query.error.message}
          </p>
        ) : (
          <div className='space-y-4'>
            <code className='block text-xs break-all'>
              {query.data.sourceSha}
            </code>
            <AssessmentContext request={query.data.request} />
            <p className='text-sm'>
              {sentence(query.data.report.coverage)} ·{' '}
              {query.data.report.trustedExecutedChecks} verified executed checks
            </p>
            {query.data.report.collectionTruncated && (
              <p role='alert'>
                Not all evidence was collected; the collection limit was
                reached.
              </p>
            )}
            <div className='divide-y rounded-md border'>
              {query.data.report.checks.map((check) => {
                const status =
                  check.coverage === 'INVALID'
                    ? { tone: 'error' as const, label: 'Invalid evidence' }
                    : coverageStatus(check.coverage)
                return (
                  <div key={check.ruleId} className='space-y-1 p-3 text-sm'>
                    <div className='flex flex-wrap items-center justify-between gap-2'>
                      <span className='font-medium'>{check.title}</span>
                      <StatusBadge tone={status.tone}>
                        {status.label}
                      </StatusBadge>
                    </div>
                    <p className='text-xs text-muted-foreground'>
                      {check.reason}
                    </p>
                    <EvidenceValidationPanel
                      validation={check.evidenceValidation}
                    />
                    <p className='text-xs'>
                      Provider result:{' '}
                      {check.providerResult
                        ? sentence(check.providerResult)
                        : 'None'}{' '}
                      ·{' '}
                      {check.mappingTrust
                        ? sentence(check.mappingTrust)
                        : 'No association'}
                    </p>
                  </div>
                )
              })}
            </div>
            <details className='text-xs'>
              <summary className='cursor-pointer'>
                Saved assessment verification
              </summary>
              <code className='mt-2 block break-all'>
                {query.data.assessmentHash}
              </code>
              {query.data.report.observations?.map((item) => (
                <div key={item.deliveryId} className='mt-3 space-y-1 break-all'>
                  <p>
                    {item.sourceKind} #{item.sourceObjectId}
                  </p>
                  <p>Delivery: {item.deliveryId}</p>
                  <p>Evidence SHA-256: {item.evidenceHash}</p>
                  <p>Signed payload SHA-256: {item.sourcePayloadHash}</p>
                  {item.artifacts.map((artifact) => (
                    <p key={artifact.id}>
                      {artifact.format.toUpperCase()}: {artifact.sha256} ·{' '}
                      {artifact.verification}
                    </p>
                  ))}
                </div>
              ))}
            </details>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
