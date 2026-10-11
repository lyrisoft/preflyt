import { randomUUID } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { executionContracts } from '../src/assessments/execution-contract.js'
import { customRule, ruleRequirementsDigest } from '../src/standards/catalogue.js'
import { checkReportFormat } from '../src/assessments/check-report-adapters.js'
afterEach(() => vi.unstubAllEnvs())
it('uses the declared report format and retains the trusted execution boundary', () => {
  const id = `custom-junit-${randomUUID()}`
  const contract = { ruleId: id, format: 'junit', signerWorkflow: 'org/repo/.github/workflows/tests.yml', signerDigest: 'a'.repeat(40), tool: 'vitest', toolVersion: '4' }
  vi.stubEnv('CI_EXECUTION_CONTRACTS', JSON.stringify([contract]))
  expect(executionContracts()?.contracts[0]).toEqual(contract)
  vi.stubEnv('CI_EXECUTION_CONTRACTS', JSON.stringify([{ ...contract, format: 'sarif' }]))
  expect(executionContracts()).toBeNull()
  expect(checkReportFormat('shell.custom')).toBeUndefined()
  expect(customRule({ id, title: 'Contract tests', guidance: 'Fix incompatible changes.' })).toMatchObject({ capability: 'import_only', onMissing: 'INCOMPLETE', thresholds: { maxFailedChecks: 0, minimumExecutedTests: 1 } })
})
it('treats descriptive edits separately from changes to evaluation requirements', () => {
  const check = customRule({ id: `custom-sarif-${randomUUID()}`, title: 'Scan', guidance: 'Fix findings.' })!
  expect(ruleRequirementsDigest({ ...check, title: 'Renamed', guidance: 'Updated guidance.' })).toBe(ruleRequirementsDigest(check))
  expect(ruleRequirementsDigest({ ...check, onMissing: 'PASS' } as never)).not.toBe(ruleRequirementsDigest(check))
})
