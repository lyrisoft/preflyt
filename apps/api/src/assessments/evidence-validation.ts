import type { GitHubExecution } from './pipeline-verification.js'
import { checkReportFormat } from './check-report-adapters.js'
import { executionContracts } from './execution-contract.js'
import type { validatedProvenance } from '../github-events/ci-attestation-policy.js'
import { createHash } from 'node:crypto'
import { digest } from './assessment-digest.js'
import {
  parseArtifact,
  PARSER_VERSION,
  MAX_ARTIFACT_BYTES,
} from '../github-events/ci-artifact-parser.js'
import { importCiEvidence } from '../github-events/ci-evidence.js'
import type { GitHubWebhookDelivery } from '../generated/prisma/client.js'
export const VALIDATOR_VERSION = 2
export const MAX_VALIDATION_ARTIFACTS = 32
export type ReportValidation = {
  artifactId: string
  githubExecutions?: GitHubExecution[]
  format: string
  integrity: 'VALID' | 'INVALID'
  reasons: string[]
  reportedResult: string
  provenance?: ReturnType<typeof validatedProvenance>
  executedTests: number | null
  tools?: { nameHash: string; versionHash: string }[]
  findings?: number
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
  provenance?: ReturnType<typeof validatedProvenance>
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
  result.provenance = artifact.provenance ?? null
  const summary = parsed.summary as Record<string, any>
  if (artifact.format === 'junit') {
    result.executedTests = summary.passed + summary.failures + summary.errors
    result.reportedResult =
      result.executedTests === 0
        ? 'NO_EXECUTION'
        : summary.failures + summary.errors > 0
          ? 'REPORTED_FAILURE'
          : 'REPORTED_SUCCESS'
  } else {
    result.reportedResult = summary.execution
    const sarif = JSON.parse(
      Buffer.from(artifact.content)
        .toString('utf8')
        .replace(/^\uFEFF/, ''),
    )
    result.tools = sarif.runs.map((run: any) => ({
      nameHash: digest(run.tool.driver.name),
      versionHash: digest(
        run.tool.driver.version ?? run.tool.driver.semanticVersion ?? '',
      ),
    }))
    result.findings = summary.results
    if (summary.suppressed || summary.partial)
      result.reasons.push('REPORT_COVERAGE_INCOMPLETE')
  }
  // Hashes, schema validity and mutable labels cannot establish CI provenance.
  result.reasons.push(
    ...(result.provenance ? [] : ['REPORT_PROVENANCE_UNVERIFIED']),
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
  const contracts = executionContracts()
  const contract = contracts?.contracts.find((c) => c.ruleId === ruleId)
  const expectedFormat = contract?.format ?? checkReportFormat(ruleId) ?? null
  const githubReports = observation?.reports.filter(r => r.githubExecutions?.some(e => e.ruleId === ruleId)) ?? []
  const reports = (githubReports.length ? githubReports : observation?.reports ?? []).filter(r => r.format === expectedFormat)
  if (!expectedFormat) reasons.add('RULE_ADAPTER_UNSUPPORTED')
  else if (!reports.length) reasons.add('REQUIRED_REPORT_MISSING')
  if (reports.length > 1) reasons.add('REPORT_SELECTION_AMBIGUOUS')
  for (const report of reports) {
    for (const reason of report.reasons) reasons.add(reason)
    if (expectedFormat === 'junit' && !report.executedTests)
      reasons.add('MINIMUM_TEST_EXECUTION_NOT_ESTABLISHED')
    if (report.reportedResult === 'REPORTED_FAILURE')
      reasons.add('REPORT_REPORTED_FAILURE')
    if (report.reportedResult === 'UNKNOWN')
      reasons.add('REPORT_EXECUTION_UNKNOWN')
  }
  if (reports.length !== 1 || !reports[0].provenance)
    reasons.add('REPORT_PROVENANCE_UNVERIFIED')
  const report = reports.length === 1 ? reports[0] : undefined
  const provenance = report?.provenance
  const signedExecution =
    !!contract &&
    !!contracts &&
    !!provenance &&
    provenance.signerWorkflow === contract.signerWorkflow &&
    provenance.signerDigest === contract.signerDigest &&
    report?.integrity === 'VALID' &&
    report.reportedResult === 'REPORTED_SUCCESS' &&
    (contract.format === 'junit'
      ? (report.executedTests ?? 0) >= 1
      : report.tools?.length === 1 &&
        report.tools[0].nameHash === digest(contract.tool) &&
        report.tools[0].versionHash === digest(contract.toolVersion) &&
        report.findings === 0 &&
        !report.reasons.includes('REPORT_COVERAGE_INCOMPLETE'))
  const githubExecution = report?.githubExecutions?.find(e => e.ruleId === ruleId)
  const githubReportResult = githubExecution && report?.integrity === 'VALID'
    ? report.reportedResult === 'REPORTED_FAILURE' &&
      !report.reasons.includes('REPORT_COVERAGE_INCOMPLETE') &&
      (expectedFormat === 'junit' ? (report.executedTests ?? 0) >= 1 : !!report.tools?.length)
      ? 'failed'
      : report.reportedResult === 'REPORTED_SUCCESS' ? 'passed' : 'incomplete'
    : null
  const githubExecuted = !!githubExecution && report?.integrity === 'VALID' &&
    report.reportedResult === 'REPORTED_SUCCESS' &&
    (expectedFormat === 'junit' ? (report.executedTests ?? 0) >= 1 : report.findings === 0 &&
      !!report.tools?.length && !report.reasons.includes('REPORT_COVERAGE_INCOMPLETE'))
  const trusted = signedExecution || githubExecuted
  if (githubExecuted) reasons.delete('REPORT_PROVENANCE_UNVERIFIED')
  if (trusted) {
    for (const reason of [
      'TOOL_IDENTITY_UNVERIFIED',
      'EXECUTION_ENVIRONMENT_UNVERIFIED',
      'RULE_COVERAGE_UNVERIFIED',
    ])
      reasons.delete(reason)
  } else {
    reasons.add('TOOL_IDENTITY_UNVERIFIED')
    reasons.add('EXECUTION_ENVIRONMENT_UNVERIFIED')
    reasons.add('RULE_COVERAGE_UNVERIFIED')
    if (contract) reasons.add('EXECUTION_CONTRACT_NOT_MET')
  }
  const invalid =
    observation?.observationIntegrity === false ||
    reports.some((r) => r.integrity === 'INVALID')
  return {
    version: VALIDATOR_VERSION,
    status: invalid
      ? 'INVALID'
      : trusted && !reasons.size
        ? 'VERIFIED'
        : 'INCOMPLETE',
    trustedExecuted: trusted && !reasons.size,
    executionContractDigest: signedExecution ? contracts!.digest : null,
    ...(githubReportResult ? { githubExecution, githubReportResult } : {}),
    sourceApproved,
    observationIntegrity: observation?.observationIntegrity ?? null,
    expectedFormat,
    reports,
    reasons: [...reasons].sort(),
  }
}
