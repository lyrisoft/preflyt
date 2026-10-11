import { describe, expect, it } from 'vitest'
import { normalizePipelineSubmission } from '../src/assessments/pipeline-submission.js'
const policy = { id: 'published-policy', definitionHash: 'a'.repeat(64), repositoryId: '123', sourceSha: 'b'.repeat(40), headSha: 'c'.repeat(40), checks: [{ id: 'tests.required', title: 'Tests', required: true }, { id: 'ci.configured', title: 'CI configuration', required: true }] }
const body = () => ({ schemaVersion: 1, policyId: policy.id, policyHash: policy.definitionHash, repositoryId: policy.repositoryId, sourceSha: policy.sourceSha, headSha: policy.headSha, results: [{ ruleId: 'tests.required', status: 'passed', required: false, title: 'Spoofed title' }], reports: [] })
describe('pipeline result intake', () => {
  it('cannot remove required checks or overwrite policy metadata with runner assertions', () => {
    const result = normalizePipelineSubmission(body(), policy)
    expect(result.result).toBe('incomplete')
    expect(result.results).toEqual([{ ruleId: 'tests.required', title: 'Tests', required: true, status: 'passed' }, { ruleId: 'ci.configured', title: 'CI configuration', required: true, status: 'incomplete' }])
    expect(result).not.toHaveProperty('verification')
  })
  it('rejects results from another policy, repository, workflow commit or PR head', () => {
    for (const field of ['policyId', 'policyHash', 'repositoryId', 'sourceSha', 'headSha']) expect(() => normalizePipelineSubmission({ ...body(), [field]: 'different' }, policy)).toThrow()
  })
  it('rejects duplicate and unknown check results instead of accepting last-write wins', () => {
    const input = body()
    expect(() => normalizePipelineSubmission({ ...input, results: [...input.results, input.results[0]] }, policy)).toThrow()
    expect(() => normalizePipelineSubmission({ ...input, results: [{ ruleId: 'unapproved', status: 'passed' }] }, policy)).toThrow()
  })
  it('rejects invented report formats and invalid report digests', () => {
    expect(() => normalizePipelineSubmission({ ...body(), reports: [{ ruleId: 'tests.required', format: 'sarif', content: '{}', sha256: 'a'.repeat(64) }] }, policy)).toThrow()
    expect(() => normalizePipelineSubmission({ ...body(), reports: [{ ruleId: 'tests.required', format: 'junit', content: '<testsuite/>', sha256: 'a'.repeat(64) }] }, policy)).toThrow()
  })
})
