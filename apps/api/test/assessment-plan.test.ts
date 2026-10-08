import { describe, expect, it } from 'vitest'
import { catalogue } from '../src/standards/catalogue.js'
import {
  buildAssessment,
  digest,
  type Observation,
} from '../src/assessments/assessment-plan.js'
const at = new Date('2026-10-08T20:00:00Z')
const pack = catalogue.find((p) => p.id === 'baseline-engineering')!
const observation = (
  result = 'SUCCEEDED',
  updated: Date | null = new Date('2026-10-08T19:00:00Z'),
): Observation => ({
  version: 1,
  deliveryId: 'delivery-1',
  sourceSha: 'a'.repeat(40),
  sourceKind: 'check_run',
  sourceObjectId: '44',
  sourceAction: 'completed',
  sourceStatus: 'completed',
  sourceConclusion: 'success',
  result,
  sourceUpdatedAt: updated,
  observedAt: at,
  evidenceHash: 'e'.repeat(64),
  sourcePayloadHash: 'f'.repeat(64),
  artifacts: [],
})
const input = () => ({
  sourceSha: 'a'.repeat(40),
  profile: 'RECOMMENDED' as const,
  packs: [{ id: pack.id, version: pack.version, digest: pack.digest }],
  signals: [
    {
      id: 'ci',
      label: 'CI',
      state: 'detected' as const,
      observations: [],
      evidence: [
        {
          path: '.github/workflows/ci.yml',
          blobSha: 'b'.repeat(40),
          reason: 'configuration',
        },
      ],
    },
  ],
  profileCreatedAt: at,
  mappings: [{ ruleId: 'tests.required', deliveryId: 'delivery-1' }],
  observations: [observation()],
  at,
  truncated: false,
})
const mapped = (result: ReturnType<typeof buildAssessment>) =>
  result.report.checks.find((c) => c.ruleId === 'tests.required')!
describe('frozen assessment contracts', () => {
  it('freezes policy/check context and never upgrades administrator association to a passing gate', () => {
    const result = buildAssessment(input())
    expect(result.plan).toMatchObject({
      version: 1,
      mode: 'INGEST_ONLY',
      sourceSha: 'a'.repeat(40),
      enforcement: 'observe',
    })
    expect(mapped(result)).toMatchObject({
      coverage: 'UNVERIFIED',
      providerResult: 'SUCCEEDED',
      ruleOutcome: null,
      mappingTrust: 'ADMIN_ASSOCIATED_UNVERIFIED',
    })
    expect(result.report).toMatchObject({
      coverage: 'INCOMPLETE',
      qualityGate: null,
      trustedExecutedChecks: 0,
      currentBranchReadiness: 'NOT_VERIFIED',
    })
    expect(
      result.report.checks.find((c) => c.ruleId === 'ci.configured')?.coverage,
    ).toBe('CONFIGURATION_OBSERVED')
  })
  it.each([
    ['NOT_EXECUTED', 'SKIPPED'],
    ['PENDING', 'PENDING'],
    ['FAILED', 'UNVERIFIED'],
    ['UNKNOWN', 'UNVERIFIED'],
  ])(
    'keeps provider %s separate from rule coverage %s',
    (provider, coverage) => {
      expect(
        mapped(
          buildAssessment({
            ...input(),
            observations: [observation(provider)],
          }),
        ),
      ).toMatchObject({ coverage, providerResult: provider, ruleOutcome: null })
    },
  )
  it.each([
    [new Date('2026-10-07T19:00:00Z'), 'EXPIRED'],
    [new Date('2026-10-08T21:00:00Z'), 'FUTURE'],
    [null, 'UNKNOWN'],
  ])('rejects unsafe freshness %s as %s', (updated, coverage) => {
    expect(
      mapped(
        buildAssessment({
          ...input(),
          observations: [observation('SUCCEEDED', updated)],
        }),
      ).coverage,
    ).toBe(coverage)
  })
  it('shows unmapped and unsupported checks and suppresses superseded observations', () => {
    const newer = {
      ...observation('FAILED', new Date('2026-10-08T19:30:00Z')),
      deliveryId: 'delivery-2',
    }
    expect(
      mapped(
        buildAssessment({ ...input(), observations: [observation(), newer] }),
      ),
    ).toMatchObject({ coverage: 'SUPERSEDED', superseded: true })
    const empty = buildAssessment({
      ...input(),
      mappings: [],
      observations: [],
      signals: [],
      profileCreatedAt: null,
    })
    expect(mapped(empty).coverage).toBe('MISSING')
    expect(
      empty.report.checks.find((c) => c.ruleId === 'secrets.scan')?.coverage,
    ).toBe('UNSUPPORTED')
    expect(
      empty.report.checks.find((c) => c.ruleId === 'ci.configured')?.coverage,
    ).toBe('UNKNOWN')
  })
  it('marks equal-time conflicting provider results ambiguous rather than choosing a green observation', () => {
    const conflict = { ...observation('FAILED'), deliveryId: 'delivery-2' }
    expect(
      mapped(
        buildAssessment({
          ...input(),
          observations: [observation(), conflict],
        }),
      ),
    ).toMatchObject({
      coverage: 'AMBIGUOUS',
      ambiguous: true,
      ruleOutcome: null,
    })
  })
  it('fails closed on policy digest/revision mismatches and carries truncation', () => {
    expect(() =>
      buildAssessment({
        ...input(),
        packs: [{ id: pack.id, version: pack.version, digest: 'bad' }],
      }),
    ).toThrow('integrity')
    expect(() =>
      buildAssessment({
        ...input(),
        observations: [{ ...observation(), sourceSha: 'c'.repeat(40) }],
      }),
    ).toThrow('Cross-revision')
    expect(
      buildAssessment({ ...input(), truncated: true }).report
        .collectionTruncated,
    ).toBe(true)
  })
  it('reproduces digests despite PostgreSQL JSON key reordering and omits arbitrary row properties', () => {
    expect(digest({ b: 1, a: { d: 2, c: 3 } })).toBe(
      digest({ a: { c: 3, d: 2 }, b: 1 }),
    )
    const poisoned = {
      ...observation(),
      secret: 'never-copy',
      repositoryGithubId: 501n,
    }
    const result = buildAssessment({ ...input(), observations: [poisoned] })
    expect(JSON.stringify(result)).not.toContain('never-copy')
  })
})
