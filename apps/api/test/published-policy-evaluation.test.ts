import { afterEach, expect, it, vi } from 'vitest'
import { digest } from '../src/assessments/assessment-digest.js'
import { attestationPolicy, reportProofPolicy } from '../src/github-events/ci-attestation-policy.js'
import { generateKeyPairSync } from 'node:crypto'
import { executionContracts } from '../src/assessments/execution-contract.js'
import { evaluatePublishedPolicy } from '../src/assessments/published-policy-evaluation.js'
const sha = 'a'.repeat(40)
const now = new Date('2026-10-09T12:00:00Z')
afterEach(() => vi.unstubAllEnvs())
function fixture() {
  vi.stubEnv('CI_ATTESTATION_GH_PATH', '/tmp/gh')
  vi.stubEnv('CI_ATTESTATION_GH_SHA256', 'a'.repeat(64))
  vi.stubEnv('CI_ATTESTATION_ROOT_PATH', '/tmp/root.json')
  vi.stubEnv('CI_ATTESTATION_ROOT_SHA256', 'b'.repeat(64))
  vi.stubEnv(
    'CI_ATTESTATION_WORKFLOWS',
    JSON.stringify([
      'lyrisoft/preflyt-p2-acceptance/.github/workflows/tests.yml',
    ]),
  )
  vi.stubEnv(
    'CI_EXECUTION_CONTRACTS',
    JSON.stringify([
      {
        ruleId: 'tests.required',
        signerWorkflow:
          'lyrisoft/preflyt-p2-acceptance/.github/workflows/tests.yml',
        signerDigest: sha,
        format: 'junit',
        tool: 'vitest',
        toolVersion: '4.1.11',
      },
    ]),
  )
  const contractDigest = executionContracts()!.digest
  const checks = [
    {
      id: 'tests.required',
      version: '1.0.0',
      required: true,
      operator: 'verified_check_succeeded',
      capability: 'import_only',
      allowedSources: ['verified_imported_ci'],
      maxAgeHours: 24,
    },
  ]
  const snapshot: any = {
    sourceSha: sha,
    request: { sourceSha: sha, selectionId: 'selection' },
    plan: {
      version: 1,
      sourceSha: sha,
      enforcement: 'observe',
      mode: 'INGEST_ONLY',
      stage: 'ci',
      checks,
    },
    report: {
      version: 1,
      sourceSha: sha,
      collectedAt: now.toISOString(),
      collectionTruncated: false,
      validationCollectionTruncated: false,
      checks: [
        {
          ruleId: 'tests.required',
          required: true,
          coverage: 'UNVERIFIED',
          deliveryId: 'delivery',
          mappingTrust: 'APPROVED_SOURCE_BINDING',
          freshness: 'FRESH_AT_COLLECTION',
          ambiguous: false,
          superseded: false,
          providerResult: 'SUCCEEDED',
          evidenceValidation: {
            version: 2,
            reports: [
              {
                provenance: {
                  policyDigest: attestationPolicy()!.digest,
                  runId: '1',
                  runAttempt: 1,
                },
              },
            ],
            status: 'VERIFIED',
            trustedExecuted: true,
            executionContractDigest: contractDigest,
            observationIntegrity: true,
            sourceApproved: true,
          },
        },
      ],
      observations: [
        {
          deliveryId: 'delivery',
          sourceSha: sha,
          sourceObjectId: '1',
          sourceKind: 'workflow_run',
          sourceStatus: 'completed',
          sourceConclusion: 'success',
          sourceUpdatedAt: now.toISOString(),
          sourceIdentity: { runAttempt: 1, workflowId: '2' },
        },
      ],
    },
  }
  const definition = {
    branchRef: 'refs/heads/main',
    selectionId: 'selection',
    executionContractDigest: contractDigest,
    rules: checks,
  }
  const policy = {
    id: 'policy',
    state: 'PUBLISHED',
    selectionId: 'selection',
    definition,
    definitionHash: digest(definition),
  }
  const runs: any = {
    '1': {
      sourceSha: sha,
      runAttempt: 1,
      workflowId: '2',
      status: 'completed',
      conclusion: 'success',
    },
  }
  return { snapshot, policy, runs }
}
function evaluate(value: ReturnType<typeof fixture>) {
  value.snapshot.assessmentHash = digest({
    request: value.snapshot.request,
    plan: value.snapshot.plan,
    report: value.snapshot.report,
  })
  return evaluatePublishedPolicy(
    value.snapshot,
    value.policy,
    'refs/heads/main',
    value.runs,
    now,
  )
}
it('passes only with the published contract and current verified execution', () => {
  expect(evaluate(fixture()).status).toBe('PASS')
})
it.each([
  'rerun',
  'sha',
  'pending',
  'missing',
  'stale',
  'contract',
  'unverified',
  'truncated',
  'report-sha',
  'schema',
])('does not pass %s evidence', (kind) => {
  const v = fixture()
  if (kind === 'rerun') v.runs['1'].runAttempt = 2
  if (kind === 'sha') v.runs['1'].sourceSha = 'b'.repeat(40)
  if (kind === 'pending') v.runs['1'].status = 'in_progress'
  if (kind === 'missing') v.runs = {}
  if (kind === 'stale')
    v.snapshot.report.observations[0].sourceUpdatedAt = '2026-10-01T12:00:00Z'
  if (kind === 'contract') vi.stubEnv('CI_EXECUTION_CONTRACTS', '[]')
  if (kind === 'unverified')
    v.snapshot.report.checks[0].evidenceValidation.trustedExecuted = false
  if (kind === 'truncated') v.snapshot.report.collectionTruncated = true
  if (kind === 'report-sha') v.snapshot.report.sourceSha = 'b'.repeat(40)
  if (kind === 'schema') v.snapshot.report.version = 99
  expect(evaluate(v).status).toBe('INCOMPLETE')
})
it('blocks approved required failed CI at the current run attempt', () => {
  const v = fixture()
  v.runs['1'].conclusion = 'failure'
  v.snapshot.report.checks[0].providerResult = 'FAILED'
  v.snapshot.report.observations[0].sourceConclusion = 'failure'
  v.snapshot.report.observations[0].result = 'FAILED'
  expect(evaluate(v).status).toBe('BLOCK')
})
it('rejects changed policy definitions and duplicate requirements', () => {
  const v = fixture()
  v.policy.definition.rules.push(v.policy.definition.rules[0])
  v.policy.definitionHash = digest(v.policy.definition)
  expect(() => evaluate(v)).toThrow('cover')
})
it('rejects unpublished policy and wrong branch', () => {
  const v = fixture()
  v.policy.state = 'DRAFT'
  expect(() => evaluate(v)).toThrow('published')
})

it('does not reuse trust after the attestation configuration changes', () => {
  const value = fixture()
  vi.stubEnv('CI_ATTESTATION_ROOT_SHA256', 'c'.repeat(64))
  expect(evaluate(value).status).toBe('INCOMPLETE')
})

it('supports organization-key evidence without relaxing frozen policy, workflow freshness or key revocation',()=>{
 const f=fixture()
 const pair=generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'}})
 vi.stubEnv('CI_REPORT_PROOF_MODE','organization-key')
 vi.stubEnv('CI_ORGANIZATION_SIGNER_KEYS',JSON.stringify([{kid:'test',algorithm:'RS256',publicKeyPem:pair.publicKey,repositoryIds:['501'],workflows:[{path:'lyrisoft/preflyt-p2-acceptance/.github/workflows/tests.yml',sha}]}]))
 f.snapshot.report.checks[0].evidenceValidation.reports[0].provenance.policyDigest=reportProofPolicy()!.digest
 expect(evaluate(f).status).toBe('PASS')
 vi.stubEnv('CI_ORGANIZATION_SIGNER_KEYS','[]')
 expect(evaluate(f).status).toBe('INCOMPLETE')
})
