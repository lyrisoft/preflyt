import { digest } from './assessment-digest.js'
export const GATE_PREVIEW_VERSION = 2
const record = (value: unknown): Record<string, any> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : null

// Pure historical evaluation of an integrity-checked snapshot. No current catalogue,
// clock, model or provider data can change its meaning.
export function previewGate(snapshot: {
  sourceSha: string
  assessmentHash: string
  request: unknown
  plan: unknown
  report: unknown
}) {
  const plan = record(snapshot.plan),
    report = record(snapshot.report),
    request = record(snapshot.request)
  const valid =
    !!plan &&
    !!report &&
    !!request &&
    plan.version === 1 &&
    report.version === 1 &&
    request.sourceSha === snapshot.sourceSha &&
    plan.sourceSha === snapshot.sourceSha &&
    report.sourceSha === snapshot.sourceSha &&
    ['INGEST_ONLY', 'HYBRID'].includes(plan.mode) &&
    plan.stage === 'ci' &&
    plan.enforcement === 'observe' &&
    Array.isArray(plan.checks) &&
    Array.isArray(report.checks) &&
    plan.checks.length <= 64 &&
    plan.checks.length === report.checks.length &&
    new Set(plan.checks.map((c: any) => c?.id)).size === plan.checks.length &&
    new Set(report.checks.map((c: any) => c?.ruleId)).size ===
      report.checks.length &&
    plan.checks.every(
      (c: any) =>
        record(c) &&
        typeof c.id === 'string' &&
        typeof c.required === 'boolean' &&
        report.checks.some(
          (r: any) =>
            record(r) && r.ruleId === c.id && r.required === c.required,
        ),
    )
  const collectionComplete =
    valid &&
    report.collectionTruncated === false &&
    report.validationCollectionTruncated === false
  const rules = valid
    ? plan.checks.map((definition: any) => {
        const check = report.checks.find((c: any) => c.ruleId === definition.id)
        const reasons: string[] = []
        // Negative provider evidence can fail a required CI-success condition.
        // It cannot establish tool execution/coverage or turn a success green.
        const failedObservations = Array.isArray(report.observations)
          ? report.observations.filter(
              (o: any) => record(o) && o.deliveryId === check.deliveryId,
            )
          : []
        const failedCi =
          collectionComplete &&
          definition.operator === 'verified_check_succeeded' &&
          definition.capability === 'import_only' &&
          Array.isArray(definition.allowedSources) &&
          definition.allowedSources.includes('verified_imported_ci') &&
          check.providerResult === 'FAILED' &&
          check.mappingTrust === 'APPROVED_SOURCE_BINDING' &&
          check.freshness === 'FRESH_AT_COLLECTION' &&
          check.ambiguous === false &&
          check.superseded === false &&
          check.evidenceValidation?.version === 2 &&
          check.evidenceValidation?.observationIntegrity === true &&
          check.evidenceValidation?.sourceApproved === true &&
          typeof check.deliveryId === 'string' &&
          failedObservations.length === 1 &&
          failedObservations[0].sourceSha === snapshot.sourceSha &&
          failedObservations[0].result === 'FAILED' &&
          failedObservations[0].sourceStatus === 'completed' &&
          ['check_run', 'workflow_run'].includes(failedObservations[0].sourceKind)

        if (!collectionComplete) reasons.push('COLLECTION_INCOMPLETE')
        if (
          definition.operator === 'configuration_hint_present' &&
          definition.capability === 'available'
        ) {
          if (check.coverage !== 'CONFIGURATION_OBSERVED')
            reasons.push('CONFIGURATION_NOT_ESTABLISHED')
          if (
            request.profileSnapshot?.sourceSha !== snapshot.sourceSha ||
            request.profileSnapshot?.complete !== true
          )
            reasons.push('PROFILE_NOT_COMPLETE_AT_REVISION')
          if (
            !Array.isArray(check.configurationEvidence) ||
            !check.configurationEvidence.length ||
            !check.configurationEvidence.every(
              (e: any) =>
                record(e) &&
                typeof e.path === 'string' &&
                e.path.length > 0 &&
                typeof e.blobSha === 'string' &&
                /^[a-f0-9]{40}$/.test(e.blobSha),
            )
          )
            reasons.push('CONFIGURATION_EVIDENCE_MISSING')
        } else {
          // Current imported reports do not establish tool/environment/rule coverage.
          // Even successful providers or signed report provenance cannot enable PASS.
          reasons.push(
            definition.capability === 'planned'
              ? 'RULE_ADAPTER_UNSUPPORTED'
              : 'TRUSTED_EXECUTION_NOT_ESTABLISHED',
          )
          if (Array.isArray(check.evidenceValidation?.reasons))
            reasons.push(
              ...check.evidenceValidation.reasons.filter(
                (r: unknown) => typeof r === 'string',
              ),
            )
          if (check.coverage === 'INVALID')
            reasons.push('EVIDENCE_INTEGRITY_INVALID')
          if (check.ambiguous) reasons.push('SOURCE_AMBIGUOUS')
          if (check.superseded) reasons.push('SOURCE_SUPERSEDED')
        }
        if (failedCi) reasons.push('APPROVED_CI_SOURCE_FAILED')
        return {
          ruleId: definition.id,
          title: typeof check.title === 'string' ? check.title : definition.id,
          required: definition.required,
          status: failedCi ? 'BLOCK' : reasons.length ? 'INCOMPLETE' : 'PASS',
          reasons: [...new Set(reasons)].sort(),
          deliveryId:
            typeof check.deliveryId === 'string' ? check.deliveryId : null,
        }
      })
    : []
  const required = rules.filter((r: any) => r.required)
  const incomplete = required.filter((r: any) => r.status === 'INCOMPLETE').length
  const blocked = required.filter((r: any) => r.status === 'BLOCK').length
  const reasons = !valid
    ? ['SNAPSHOT_SCHEMA_UNSUPPORTED']
    : !required.length
      ? ['NO_REQUIRED_RULES']
      : []
  const status =
    blocked
      ? 'BLOCK'
      : reasons.length || incomplete
      ? 'INCOMPLETE'
      : rules.some((r: any) => r.status !== 'PASS')
        ? 'WARN'
        : 'PASS'
  const result = {
    evaluatorVersion: GATE_PREVIEW_VERSION,
    mode: 'OBSERVE_PREVIEW',
    sourceSha: snapshot.sourceSha,
    assessmentHash: snapshot.assessmentHash,
    status,
    reasons,
    rules,
    requiredRules: required.length,
    requiredRulesSatisfied: required.length - incomplete - blocked,
    requiredRulesBlocked: blocked,
    requiredRulesIncomplete: incomplete,
    advisoryIncomplete: rules.filter(
      (r: any) => !r.required && r.status === 'INCOMPLETE',
    ).length,
    advisoryFailed: rules.filter(
      (r: any) => !r.required && r.status === 'BLOCK',
    ).length,
    publication: 'DISABLED',
    currentBranchReadiness: 'NOT_VERIFIED',
    limitations: [
      'Historical policy preview at collection; not current merge readiness.',
      'Configuration PASS means only the frozen configuration requirement is satisfied.',
      'Imported execution remains INCOMPLETE until tool, environment and rule coverage are verified.',
      'BLOCK identifies a failed approved CI source; it does not prove which tool or test failed.',
      'No GitHub check publication, merge blocking, exceptions or execution admission.',
    ],
  }
  return { ...result, evaluationHash: digest(result) }
}
