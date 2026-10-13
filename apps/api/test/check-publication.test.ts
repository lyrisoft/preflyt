import { expect, it } from 'vitest'
import { publicationPayload } from '../src/assessments/check-publication.js'
import { digest } from '../src/assessments/assessment-digest.js'
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

const seal = (value: ReturnType<typeof fixture>) => ({
  ...value,
  assessmentHash: digest({
    request: value.request,
    plan: value.plan,
    report: value.report,
  }),
})
it('never publishes success for a configuration-only PASS or empty policy', () => {
  const passed = publicationPayload(seal(fixture()), 'd'.repeat(64))
  expect(passed.gate.status).toBe('PASS')
  expect(passed.payload).toMatchObject({
    name: 'Preflyt / Engineering Readiness',
    head_sha: sha,
    conclusion: 'action_required',
    status: 'completed',
  })
  const empty = fixture()
  empty.plan.checks = []
  empty.report.checks = []
  expect(
    publicationPayload(seal(empty), 'd'.repeat(64)).payload.conclusion,
  ).toBe('action_required')
})
it('rejects assessment tampering instead of publishing its claimed result', () => {
  const value = seal(fixture())
  value.report.checks[0].coverage = 'UNVERIFIED'
  expect(() => publicationPayload(value, 'd'.repeat(64))).toThrow('integrity')
})

it('publishes failure only for approved required negative CI evidence', () => {
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
  const result = publicationPayload(seal(value), 'd'.repeat(64))
  expect(result.gate.status).toBe('BLOCK')
  expect(result.payload.conclusion).toBe('failure')
})
