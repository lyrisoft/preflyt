import {
  validateRuleEvidence,
  type ObservationValidation,
  VALIDATOR_VERSION,
  MAX_VALIDATION_ARTIFACTS,
} from './evidence-validation.js'
import { runAttempt } from './ci-binding.js'
import {
  posture,
  resolvePacks,
  type AdoptionProfile,
  type PackRef,
} from '../standards/catalogue.js'
import type { ProfileSignal } from '../github/repository-profile.js'
export { digest } from './assessment-digest.js'
export type Mapping = {
  ruleId: string
  deliveryId: string
  bindingApproved?: boolean
}
export type Observation = {
  sourceIdentity?: unknown
  version: number
  deliveryId: string
  sourceSha: string
  sourceKind: string
  sourceObjectId: string
  sourceAction: string
  sourceStatus: string | null
  sourceConclusion: string | null
  result: string
  sourceUpdatedAt: Date | null
  observedAt: Date
  evidenceHash: string
  sourcePayloadHash: string
  artifacts: {
    id: string
    format: string
    sha256: string
    parserVersion: number
    verification: string
    summary: unknown
    createdAt: Date
  }[]
}
export function buildAssessment(input: {
  sourceSha: string
  profile: AdoptionProfile
  packs: (PackRef & { digest: string })[]
  signals: ProfileSignal[]
  profileCreatedAt: Date | null
  mappings: Mapping[]
  observations: Observation[]
  at: Date
  truncated: boolean
  ambiguousRules?: string[]
  validations?: Map<string, ObservationValidation>
  validationCollectionTruncated?: boolean
}) {
  if (input.observations.some((row) => row.sourceSha !== input.sourceSha))
    throw new Error('Cross-revision evidence')
  const packs = resolvePacks(input.packs)
  if (
    packs.some(
      (pack, index) => !pack || pack.digest !== input.packs[index].digest,
    )
  )
    throw new Error('Selected pack integrity mismatch')
  const controls = posture(input.packs, input.profile, input.signals).sort(
    (a, b) => (a.id < b.id ? -1 : 1),
  )
  const plan = {
    version: 1,
    mode: 'INGEST_ONLY',
    stage: 'ci',
    sourceSha: input.sourceSha,
    adoptionProfile: input.profile,
    packs,
    checks: controls.map((control) => ({
      ...control,
      configuration: undefined,
      evidence: undefined,
      reason: undefined,
      assessmentResult: undefined,
      applicabilityReason:
        'Selected repository pack; changed-path and PR applicability are not evaluated in this commit slice.',
    })),
    evidenceValidatorVersion: VALIDATOR_VERSION,
    limits: {
      observations: 100,
      maxAgeHoursPerRule: true,
      validationArtifacts: MAX_VALIDATION_ARTIFACTS,
    },
    enforcement: 'observe',
  }
  const observed = input.observations.map((row) => ({
    version: row.version,
    provenance: 'github_signed_webhook',
    sourceIdentity: row.sourceIdentity ?? null,
    toolVersion: null,
    executionEnvironment: null,
    deliveryId: row.deliveryId,
    sourceSha: row.sourceSha,
    sourceKind: row.sourceKind,
    sourceObjectId: row.sourceObjectId,
    sourceAction: row.sourceAction,
    sourceStatus: row.sourceStatus,
    sourceConclusion: row.sourceConclusion,
    result: row.result,
    evidenceHash: row.evidenceHash,
    sourcePayloadHash: row.sourcePayloadHash,
    sourceUpdatedAt: row.sourceUpdatedAt?.toISOString() ?? null,
    observedAt: row.observedAt.toISOString(),
    artifacts: row.artifacts.map((artifact) => ({
      id: artifact.id,
      format: artifact.format,
      sha256: artifact.sha256,
      parserVersion: artifact.parserVersion,
      verification: artifact.verification,
      summary: Object.fromEntries(
        Object.entries(
          (artifact.summary ?? {}) as Record<string, unknown>,
        ).filter(([key, value]) =>
          [
            'tests',
            'failures',
            'errors',
            'skipped',
            'passed',
            'suites',
            'runs',
            'results',
            'error',
            'warning',
            'note',
            'none',
            'unknown',
            'suppressed',
          ].includes(key)
            ? typeof value === 'number' &&
              Number.isSafeInteger(value) &&
              value >= 0
            : key === 'partial'
              ? typeof value === 'boolean'
              : key === 'execution' &&
                ['UNKNOWN', 'REPORTED_SUCCESS', 'REPORTED_FAILURE'].includes(
                  String(value),
                ),
        ),
      ),
      createdAt: artifact.createdAt.toISOString(),
    })),
  }))
  const checks = controls.map((control) => {
    const mapping = input.mappings.find((m) => m.ruleId === control.id)
    const evidence = mapping
      ? input.observations.find((row) => row.deliveryId === mapping.deliveryId)
      : undefined
    const clock = evidence?.sourceUpdatedAt ?? null
    const age = clock ? (input.at.getTime() - clock.getTime()) / 3600000 : null
    const freshness = !clock
      ? 'UNKNOWN'
      : age! < 0
        ? 'FUTURE'
        : age! > control.maxAgeHours
          ? 'EXPIRED'
          : 'FRESH_AT_COLLECTION'
    const superseded = evidence
      ? input.observations.some(
          (row) =>
            row.sourceKind === evidence.sourceKind &&
            row.sourceObjectId === evidence.sourceObjectId &&
            row.deliveryId !== evidence.deliveryId &&
            (runAttempt(row.sourceIdentity) !==
            runAttempt(evidence.sourceIdentity)
              ? runAttempt(row.sourceIdentity) >
                runAttempt(evidence.sourceIdentity)
              : row.sourceUpdatedAt && clock
                ? row.sourceUpdatedAt.getTime() > clock.getTime()
                : row.observedAt.getTime() > evidence.observedAt.getTime()),
        )
      : false
    const ambiguous = evidence
      ? input.observations.some(
          (row) =>
            row.sourceKind === evidence.sourceKind &&
            row.sourceObjectId === evidence.sourceObjectId &&
            row.deliveryId !== evidence.deliveryId &&
            row.result !== evidence.result &&
            runAttempt(row.sourceIdentity) ===
              runAttempt(evidence.sourceIdentity) &&
            (!row.sourceUpdatedAt ||
              !clock ||
              row.sourceUpdatedAt.getTime() === clock.getTime()),
        )
      : false
    let coverage = control.capability === 'planned' ? 'UNSUPPORTED' : 'MISSING'
    if (control.operator === 'configuration_hint_present') {
      const profileAge = input.profileCreatedAt
        ? (input.at.getTime() - input.profileCreatedAt.getTime()) / 3600000
        : null
      coverage =
        profileAge === null || control.configuration === 'UNKNOWN'
          ? 'UNKNOWN'
          : profileAge < 0
            ? 'FUTURE'
            : profileAge > control.maxAgeHours
              ? 'EXPIRED'
              : control.configuration === 'HINT_DETECTED'
                ? 'CONFIGURATION_OBSERVED'
                : 'MISSING'
    } else if (evidence && control.capability !== 'planned') {
      coverage = ambiguous
        ? 'AMBIGUOUS'
        : superseded
          ? 'SUPERSEDED'
          : freshness === 'EXPIRED'
            ? 'EXPIRED'
            : freshness === 'FUTURE'
              ? 'FUTURE'
              : freshness === 'UNKNOWN'
                ? 'UNKNOWN'
                : evidence.result === 'NOT_EXECUTED'
                  ? 'SKIPPED'
                  : evidence.result === 'PENDING'
                    ? 'PENDING'
                    : 'UNVERIFIED'
    }
    const evidenceValidation =
      control.capability === 'import_only'
        ? validateRuleEvidence(
            control.id,
            mapping?.bindingApproved === true,
            evidence ? input.validations?.get(evidence.deliveryId) : undefined,
            evidence ? freshness : 'NOT_APPLICABLE',
            evidence?.result ?? null,
            ambiguous || !!input.ambiguousRules?.includes(control.id),
            superseded,
            input.validationCollectionTruncated ?? false,
          )
        : null
    return {
      ruleId: control.id,
      title: control.title,
      required: control.required,
      capability: control.capability,
      coverage:
        evidenceValidation?.status === 'INVALID'
          ? 'INVALID'
          : input.ambiguousRules?.includes(control.id)
            ? 'AMBIGUOUS'
            : coverage,
      evidenceValidation,
      ruleOutcome: null,
      deliveryId: mapping?.deliveryId ?? null,
      providerResult: evidence?.result ?? null,
      mappingTrust: mapping
        ? mapping.bindingApproved
          ? 'APPROVED_SOURCE_BINDING'
          : 'ADMIN_ASSOCIATED_UNVERIFIED'
        : null,
      freshness: mapping ? freshness : 'NOT_APPLICABLE',
      ageHoursAtCollection: age === null ? null : Math.round(age * 100) / 100,
      superseded,
      ambiguous: ambiguous || !!input.ambiguousRules?.includes(control.id),
      configurationEvidence: control.evidence,
      reason:
        evidenceValidation?.status === 'INVALID'
          ? 'Evidence integrity validation failed; inspect validation reasons.'
          : input.ambiguousRules?.includes(control.id)
            ? 'CI source is ambiguous or the observation collection is incomplete.'
            : coverage === 'CONFIGURATION_OBSERVED'
              ? 'Exact-revision configuration hint only; execution is not established.'
              : control.capability === 'planned'
                ? 'Check adapter is not implemented; an association cannot enable it.'
                : !mapping && control.operator !== 'configuration_hint_present'
                  ? 'No CI observation associated with this rule.'
                  : 'Imported result/association does not prove trusted rule coverage.',
    }
  })
  const required = checks.filter((check) => check.required)
  return {
    plan,
    report: {
      version: 1,
      sourceSha: input.sourceSha,
      collectedAt: input.at.toISOString(),
      checks,
      observations: observed,
      coverage: required.length ? 'INCOMPLETE' : 'NOT_EVALUATED',
      qualityGate: null,
      requiredChecks: required.length,
      requiredConfigurationObserved: required.filter(
        (c) => c.coverage === 'CONFIGURATION_OBSERVED',
      ).length,
      trustedExecutedChecks: 0,
      collectionTruncated: input.truncated,
      validationCollectionTruncated:
        input.validationCollectionTruncated ?? false,
      currentBranchReadiness: 'NOT_VERIFIED',
      limitations: [
        'Manual CI-to-rule associations are unverified coverage.',
        'No gate evaluation, repository execution or GitHub status publication.',
        'Historical exact-SHA snapshot; later evidence needs a new assessment.',
      ],
    },
  }
}
