import { describe, it, expect } from 'vitest'
import { previewGate } from '../src/assessments/gate-preview.js'
import { datedGatePreview } from '../src/assessments/assessment-result-dates.js'
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
  it('adds only matched evidence dates without changing gate results or their hash', () => {
    const value: any = fixture()
    value.report.checks[0].deliveryId = 'matched'
    value.report.observations = [
      { deliveryId: 'other', observedAt: '2026-10-13T10:00:00Z' },
      { deliveryId: 'matched', observedAt: '2026-10-12T09:55:00Z' },
    ]
    const dated = datedGatePreview(value)
    expect(dated.rules[0].recordedAt).toBe('2026-10-12T09:55:00Z')
    expect({ ...dated, rules: dated.rules.map(({ recordedAt: _date, ...rule }) => rule) }).toEqual(previewGate(value))
    for (const observations of [[], [{ deliveryId: 'matched', observedAt: 'invalid' }], [
      { deliveryId: 'matched', observedAt: '2026-10-12T09:55:00Z' },
      { deliveryId: 'matched', observedAt: '2026-10-12T10:00:00Z' },
    ]]) {
      value.report.observations = observations
      expect(datedGatePreview(value).rules[0].recordedAt).toBeNull()
    }
    expect(datedGatePreview({ ...value, report: null }).rules).toEqual([])
  })
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

const failedFixture = () => {
  const value: any = fixture()
  value.plan.checks[0] = {
    id: 'tests.required',
    required: true,
    operator: 'verified_check_succeeded',
    capability: 'import_only',
    allowedSources: ['verified_imported_ci'],
  }
  value.report.checks[0] = {
    ruleId: 'tests.required',
    required: true,
    deliveryId: 'delivery',
    providerResult: 'FAILED',
    mappingTrust: 'APPROVED_SOURCE_BINDING',
    freshness: 'FRESH_AT_COLLECTION',
    ambiguous: false,
    superseded: false,
    evidenceValidation: {
      version: 2,
      sourceApproved: true,
      observationIntegrity: true,
      reasons: [],
    },
  }
  value.report.observations = [
    {
      deliveryId: 'delivery',
      sourceSha: sha,
      result: 'FAILED',
      sourceStatus: 'completed',
      sourceKind: 'check_run',
    },
  ]
  return value
}
describe('approved negative CI evidence', () => {
  it('blocks a required failed source with exact-revision integrity and approved binding', () => {
    expect(previewGate(failedFixture())).toMatchObject({
      evaluatorVersion: 3,
      status: 'BLOCK',
      publication: 'DISABLED',
      requiredRulesBlocked: 1,
      requiredRulesSatisfied: 0,
      rules: [
        {
          status: 'BLOCK',
          reasons: expect.arrayContaining(['APPROVED_CI_SOURCE_FAILED']),
        },
      ],
    })
  })
  it.each([
    'manual',
    'unapproved',
    'integrity',
    'stale',
    'future',
    'ambiguous',
    'superseded',
    'truncated',
    'validator',
    'other-sha',
    'missing',
    'duplicate',
    'pending',
    'unsupported',
    'source-type',
    'disallowed-source',
  ])('does not claim a verified CI failure for %s evidence', (scenario) => {
    const value = failedFixture(),
      check = value.report.checks[0]
    if (scenario === 'manual')
      check.mappingTrust = 'ADMIN_ASSOCIATED_UNVERIFIED'
    if (scenario === 'unapproved')
      check.evidenceValidation.sourceApproved = false
    if (scenario === 'integrity')
      check.evidenceValidation.observationIntegrity = false
    if (scenario === 'stale') check.freshness = 'EXPIRED'
    if (scenario === 'future') check.freshness = 'FUTURE'
    if (scenario === 'ambiguous') check.ambiguous = true
    if (scenario === 'superseded') check.superseded = true
    if (scenario === 'truncated') value.report.collectionTruncated = true
    if (scenario === 'validator') check.evidenceValidation.version = 99
    if (scenario === 'other-sha')
      value.report.observations[0].sourceSha = 'f'.repeat(40)
    if (scenario === 'missing') value.report.observations = []
    if (scenario === 'duplicate')
      value.report.observations.push(value.report.observations[0])
    if (scenario === 'pending')
      value.report.observations[0].sourceStatus = 'queued'
    if (scenario === 'unsupported') value.plan.checks[0].capability = 'planned'
    if (scenario === 'source-type')
      value.report.observations[0].sourceKind = 'status'
    if (scenario === 'disallowed-source')
      value.plan.checks[0].allowedSources = []
    expect(previewGate(value).status).toBe('INCOMPLETE')
  })
  it('warns about failed advisory sources and preserves incomplete required coverage', () => {
    const value = failedFixture()
    const configuration = fixture()
    value.plan.checks.push(configuration.plan.checks[0])
    value.report.checks.push(configuration.report.checks[0])
    value.plan.checks[0].required = value.report.checks[0].required = false
    expect(previewGate(value)).toMatchObject({
      status: 'WARN',
      advisoryFailed: 1,
      advisoryIncomplete: 0,
    })
    value.report.checks[1].coverage = 'MISSING'
    expect(previewGate(value).status).toBe('INCOMPLETE')
  })
  it('keeps incomplete requirements visible when another required source failed', () => {
    const value = failedFixture(),
      config = fixture()
    value.plan.checks.push(config.plan.checks[0])
    value.report.checks.push({
      ...config.report.checks[0],
      coverage: 'MISSING',
    })
    expect(previewGate(value)).toMatchObject({
      status: 'BLOCK',
      requiredRulesBlocked: 1,
      requiredRulesIncomplete: 1,
    })
  })
  it('does not turn an approved success into trusted execution', () => {
    const value = failedFixture()
    value.report.checks[0].providerResult =
      value.report.observations[0].result = 'SUCCEEDED'
    expect(previewGate(value).status).toBe('INCOMPLETE')
  })
})

const githubFixture = () => {
  const value = failedFixture(),
    check = value.report.checks[0]
  check.providerResult = value.report.observations[0].result = 'SUCCEEDED'
  check.evidenceValidation = {
    ...check.evidenceValidation,
    status: 'VERIFIED',
    trustedExecuted: true,
    githubExecution: {
      ruleId: 'tests.required',
      sourceSha: sha,
      runId: '123',
      runAttempt: 1,
      workflowId: '456',
    },
  }
  Object.assign(value.report.observations[0], {
    sourceKind: 'workflow_run',
    sourceConclusion: 'success',
    sourceObjectId: '123',
    sourceIdentity: { runAttempt: 1, workflowId: '456' },
  })
  return value
}
describe('server-verified GitHub execution preview', () => {
  it('preserves passed, failed and incomplete reports independently in one successful collection job', () => {
    const value = githubFixture()
    const definition = value.plan.checks[0]
    const check = value.report.checks[0]
    const ids = ['tests.required', 'build.required', 'security.sast']
    value.plan.checks = ids.map(id => ({...definition, id}))
    value.report.checks = ids.map((ruleId, index) => ({
      ...check, ruleId,
      evidenceValidation: {...check.evidenceValidation,
        githubExecution: {...check.evidenceValidation.githubExecution, ruleId},
        status: index ? 'INCOMPLETE' : 'VERIFIED', trustedExecuted: index === 0,
        githubReportResult: ['passed','failed','incomplete'][index],
        reasons: index ? ['REPORT_REPORTED_FAILURE'] : [],
      },
    }))
    expect(previewGate(value)).toMatchObject({
      status:'BLOCK', requiredRulesSatisfied:1, requiredRulesBlocked:1, requiredRulesIncomplete:1,
      rules:[{ruleId:ids[0],status:'PASS'},{ruleId:ids[1],status:'BLOCK'},{ruleId:ids[2],status:'INCOMPLETE'}],
    })
  })
  it('fails only the independently failed report while partial execution remains incomplete', () => {
    const value = githubFixture()
    Object.assign(value.report.checks[0].evidenceValidation, {
      status: 'INCOMPLETE', trustedExecuted: false,
      reasons: ['REPORT_REPORTED_FAILURE'], githubReportResult: 'failed',
    })
    expect(previewGate(value)).toMatchObject({ status: 'BLOCK', requiredRulesBlocked: 1 })
    value.report.checks[0].evidenceValidation.githubReportResult = 'incomplete'
    expect(previewGate(value).status).toBe('INCOMPLETE')
    value.report.checks[0].evidenceValidation.githubReportResult = 'failed'
    value.report.checks[0].evidenceValidation.observationIntegrity = false
    expect(previewGate(value).status).toBe('INCOMPLETE')
  })
  it('passes a verified configured run without requiring a report signature', () => {
    expect(previewGate(githubFixture())).toMatchObject({
      status: 'PASS',
      requiredRulesSatisfied: 1,
    })
  })
  it.each([
    'receipt',
    'sha',
    'run',
    'attempt',
    'workflow',
    'validator',
    'reasons',
    'integrity',
    'unapproved',
    'source-sha',
    'result',
    'planned',
    'truncated',
    'invalid-report',
    'ambiguous',
    'stale',
  ])('keeps %s evidence incomplete', (scenario) => {
    const value = githubFixture(),
      check = value.report.checks[0],
      execution = check.evidenceValidation.githubExecution
    if (scenario === 'receipt') delete check.evidenceValidation.githubExecution
    if (scenario === 'sha') execution.sourceSha = 'f'.repeat(40)
    if (scenario === 'run') execution.runId = '124'
    if (scenario === 'attempt') execution.runAttempt = 2
    if (scenario === 'workflow') execution.workflowId = '457'
    if (scenario === 'validator') check.evidenceValidation.version = 99
    if (scenario === 'reasons')
      check.evidenceValidation.reasons = ['REPORT_SELECTION_AMBIGUOUS']
    if (scenario === 'integrity')
      check.evidenceValidation.observationIntegrity = false
    if (scenario === 'unapproved')
      check.evidenceValidation.sourceApproved = false
    if (scenario === 'source-sha')
      value.report.observations[0].sourceSha = 'f'.repeat(40)
    if (scenario === 'result') value.report.observations[0].result = 'PENDING'
    if (scenario === 'planned') value.plan.checks[0].capability = 'planned'
    if (scenario === 'truncated') value.report.collectionTruncated = true
    if (scenario === 'invalid-report') check.coverage = 'INVALID'
    if (scenario === 'ambiguous') check.ambiguous = true
    if (scenario === 'stale') check.freshness = 'EXPIRED'
    expect(previewGate(value).status).toBe('INCOMPLETE')
  })
})
