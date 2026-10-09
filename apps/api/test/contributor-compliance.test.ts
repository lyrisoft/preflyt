import { expect, it } from 'vitest'
import { digest } from '../src/assessments/assessment-digest.js'
import { contributorCompliance } from '../src/contributors/policy-compliance.js'
const sha = 'a'.repeat(40),
  nextSha = 'b'.repeat(40)
const observation = (overrides = {}) => ({
  repositoryId: 'repo',
  sourceObjectId: 'pr-1',
  sourceSha: sha,
  pullRequestNumber: 1,
  observedAt: new Date('2026-10-01'),
  ...overrides,
})
function assessment(overrides: Record<string, any> = {}) {
  const value = {
    id: 'assessment',
    repositoryId: 'repo',
    sourceSha: sha,
    selectionId: 'selection',
    createdAt: new Date('2026-10-02'),
    assessmentHash: '',
    request: {
      sourceSha: sha,
      selectionId: overrides.selectionId ?? 'selection',
      selectionRevision: 1,
      pullRequest: { number: 1, objectId: 'pr-1', head: { sha } },
      profileSnapshot: { sourceSha: sha, complete: true },
    },
    plan: {
      version: 1,
      sourceSha: sha,
      mode: 'INGEST_ONLY',
      stage: 'ci',
      enforcement: 'observe',
      checks: [
        {
          id: 'ci',
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
          ruleId: 'ci',
          required: true,
          coverage: 'CONFIGURATION_OBSERVED',
          configurationEvidence: [
            { path: '.github/workflows/ci.yml', blobSha: 'c'.repeat(40) },
          ],
        },
      ],
    },
    ...overrides,
  }
  value.assessmentHash = digest({
    request: value.request,
    plan: value.plan,
    report: value.report,
  })
  return value
}
it('uses complete required checks, not activity counts, and links exact assessment evidence', () => {
  const result = contributorCompliance(
    [observation(), observation()],
    [assessment()],
    false,
  )
  expect(result).toMatchObject({
    eligiblePrs: 1,
    completePrs: 1,
    passingPrs: 1,
    passRate: 100,
    coverage: 100,
    baselines: [{ firstRecordedPassRate: 100 }],
  })
  expect(result.rows[0]).toMatchObject({
    sourceSha: sha,
    assessmentId: 'assessment',
    status: 'PASS',
    requiredRules: 1,
  })
})
it('keeps never-assessed PRs unknown instead of scoring them as successful', () => {
  expect(contributorCompliance([observation()], [], false)).toMatchObject({
    passRate: null,
    coverage: 0,
    unassessedPrs: 1,
    completePrs: 0,
  })
})
it('does not carry a passing result onto a newer unassessed PR revision', () => {
  expect(
    contributorCompliance(
      [
        observation(),
        observation({ sourceSha: nextSha, observedAt: new Date('2026-10-03') }),
      ],
      [assessment()],
      false,
    ),
  ).toMatchObject({
    passRate: null,
    coverage: 0,
    stalePrs: 1,
    rows: [{ sourceSha: nextSha, status: 'STALE', assessmentId: null }],
  })
})
it('does not count incomplete successful CI or unsupported checks as policy compliance', () => {
  const a = assessment()
  a.plan.checks[0] = {
    ...a.plan.checks[0],
    operator: 'verified_check_succeeded',
    capability: 'import_only',
  }
  a.report.checks[0] = {
    ...a.report.checks[0],
    providerResult: 'SUCCEEDED',
  } as any
  a.assessmentHash = digest({
    request: a.request,
    plan: a.plan,
    report: a.report,
  })
  expect(contributorCompliance([observation()], [a], false)).toMatchObject({
    completePrs: 0,
    passRate: null,
    incompletePrs: 1,
  })
})
it('rejects altered assessment hashes and mismatched PR identity/head associations', () => {
  const corrupt = assessment()
  corrupt.assessmentHash = 'wrong'
  expect(
    contributorCompliance([observation()], [corrupt], false).rows[0].status,
  ).toBe('INVALID')
  const other = assessment()
  other.request.pullRequest.objectId = 'another'
  other.assessmentHash = digest({
    request: other.request,
    plan: other.plan,
    report: other.report,
  })
  expect(
    contributorCompliance([observation()], [other], false).unassessedPrs,
  ).toBe(1)
  const head = assessment()
  head.request.pullRequest.head.sha = nextSha
  head.assessmentHash = digest({
    request: head.request,
    plan: head.plan,
    report: head.report,
  })
  expect(
    contributorCompliance([observation()], [head], false).unassessedPrs,
  ).toBe(1)
})
it('keeps policies/standards versions separate and hides rates when collection is truncated', () => {
  const second = assessment({
    id: 'second',
    selectionId: 'other',
    createdAt: new Date('2026-10-04'),
  })
  second.request.pullRequest.number = 2
  second.request.pullRequest.objectId = 'pr-2'
  second.assessmentHash = digest({
    request: second.request,
    plan: second.plan,
    report: second.report,
  })
  const obs = [
    observation(),
    observation({ pullRequestNumber: 2, sourceObjectId: 'pr-2' }),
  ]
  expect(
    contributorCompliance(obs, [assessment(), second], false),
  ).toMatchObject({
    mixedBaselines: true,
    passRate: null,
    baselines: [{ passRate: 100 }, { passRate: 100 }],
  })
  const limited = contributorCompliance(obs, [assessment(), second], true)
  expect(limited.coverage).toBeNull()
  expect(limited.baselines.every((b) => b.passRate === null)).toBe(true)
})
it('marks equal-time conflicting heads unknown and isolates repositories and PR numbers', () => {
  expect(
    contributorCompliance(
      [observation(), observation({ sourceSha: nextSha })],
      [assessment()],
      false,
    ).rows[0].status,
  ).toBe('UNKNOWN')
  expect(
    contributorCompliance(
      [observation()],
      [assessment({ repositoryId: 'other' })],
      false,
    ).unassessedPrs,
  ).toBe(1)
  expect(
    contributorCompliance(
      [observation({ pullRequestNumber: null })],
      [assessment()],
      false,
    ).eligiblePrs,
  ).toBe(0)
})
it('chooses the first complete assessment and latest record deterministically, excluding missing checks', () => {
  const first = assessment({ id: 'first' })
  first.report.checks[0].coverage = 'MISSING'
  first.assessmentHash = digest({
    request: first.request,
    plan: first.plan,
    report: first.report,
  })
  const last = assessment({ id: 'last', createdAt: new Date('2026-10-03') })
  expect(
    contributorCompliance([observation()], [last, first], false),
  ).toMatchObject({
    rows: [{ assessmentId: 'last' }],
    baselines: [
      { firstEvaluated: 1, firstRecordedPassRate: 100, passRate: 100 },
    ],
  })
})
it('records approved CI failure while preserving missing required evidence separately', () => {
  const a = assessment()
  a.plan.checks[0] = {
    id: 'ci',
    required: true,
    operator: 'verified_check_succeeded',
    capability: 'import_only',
    allowedSources: ['verified_imported_ci'],
  } as any
  a.report.checks[0] = {
    ruleId: 'ci',
    required: true,
    providerResult: 'FAILED',
    mappingTrust: 'APPROVED_SOURCE_BINDING',
    freshness: 'FRESH_AT_COLLECTION',
    ambiguous: false,
    superseded: false,
    deliveryId: 'delivery',
    evidenceValidation: {
      version: 2,
      observationIntegrity: true,
      sourceApproved: true,
    },
  } as any
  ;(a.report as any).observations = [
    {
      deliveryId: 'delivery',
      sourceSha: sha,
      result: 'FAILED',
      sourceStatus: 'completed',
      sourceKind: 'check_run',
    },
  ]
  a.assessmentHash = digest({
    request: a.request,
    plan: a.plan,
    report: a.report,
  })
  expect(contributorCompliance([observation()], [a], false)).toMatchObject({
    blockedPrs: 1,
    completePrs: 1,
    passRate: 0,
    rows: [{ status: 'BLOCK' }],
  })
  const missing = assessment().plan.checks[0]
  a.plan.checks.push({ ...missing, id: 'missing' })
  a.report.checks.push({
    ...assessment().report.checks[0],
    ruleId: 'missing',
    coverage: 'MISSING',
  })
  a.assessmentHash = digest({
    request: a.request,
    plan: a.plan,
    report: a.report,
  })
  expect(contributorCompliance([observation()], [a], false)).toMatchObject({
    blockedPrs: 1,
    incompletePrs: 1,
    completePrs: 0,
    passRate: null,
    rows: [{ status: 'BLOCK_INCOMPLETE' }],
  })
})
