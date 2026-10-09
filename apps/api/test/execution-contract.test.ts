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
    JSON.stringify([{ ...contract, ruleId: 'lint.required' }]),
    JSON.stringify([{ ...contract, signerDigest: 'main' }]),
  ]) {
    vi.stubEnv('CI_EXECUTION_CONTRACTS', value)
    expect(executionContracts()).toBeNull()
  }
})
