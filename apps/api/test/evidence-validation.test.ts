import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { parseArtifact } from '../src/github-events/ci-artifact-parser.js'
import { importCiEvidence } from '../src/github-events/ci-evidence.js'
import {
  validateObservation,
  validateReport,
  validateRuleEvidence,
} from '../src/assessments/evidence-validation.js'
const xml = '<testsuite><testcase name="sensitive-test-name"/></testsuite>'
const artifact = (content = xml) => {
  const sha256 = createHash('sha256').update(content).digest('hex')
  return {
    id: 'artifact',
    format: 'junit',
    sha256,
    parserVersion: 1,
    verification: 'ADMIN_ASSOCIATED_UNVERIFIED',
    content: Buffer.from(content),
    summary: parseArtifact('junit', content, sha256).summary,
  }
}
it('validates original bytes and summary without copying sensitive report names', () => {
  const validated = validateReport(artifact())
  expect(validated).toMatchObject({
    integrity: 'VALID',
    executedTests: 1,
    reportedResult: 'REPORTED_SUCCESS',
  })
  expect(JSON.stringify(validated)).not.toContain('sensitive-test-name')
  const result = validateRuleEvidence(
    'tests.required',
    true,
    { observationIntegrity: true, reports: [validated] },
    'FRESH_AT_COLLECTION',
    'SUCCEEDED',
    false,
    false,
    false,
  )
  expect(result).toMatchObject({ status: 'INCOMPLETE', trustedExecuted: false })
  expect(result.reasons).toContain('REPORT_PROVENANCE_UNVERIFIED')
})
it.each(['bytes', 'summary', 'parser'])('rejects tampered %s', (part) => {
  const a = artifact()
  if (part === 'bytes') a.content = Buffer.from('changed')
  if (part === 'summary') a.summary = { ...a.summary, tests: 999 }
  if (part === 'parser') a.parserVersion = 999
  expect(validateReport(a).integrity).toBe('INVALID')
})
it('does not upgrade mutable provenance labels', () => {
  const report = validateReport({
    ...artifact(),
    verification: 'VERIFIED_IMPORT_CI',
  })
  expect(
    validateRuleEvidence(
      'tests.required',
      true,
      { observationIntegrity: true, reports: [report] },
      'FRESH_AT_COLLECTION',
      'SUCCEEDED',
      false,
      false,
      false,
    ).trustedExecuted,
  ).toBe(false)
})
it('distinguishes failed, all-skipped and empty test execution', () => {
  for (const xml of [
    '<testsuite/>',
    '<testsuite><testcase name="test"><skipped/></testcase></testsuite>',
  ]) {
    const result = validateReport(artifact(xml))
    expect(result.executedTests).toBe(0)
    expect(
      validateRuleEvidence(
        'tests.required',
        true,
        { observationIntegrity: true, reports: [result] },
        'FRESH_AT_COLLECTION',
        'SUCCEEDED',
        false,
        false,
        false,
      ).reasons,
    ).toContain('MINIMUM_TEST_EXECUTION_NOT_ESTABLISHED')
  }
  expect(
    validateReport(
      artifact(
        '<testsuite><testcase name="test"><failure/></testcase></testsuite>',
      ),
    ).reportedResult,
  ).toBe('REPORTED_FAILURE')
})
it('requires the exact supported format, unique report, freshness and an approved source', () => {
  const report = validateReport(artifact())
  const a = validateRuleEvidence(
    'security.sast',
    false,
    { observationIntegrity: true, reports: [report] },
    'EXPIRED',
    'FAILED',
    true,
    true,
    true,
  )
  expect(a.reasons).toEqual(
    expect.arrayContaining([
      'SOURCE_APPROVAL_MISSING',
      'REQUIRED_REPORT_MISSING',
      'EVIDENCE_NOT_FRESH',
      'CI_SOURCE_AMBIGUOUS',
      'CI_OBSERVATION_SUPERSEDED',
      'VALIDATION_COLLECTION_TRUNCATED',
    ]),
  )
  expect(
    validateRuleEvidence(
      'tests.required',
      true,
      { observationIntegrity: true, reports: [report, report] },
      'FRESH_AT_COLLECTION',
      'SUCCEEDED',
      false,
      false,
      false,
    ).reasons,
  ).toContain('REPORT_SELECTION_AMBIGUOUS')
})
it('checks the signed observation projection, not just its stored hash', () => {
  const d = {
    id: 'd',
    event: 'check_run',
    action: 'completed',
    installationId: 1n,
    repositoryGithubId: 2n,
    sourceSha: 'a'.repeat(40),
    sourceObjectId: '1',
    sourceStatus: 'completed',
    sourceConclusion: 'success',
    sourceIdentity: null,
    sourceUpdatedAt: new Date(),
    receivedAt: new Date(),
    payloadHash: 'f'.repeat(64),
    state: 'PROCESSED',
  } as any
  const observation = importCiEvidence(d)!
  expect(validateObservation(observation, d)).toBe(true)
  expect(validateObservation({ ...observation, result: 'FAILED' }, d)).toBe(
    false,
  )
  expect(validateObservation(observation, undefined)).toBe(false)
})

it('rejects malformed original reports even when their digest matches', () => {
  const content = Buffer.from('not XML')
  const result = validateReport({
    ...artifact(),
    content,
    sha256: createHash('sha256').update(content).digest('hex'),
  })
  expect(result.reasons).toEqual(['REPORT_INVALID'])
})
it('validates SARIF execution separately from finding count without exposing tool names', () => {
  const content = JSON.stringify({
    version: '2.1.0',
    runs: [{ tool: { driver: { name: 'private-tool' } }, results: [] }],
  })
  const sha256 = createHash('sha256').update(content).digest('hex')
  const result = validateReport({
    ...artifact(),
    format: 'sarif',
    content: Buffer.from(content),
    sha256,
    summary: parseArtifact('sarif', content, sha256).summary,
  })
  expect(result).toMatchObject({
    integrity: 'VALID',
    reportedResult: 'UNKNOWN',
    executedTests: null,
  })
  expect(JSON.stringify(result)).not.toContain('private-tool')
})

it('accepts complete report results only with a server-verified GitHub execution and an approved current source', () => {
  const report = { ...validateReport(artifact()), githubExecutions: [{ submissionId: 'submission', ruleId: 'tests.required',
    sourceSha: 'a'.repeat(40), runId: '1', runAttempt: 1, workflowId: '2', policyId: 'policy', policyHash: 'hash', verifiedAt: new Date().toISOString() }] }
  const check = (r: any, approved = true, integrity = true, fresh = 'FRESH_AT_COLLECTION') => validateRuleEvidence(
    'tests.required', approved, { observationIntegrity: integrity, reports: [r] }, fresh, 'SUCCEEDED', false, false, false)
  expect(check(report)).toMatchObject({ status: 'VERIFIED', trustedExecuted: true, githubExecution: { ruleId: 'tests.required' } })
  expect(check(report, false).trustedExecuted).toBe(false)
  expect(check(report, true, false).status).toBe('INVALID')
  expect(check(report, true, true, 'EXPIRED').trustedExecuted).toBe(false)
  expect(check({ ...report, executedTests: 0 }).trustedExecuted).toBe(false)
  expect(check({ ...report, reportedResult: 'REPORTED_FAILURE' }).trustedExecuted).toBe(false)
  expect(check({ ...report, reportedResult: 'REPORTED_FAILURE' })).toMatchObject({githubReportResult:'failed', githubExecution:{ruleId:'tests.required'}})
  expect(check({ ...report, reportedResult: 'UNKNOWN' }).githubReportResult).toBe('incomplete')
  expect(check({ ...report, reportedResult: 'REPORTED_FAILURE', reasons:['REPORT_COVERAGE_INCOMPLETE'] }).githubReportResult).toBe('incomplete')
  expect(check({ ...report, githubExecutions: undefined }).trustedExecuted).toBe(false)
})
