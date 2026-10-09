import { sentence } from './repository-vocabulary'

export type EvidenceValidation = {
  version: number
  status: 'INVALID' | 'INCOMPLETE'
  trustedExecuted: boolean
  sourceApproved: boolean
  observationIntegrity: boolean | null
  expectedFormat: string | null
  reports: {
    artifactId: string
    format: string
    integrity: string
    reportedResult: string
    provenance?: null | {
      status: string
      signerWorkflow: string
      runId: string
      runAttempt: number
      receiptHash: string
    }
    executedTests: number | null
  }[]
  reasons: string[]
}

export function EvidenceValidationPanel({
  validation,
}: {
  validation?: EvidenceValidation | null
}) {
  if (!validation) return null
  return (
    <details className='mt-2 text-xs'>
      <summary className='cursor-pointer font-medium'>
        Evidence validation: {sentence(validation.status)}
      </summary>
      <div className='mt-2 space-y-2'>
        <p>
          The tools and rules that ran have not been verified. CI source:{' '}
          {validation.sourceApproved ? 'approved' : 'missing'}.
        </p>
        {validation.reports.map((report) => (
          <p key={report.artifactId}>
            {report.format.toUpperCase()} · report verification:{' '}
            {sentence(report.integrity)} · {sentence(report.reportedResult)}
            {report.provenance &&
              ` · signed report source verified: ${report.provenance.signerWorkflow}, run ${report.provenance.runId}, attempt ${report.provenance.runAttempt}`}
            {report.executedTests !== null &&
              ` · ${report.executedTests} reported executed tests`}
          </p>
        ))}
        <ul className='list-disc space-y-1 pl-4'>
          {validation.reasons.map((reason) => (
            <li key={reason}>{sentence(reason)}</li>
          ))}
        </ul>
      </div>
    </details>
  )
}
