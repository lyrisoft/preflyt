import { createHash } from 'node:crypto'
import { digest } from './assessment-digest.js'
import {
  parseArtifact,
  PARSER_VERSION,
  MAX_ARTIFACT_BYTES,
} from '../github-events/ci-artifact-parser.js'
import { importCiEvidence } from '../github-events/ci-evidence.js'
import type { GitHubWebhookDelivery } from '../generated/prisma/client.js'
export const VALIDATOR_VERSION = 1
export const MAX_VALIDATION_ARTIFACTS = 32
export type ReportValidation = {
  artifactId: string
  format: string
  integrity: 'VALID' | 'INVALID'
  reasons: string[]
  reportedResult: string
  executedTests: number | null
}
export type ObservationValidation = {
  observationIntegrity: boolean
  reports: ReportValidation[]
}
const projection = (row: Record<string, any>) =>
  Object.fromEntries(
    [
      'version',
      'deliveryId',
      'repositoryGithubId',
      'installationId',
      'sourceSha',
      'sourceKind',
      'sourceObjectId',
      'sourceAction',
      'sourceStatus',
      'sourceConclusion',
      'sourceUpdatedAt',
      'sourceIdentity',
      'result',
      'sourcePayloadHash',
      'observedAt',
      'evidenceHash',
    ].map((key) => [
      key,
      typeof row[key] === 'bigint' ? row[key].toString() : (row[key] ?? null),
    ]),
  )
export function validateObservation(
  row: Record<string, any>,
  delivery: GitHubWebhookDelivery | undefined,
) {
  const expected =
    delivery?.state === 'PROCESSED' ? importCiEvidence(delivery) : null
  return !!expected && digest(projection(row)) === digest(projection(expected))
}
export function validateReport(artifact: {
  id: string
  format: string
  sha256: string
  parserVersion: number
  verification: string
  content: Uint8Array
  summary: unknown
}): ReportValidation {
  const result: ReportValidation = {
    artifactId: artifact.id,
    format: artifact.format,
    integrity: 'INVALID',
    reasons: [],
    reportedResult: 'UNKNOWN',
    executedTests: null,
  }
  if (artifact.parserVersion !== PARSER_VERSION) {
    result.reasons.push('PARSER_VERSION_UNSUPPORTED')
    return result
  }
  if (
    !artifact.content.length ||
    artifact.content.length > MAX_ARTIFACT_BYTES
  ) {
    result.reasons.push('ARTIFACT_SIZE_INVALID')
    return result
  }
  if (
    createHash('sha256').update(artifact.content).digest('hex') !==
    artifact.sha256
  ) {
    result.reasons.push('ARTIFACT_DIGEST_MISMATCH')
    return result
  }
  let parsed
  try {
    parsed = parseArtifact(
      artifact.format,
      Buffer.from(artifact.content).toString('utf8'),
      artifact.sha256,
    )
  } catch {
    result.reasons.push('REPORT_INVALID')
    return result
  }
  if (digest(parsed.summary) !== digest(artifact.summary)) {
    result.reasons.push('REPORT_SUMMARY_MISMATCH')
    return result
  }
  result.integrity = 'VALID'
  const summary = parsed.summary as Record<string, any>
  if (artifact.format === 'junit') {
    result.executedTests = summary.passed + summary.failures + summary.errors
    result.reportedResult =
      result.executedTests === 0
        ? 'NO_EXECUTION'
        : summary.failures + summary.errors > 0
          ? 'REPORTED_FAILURE'
          : 'REPORTED_SUCCESS'
  } else result.reportedResult = summary.execution
  // Hashes, schema validity and mutable labels cannot establish CI provenance.
  result.reasons.push(
    'REPORT_PROVENANCE_UNVERIFIED',
    'TOOL_IDENTITY_UNVERIFIED',
    'EXECUTION_ENVIRONMENT_UNVERIFIED',
    'RULE_COVERAGE_UNVERIFIED',
  )
  return result
}
export function validateRuleEvidence(
  ruleId: string,
  sourceApproved: boolean,
  observation: ObservationValidation | undefined,
  freshness: string,
  providerResult: string | null,
  ambiguous: boolean,
  superseded: boolean,
  truncated: boolean,
) {
  const reasons = new Set<string>()
  if (!observation) reasons.add('CI_OBSERVATION_MISSING')
  else if (!observation.observationIntegrity)
    reasons.add('CI_OBSERVATION_INTEGRITY_INVALID')
  if (!sourceApproved) reasons.add('SOURCE_APPROVAL_MISSING')
  if (freshness !== 'FRESH_AT_COLLECTION') reasons.add('EVIDENCE_NOT_FRESH')
  if (ambiguous) reasons.add('CI_SOURCE_AMBIGUOUS')
  if (superseded) reasons.add('CI_OBSERVATION_SUPERSEDED')
  if (providerResult !== 'SUCCEEDED') reasons.add('CI_SUCCESS_NOT_ESTABLISHED')
  if (truncated) reasons.add('VALIDATION_COLLECTION_TRUNCATED')
  const expectedFormat =
    ruleId === 'tests.required'
      ? 'junit'
      : ruleId === 'security.sast'
        ? 'sarif'
        : null
  const reports =
    observation?.reports.filter((r) => r.format === expectedFormat) ?? []
  if (!expectedFormat) reasons.add('RULE_ADAPTER_UNSUPPORTED')
  else if (!reports.length) reasons.add('REQUIRED_REPORT_MISSING')
  if (reports.length > 1) reasons.add('REPORT_SELECTION_AMBIGUOUS')
  for (const report of reports) {
    for (const reason of report.reasons) reasons.add(reason)
    if (ruleId === 'tests.required' && !report.executedTests)
      reasons.add('MINIMUM_TEST_EXECUTION_NOT_ESTABLISHED')
    if (report.reportedResult === 'REPORTED_FAILURE')
      reasons.add('REPORT_REPORTED_FAILURE')
    if (report.reportedResult === 'UNKNOWN')
      reasons.add('REPORT_EXECUTION_UNKNOWN')
  }
  reasons.add('REPORT_PROVENANCE_UNVERIFIED')
  reasons.add('TOOL_IDENTITY_UNVERIFIED')
  reasons.add('EXECUTION_ENVIRONMENT_UNVERIFIED')
  reasons.add('RULE_COVERAGE_UNVERIFIED')
  const invalid =
    observation?.observationIntegrity === false ||
    reports.some((r) => r.integrity === 'INVALID')
  return {
    version: VALIDATOR_VERSION,
    status: invalid ? 'INVALID' : 'INCOMPLETE',
    trustedExecuted: false,
    sourceApproved,
    observationIntegrity: observation?.observationIntegrity ?? null,
    expectedFormat,
    reports,
    reasons: [...reasons].sort(),
  }
}
