import { digest } from '../src/assessments/assessment-digest.js'
import { afterEach, expect, it, vi } from 'vitest'
import { executionContracts } from '../src/assessments/execution-contract.js'
import { validateRuleEvidence } from '../src/assessments/evidence-validation.js'
const contract = {
  ruleId: 'tests.required',
  signerWorkflow: 'lyrisoft/preflyt-p2-acceptance/.github/workflows/tests.yml',
  signerDigest: 'a'.repeat(40),
  format: 'junit',
  tool: 'vitest',
  toolVersion: '4.1.11',
}
afterEach(() => vi.unstubAllEnvs())
function evidence(change: Record<string, unknown> = {}) {
  vi.stubEnv('CI_EXECUTION_CONTRACTS', JSON.stringify([contract]))
  const report: any = {
    artifactId: 'artifact',
    format: 'junit',
    integrity: 'VALID',
    reportedResult: 'REPORTED_SUCCESS',
    executedTests: 1,
    reasons: [
      'TOOL_IDENTITY_UNVERIFIED',
      'EXECUTION_ENVIRONMENT_UNVERIFIED',
      'RULE_COVERAGE_UNVERIFIED',
    ],
    provenance: {
      signerWorkflow: contract.signerWorkflow,
      signerDigest: contract.signerDigest,
    },
    ...change,
  }
  return validateRuleEvidence(
    'tests.required',
    true,
    { observationIntegrity: true, reports: [report] },
    'FRESH_AT_COLLECTION',
    'SUCCEEDED',
    false,
    false,
    false,
  )
}
it('accepts a passing report only under its reviewed pinned execution contract', () => {
  expect(evidence()).toMatchObject({
    status: 'VERIFIED',
    trustedExecuted: true,
    executionContractDigest: executionContracts()!.digest,
  })
})
it.each([
  { executedTests: 0 },
  { integrity: 'INVALID' },
  { provenance: null },
  {
    provenance: {
      signerWorkflow: contract.signerWorkflow,
      signerDigest: 'b'.repeat(40),
    },
  },
  { reportedResult: 'REPORTED_FAILURE' },
])('does not trust incomplete or mismatched report proof', (change) => {
  expect(evidence(change).trustedExecuted).toBe(false)
})
it('rejects malformed, duplicate and unsupported contracts', () => {
  for (const value of [
    'broken',
    JSON.stringify([contract, contract]),
    JSON.stringify([{ ...contract, ruleId: 'unknown.control' }]),
    JSON.stringify([{ ...contract, signerDigest: 'main' }]),
  ]) {
    vi.stubEnv('CI_EXECUTION_CONTRACTS', value)
    expect(executionContracts()).toBeNull()
  }
})

it.each([
  'types.required',
  'build.required',
  'frontend.components',
  'service.resilience',
])('requires an executed, proven named pipeline report for %s', (ruleId) => {
  vi.stubEnv(
    'CI_EXECUTION_CONTRACTS',
    JSON.stringify([{ ...contract, ruleId }]),
  )
  expect(executionContracts()?.contracts[0].ruleId).toBe(ruleId)
  const report: any = {
    format: 'junit',
    integrity: 'VALID',
    reportedResult: 'REPORTED_SUCCESS',
    executedTests: 1,
    reasons: [],
    provenance: {
      signerWorkflow: contract.signerWorkflow,
      signerDigest: contract.signerDigest,
    },
  }
  const validate = () =>
    validateRuleEvidence(
      ruleId,
      true,
      { observationIntegrity: true, reports: [report] },
      'FRESH_AT_COLLECTION',
      'SUCCEEDED',
      false,
      false,
      false,
    )
  expect(validate().trustedExecuted).toBe(true)
  report.executedTests = 0
  expect(validate().trustedExecuted).toBe(false)
  report.executedTests = 1
  report.provenance.signerDigest = 'b'.repeat(40)
  expect(validate().trustedExecuted).toBe(false)
})

it.each([
  'lint.required',
  'security.sast',
  'secrets.scan',
  'security.dependencies',
  'containers.scan',
  'iac.policy',
  'iac.exposures',
])(
  'verifies tool, provenance and complete zero-finding reports for %s',
  (ruleId) => {
    const scanner = {
      ...contract,
      ruleId,
      format: 'sarif',
      tool: 'reviewed-scanner',
      toolVersion: '1.2.3',
    }
    vi.stubEnv('CI_EXECUTION_CONTRACTS', JSON.stringify([scanner]))
    const report: any = {
      format: 'sarif',
      integrity: 'VALID',
      reportedResult: 'REPORTED_SUCCESS',
      findings: 0,
      reasons: [],
      tools: [
        {
          nameHash: digest(scanner.tool),
          versionHash: digest(scanner.toolVersion),
        },
      ],
      provenance: {
        signerWorkflow: scanner.signerWorkflow,
        signerDigest: scanner.signerDigest,
      },
    }
    const validate = () =>
      validateRuleEvidence(
        ruleId,
        true,
        { observationIntegrity: true, reports: [report] },
        'FRESH_AT_COLLECTION',
        'SUCCEEDED',
        false,
        false,
        false,
      )
    expect(validate().trustedExecuted).toBe(true)
    report.findings = 1
    expect(validate().trustedExecuted).toBe(false)
    report.findings = 0
    report.tools[0].versionHash = digest('different-version')
    expect(validate().trustedExecuted).toBe(false)
    report.tools[0].versionHash = digest(scanner.toolVersion)
    report.reasons = ['REPORT_COVERAGE_INCOMPLETE']
    expect(validate().trustedExecuted).toBe(false)
  },
)
