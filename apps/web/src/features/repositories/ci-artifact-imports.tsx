import { CiProvenance } from './ci-provenance'
import { RelativeTime } from './relative-time'
import type { ArtifactSummary } from './repository-queries'
import { sentence } from './repository-vocabulary'

/** Reports an administrator attached to one CI result. */
export function ReportList({
  artifacts,
  repositoryId,
  deliveryId,
  canVerify = false,
}: {
  artifacts: ArtifactSummary[]
  repositoryId?: string
  deliveryId?: string
  canVerify?: boolean
}) {
  if (artifacts.length === 0)
    return <p className='text-sm text-muted-foreground'>No reports imported.</p>
  return (
    <ul className='divide-y rounded-md border'>
      {artifacts.map((artifact) => (
        <li key={artifact.id} className='space-y-1 p-3 text-sm'>
          <p className='flex flex-wrap items-center justify-between gap-2'>
            <span className='font-medium'>
              {artifact.format === 'junit' ? 'JUnit' : 'SARIF'} report
            </span>
            <span className='text-xs text-muted-foreground'>
              Parser v{artifact.parserVersion} ·{' '}
              <RelativeTime value={artifact.createdAt} />
            </span>
          </p>
          <p className='text-xs text-muted-foreground'>
            Administrator upload. Signed CI provenance is evaluated separately.
          </p>
          <p className='flex flex-wrap gap-x-3 gap-y-1 text-xs'>
            {Object.entries(artifact.summary).map(([key, value]) => (
              <span key={key}>
                <span className='text-muted-foreground'>{sentence(key)}</span>{' '}
                <span className='font-medium tabular-nums'>
                  {String(value)}
                </span>
              </span>
            ))}
          </p>
          <p className='font-mono text-xs break-all text-muted-foreground'>
            SHA-256 {artifact.sha256}
          </p>
          {repositoryId && deliveryId && (
            <CiProvenance
              repositoryId={repositoryId}
              deliveryId={deliveryId}
              artifactId={artifact.id}
              canVerify={canVerify}
            />
          )}
        </li>
      ))}
    </ul>
  )
}
