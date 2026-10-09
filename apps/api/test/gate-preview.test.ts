import { describe, it, expect } from 'vitest'
import { previewGate } from '../src/assessments/gate-preview.js'
const sha = 'a'.repeat(40)
const fixture = () => ({
  sourceSha: sha,
  assessmentHash: 'b'.repeat(64),
  request: {
    sourceSha: sha,
    profileSnapshot: { sourceSha: sha, complete: true },
  },
  plan: {
    version: 1,
    sourceSha: sha,
    enforcement: 'observe',
    mode: 'INGEST_ONLY',
    stage: 'ci',
    checks: [
      {
        id: 'ci.configured',
        required: true,
        operator: 'configuration_hint_present',
        capability: 'available',
      },
    ],
  },
  report: {
    version: 1,
    sourceSha: sha,
    collectionTruncated: false,
    validationCollectionTruncated: false,
    checks: [
      {
        ruleId: 'ci.configured',
        title: 'CI configuration',
        required: true,
        coverage: 'CONFIGURATION_OBSERVED',
        configurationEvidence: [
          { path: '.github/workflows/ci.yml', blobSha: 'c'.repeat(40) },
        ],
      },
    ],
  },
})
describe('historical deterministic gate preview', () => {
  it('evaluates a configuration-only requirement and remains historical and unpublished', () => {
    expect(previewGate(fixture())).toMatchObject({
      status: 'PASS',
      publication: 'DISABLED',
      currentBranchReadiness: 'NOT_VERIFIED',
      requiredRulesSatisfied: 1,
    })
    expect(previewGate(fixture())).toEqual(previewGate(fixture()))
  })
  it.each(['SUCCEEDED', 'FAILED', 'NOT_EXECUTED', 'PENDING'])(
    'never promotes provider %s or signed report provenance into trusted execution',
    (provider) => {
      const value: any = fixture()
      value.plan.checks[0] = {
        id: 'tests.required',
        required: true,
        operator: 'verified_check_succeeded',
        capability: 'import_only',
      }
      value.report.checks[0] = {
        ruleId: 'tests.required',
        required: true,
        coverage: 'UNVERIFIED',
        providerResult: provider,
        evidenceValidation: {
          trustedExecuted: true,
          status: 'VALID',
          reasons: [],
        },
      }
      expect(previewGate(value)).toMatchObject({
        status: 'INCOMPLETE',
        rules: [
          {
            status: 'INCOMPLETE',
            reasons: ['TRUSTED_EXECUTION_NOT_ESTABLISHED'],
          },
        ],
      })
    },
  )
  it.each([
    'missing',
    'truncated',
    'revision',
    'schema',
    'duplicate',
    'required-mismatch',
    'profile',
    'malformed-evidence',
    'missing-validator',
    'request-revision',
    'unknown-operator',
  ])('fails closed for %s data', (scenario) => {
    const value: any = fixture()
    if (scenario === 'missing') value.report.checks[0].coverage = 'MISSING'
    if (scenario === 'truncated') value.report.collectionTruncated = true
    if (scenario === 'revision') value.report.sourceSha = 'd'.repeat(40)
    if (scenario === 'schema') value.plan.version = 99
    if (scenario === 'duplicate')
      value.report.checks.push(value.report.checks[0])
    if (scenario === 'required-mismatch')
      value.report.checks[0].required = false
    if (scenario === 'profile') value.request.profileSnapshot.complete = false
    if (scenario === 'malformed-evidence')
      value.report.checks[0].configurationEvidence = [{}]
    if (scenario === 'missing-validator')
      delete value.report.validationCollectionTruncated
    if (scenario === 'request-revision')
      value.request.sourceSha = 'f'.repeat(40)
    if (scenario === 'unknown-operator')
      value.plan.checks[0].operator = 'unsupported'
    expect(previewGate(value).status).toBe('INCOMPLETE')
  })
  it('warns for unsupported advisory checks but never ignores required missing checks', () => {
    const value: any = fixture()
    value.plan.checks.push({
      id: 'lint.required',
      required: false,
      operator: 'verified_check_succeeded',
      capability: 'planned',
    })
    value.report.checks.push({
      ruleId: 'lint.required',
      required: false,
      coverage: 'UNSUPPORTED',
    })
    expect(previewGate(value).status).toBe('WARN')
    value.plan.checks[1].required = value.report.checks[1].required = true
    expect(previewGate(value).status).toBe('INCOMPLETE')
  })
  it('does not pass an empty policy or mutate a frozen snapshot', () => {
    const value = fixture(),
      before = JSON.stringify(value)
    previewGate(value)
    expect(JSON.stringify(value)).toBe(before)
    value.plan.checks = []
    value.report.checks = []
    expect(previewGate(value)).toMatchObject({
      status: 'INCOMPLETE',
      reasons: ['NO_REQUIRED_RULES'],
    })
  })
})
