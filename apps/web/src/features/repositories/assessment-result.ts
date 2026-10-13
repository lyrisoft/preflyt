import type { GatePreview } from './engineering-queries'
import type { EvidenceValidation } from './evidence-validation-panel'
import type { Status } from './repository-vocabulary'

export const reviewStatuses: Record<GatePreview['status'], Status> = {
  PASS: { label: 'Required checks passed', tone: 'success' },
  WARN: { label: 'Optional checks need attention', tone: 'warning' },
  BLOCK: { label: 'Required checks failed', tone: 'error' },
  INCOMPLETE: { label: 'Required results incomplete', tone: 'warning' },
}
const reasonLabels: Record<string, string> = {
  CI_OBSERVATION_MISSING: 'No CI result was collected for this check.',
  COLLECTION_INCOMPLETE: 'Not all CI results were collected.',
  CONFIGURATION_NOT_ESTABLISHED:
    'The required configuration could not be confirmed.',
  PROFILE_NOT_COMPLETE_AT_REVISION:
    'Repository inspection was incomplete for this commit.',
  CONFIGURATION_EVIDENCE_MISSING:
    'The required configuration evidence is missing.',
  RULE_ADAPTER_UNSUPPORTED:
    'Preflyt does not support evaluating this check yet.',
  TRUSTED_EXECUTION_NOT_ESTABLISHED:
    'The tools and checks that ran have not been verified.',
  EVIDENCE_INTEGRITY_INVALID: 'The saved evidence failed verification.',
  SOURCE_AMBIGUOUS: 'More than one CI result could match this check.',
  SOURCE_SUPERSEDED: 'A newer CI result has replaced this one.',
  APPROVED_CI_SOURCE_FAILED: 'The approved CI check or workflow failed.',
  REPORT_REPORTED_FAILURE:
    'The verified report contains failed tests or scanner findings.',
  SNAPSHOT_SCHEMA_UNSUPPORTED:
    'This saved assessment format cannot be evaluated.',
  NO_REQUIRED_RULES: 'This assessment has no required checks.',
}
export const reviewReason = (reason: string) =>
  reasonLabels[reason] ?? reason.toLowerCase().replace(/_/g, ' ')

// Only the server evaluation can establish a passing check. A successful CI
// provider, found configuration or signed report alone must never turn it green.
export function checkReview(rule?: GatePreview['rules'][number]): Status {
  if (rule?.status === 'PASS') return { label: 'Passed', tone: 'success' }
  if (rule?.status === 'BLOCK') return { label: 'Failed', tone: 'error' }
  if (rule?.status === 'INCOMPLETE')
    return { label: 'Incomplete', tone: 'warning' }
  return { label: 'Not evaluated', tone: 'warning' }
}

export function checkNextStep(rule?: GatePreview['rules'][number]): {
  text: string
  destination?: 'activity' | 'standards'
} {
  const reasons = rule?.reasons ?? []
  if (rule?.status === 'PASS')
    return { text: 'The saved requirement is satisfied at this commit.' }
  if (rule?.status === 'BLOCK')
    return {
      text: 'Review the failed CI result, fix the failure and rerun the workflow.',
      destination: 'activity',
    }
  if (reasons.includes('RULE_ADAPTER_UNSUPPORTED'))
    return {
      text: 'This check cannot be evaluated yet. Review the requirement with your administrator.',
      destination: 'standards',
    }
  if (
    reasons.some((r) =>
      [
        'CONFIGURATION_NOT_ESTABLISHED',
        'CONFIGURATION_EVIDENCE_MISSING',
        'PROFILE_NOT_COMPLETE_AT_REVISION',
      ].includes(r)
    )
  )
    return {
      text: 'Review the required configuration and inspect the commit again before saving a new assessment.',
      destination: 'standards',
    }
  if (reasons.includes('COLLECTION_INCOMPLETE'))
    return {
      text: 'Review the CI collection warning before saving a new assessment.',
      destination: 'activity',
    }
  if (reasons.includes('SOURCE_SUPERSEDED'))
    return {
      text: 'Save a new assessment to include the newer result.',
      destination: 'activity',
    }
  if (reasons.includes('SOURCE_AMBIGUOUS'))
    return {
      text: 'Review which CI check or workflow supplies this requirement in Check sources.',
      destination: 'standards',
    }
  if (reasons.includes('EVIDENCE_INTEGRITY_INVALID'))
    return {
      text: 'Ask your administrator to investigate the evidence verification failure before relying on this result.',
      destination: 'activity',
    }
  if (rule)
    return {
      text: 'Review the check source and report verification details. A successful CI result alone does not verify that this check ran.',
      destination: 'standards',
    }
  return { text: 'Load the merge review result before relying on this check.' }
}

export function isExecutionVerified(validation?: EvidenceValidation | null) {
  return !!(
    validation?.status === 'VERIFIED' &&
    validation.trustedExecuted &&
    validation.sourceApproved &&
    validation.observationIntegrity === true &&
    validation.reasons.length === 0
  )
}
