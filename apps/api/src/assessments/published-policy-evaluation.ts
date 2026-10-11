import {
  latestNativeEvidence,
  verifiedNativeEvidence,
  type NativeEvidenceRecord,
} from '../execution/native-evidence.js'
import { ConflictException } from '@nestjs/common'
import { digest } from './assessment-digest.js'
import { previewGate } from './gate-preview.js'
import { reportProofPolicy } from '../github-events/ci-attestation-policy.js'
import { executionContracts } from './execution-contract.js'
export function evaluatePublishedPolicy(
  snapshot: Parameters<typeof previewGate>[0],
  policy: {
    id: string
    state: string
    definitionHash: string
    definition: unknown
    selectionId: string
  },
  branchRef: string,
  liveRuns: Record<
    string,
    {
      sourceSha: string
      runAttempt: number
      status: string
      conclusion: string
      workflowId: string
    }
  >,
  now = new Date(),
  nativeEvidence: NativeEvidenceRecord[] = [],
) {
  const request = snapshot.request as any,
    plan = snapshot.plan as any,
    report = snapshot.report as any,
    definition = policy.definition as any
  if (
    policy.state !== 'PUBLISHED' ||
    digest(policy.definition) !== policy.definitionHash ||
    definition.branchRef !== branchRef ||
    definition.selectionId !== request.selectionId ||
    policy.selectionId !== request.selectionId ||
    digest({ request, plan, report }) !== snapshot.assessmentHash
  )
    throw new ConflictException(
      'The published policy, branch or assessment changed. Review a current policy and assessment.',
    )
  if (
    !Array.isArray(definition.rules) ||
    !definition.rules.length ||
    !Array.isArray(plan.checks) ||
    definition.rules.length !== plan.checks.length ||
    new Set(definition.rules.map((r: any) => r?.id)).size !==
      definition.rules.length ||
    definition.rules.some(
      (r: any) =>
        !r ||
        typeof r.required !== 'boolean' ||
        !Number.isFinite(r.maxAgeHours) ||
        r.maxAgeHours <= 0 ||
        !plan.checks.some(
          (c: any) =>
            c.id === r.id &&
            c.operator === r.operator &&
            c.version === r.version,
        ),
    )
  )
    throw new ConflictException(
      'The assessment does not cover the published policy requirements',
    )
  const adjusted = {
    ...snapshot,
    plan: {
      ...plan,
      checks: plan.checks.map((r: any) => ({
        ...r,
        required: definition.rules.find((c: any) => c.id === r.id).required,
      })),
    },
    report: {
      ...report,
      checks: report.checks.map((r: any) => ({
        ...r,
        required: definition.rules.find((c: any) => c.id === r.ruleId)
          ?.required,
      })),
    },
  }
  const base = previewGate(adjusted)
  const contracts = executionContracts()
  const currentAttestationPolicy = reportProofPolicy()
  const rules = base.rules.map((rule: any) => {
    const requirement = definition.rules.find((r: any) => r.id === rule.ruleId)
    const check = report.checks.find((r: any) => r.ruleId === rule.ruleId)
    if (check?.evidenceSource === 'NATIVE') {
      const frozen = latestNativeEvidence(
        report.nativeExecutions ?? [],
        rule.ruleId,
      )
      const live = latestNativeEvidence(nativeEvidence, rule.ruleId)
      const bound =
        frozen &&
        live &&
        frozen.id === check.nativeRequestId &&
        live.id === frozen.id &&
        frozen.receiptHash === live.receiptHash &&
        check.nativeReceiptHash === live.receiptHash &&
        live.organizationId === request.organization &&
        live.repositoryGithubId === request.repositoryId &&
        live.sourceSha === snapshot.sourceSha &&
        live.selectionId === request.selectionId
      const receipt = bound ? verifiedNativeEvidence(live, now.getTime()) : null
      const outcome = receipt?.checks.find((c) => c.ruleId === rule.ruleId)
      const age = receipt
        ? (now.getTime() - Date.parse(receipt.finishedAt)) / 3600000
        : NaN
      const trusted =
        base.reasons.length === 0 &&
        request.sourceSha === snapshot.sourceSha &&
        plan.sourceSha === snapshot.sourceSha &&
        report.sourceSha === snapshot.sourceSha &&
        requirement.operator === 'verified_check_succeeded' &&
        requirement.allowedSources?.includes('approved_sandbox') &&
        outcome &&
        !receipt!.cancelled &&
        outcome.cleanupConfirmed &&
        Number.isFinite(age) &&
        age >= 0 &&
        age <= requirement.maxAgeHours
      if (trusted && outcome.state === 'FAIL')
        return { ...rule, status: 'BLOCK', reasons: ['NATIVE_CHECK_FAILED'] }
      if (
        trusted &&
        outcome.state === 'PASS' &&
        outcome.coverage === 'FULL_RULE'
      )
        return { ...rule, status: 'PASS', reasons: [] }
      return {
        ...rule,
        status: 'INCOMPLETE',
        reasons: ['CURRENT_NATIVE_EXECUTION_NOT_VERIFIED'],
      }
    }
    const observation = report.observations?.find(
      (o: any) => o.deliveryId === check?.deliveryId,
    )
    const run = observation && liveRuns[observation.sourceObjectId]
    const age =
      (now.getTime() - Date.parse(observation?.sourceUpdatedAt ?? '')) / 3600000
    const live =
      !!run &&
      run.sourceSha === snapshot.sourceSha &&
      run.runAttempt === observation?.sourceIdentity?.runAttempt &&
      run.workflowId === observation?.sourceIdentity?.workflowId &&
      run.status === 'completed' &&
      run.conclusion === observation.sourceConclusion &&
      Number.isFinite(age) &&
      age >= 0 &&
      age <= requirement.maxAgeHours
    if (requirement.operator === 'configuration_hint_present') {
      const profileAge =
        (now.getTime() - Date.parse(report.collectedAt ?? '')) / 3600000
      return Number.isFinite(profileAge) &&
        profileAge >= 0 &&
        profileAge <= requirement.maxAgeHours
        ? rule
        : {
            ...rule,
            status: 'INCOMPLETE',
            reasons: [...rule.reasons, 'CONFIGURATION_EVIDENCE_EXPIRED'],
          }
    }
    const validation = check?.evidenceValidation
    const githubExecution = validation?.githubExecution
    const verifiedGithubExecution = !!githubExecution &&
      githubExecution.ruleId === rule.ruleId && githubExecution.sourceSha === snapshot.sourceSha &&
      githubExecution.runId === observation?.sourceObjectId && githubExecution.runAttempt === run?.runAttempt &&
      githubExecution.workflowId === run?.workflowId && githubExecution.policyId === policy.id &&
      githubExecution.policyHash === policy.definitionHash
    const signedExecution = !!contracts && definition.executionContractDigest === contracts.digest &&
      validation?.executionContractDigest === contracts.digest && !!currentAttestationPolicy &&
      validation.reports?.length === 1 && validation.reports[0].provenance?.policyDigest === currentAttestationPolicy.digest &&
      validation.reports[0].provenance?.runId === observation?.sourceObjectId &&
      validation.reports[0].provenance?.runAttempt === run?.runAttempt
    const trusted =
      base.reasons.length === 0 &&
      report.version === 1 &&
      plan.version === 1 &&
      request.sourceSha === snapshot.sourceSha &&
      plan.sourceSha === snapshot.sourceSha &&
      report.sourceSha === snapshot.sourceSha &&
      live &&
      (verifiedGithubExecution || signedExecution) &&
      validation.trustedExecuted === true &&
      validation.status === 'VERIFIED' &&
      validation.observationIntegrity === true &&
      validation.sourceApproved === true &&
      check.mappingTrust === 'APPROVED_SOURCE_BINDING' &&
      !check.ambiguous &&
      !check.superseded &&
      check.providerResult === 'SUCCEEDED' &&
      observation.sourceKind === 'workflow_run' &&
      run.conclusion === 'success' &&
      report.collectionTruncated === false &&
      report.validationCollectionTruncated === false
    if (trusted) return { ...rule, status: 'PASS', reasons: [] }
    return {
      ...rule,
      status: live && rule.status === 'BLOCK' ? 'BLOCK' : 'INCOMPLETE',
      reasons: [
        ...new Set([
          ...rule.reasons,
          ...(!live ? ['CURRENT_CI_RUN_NOT_VERIFIED'] : []),
          ...(!verifiedGithubExecution && (!contracts ||
          definition.executionContractDigest !== contracts.digest)
            ? ['APPROVED_EXECUTION_CONTRACT_REQUIRED']
            : []),
        ]),
      ],
    }
  })
  const required = rules.filter((r: any) => r.required)
  const status = required.some((r: any) => r.status === 'BLOCK')
    ? 'BLOCK'
    : !required.length ||
        required.some((r: any) => r.status !== 'PASS') ||
        !required.some(
          (r: any) =>
            definition.rules.find((d: any) => d.id === r.ruleId).operator ===
            'verified_check_succeeded',
        )
      ? 'INCOMPLETE'
      : rules.some((r: any) => r.status !== 'PASS')
        ? 'WARN'
        : 'PASS'
  const result = {
    evaluatorVersion: 1,
    policyId: policy.id,
    policyHash: policy.definitionHash,
    sourceSha: snapshot.sourceSha,
    assessmentHash: snapshot.assessmentHash,
    status,
    rules,
    requiredRules: required.length,
    requiredRulesSatisfied: required.filter((r: any) => r.status === 'PASS')
      .length,
    requiredRulesBlocked: required.filter((r: any) => r.status === 'BLOCK')
      .length,
    requiredRulesIncomplete: required.filter(
      (r: any) => r.status === 'INCOMPLETE',
    ).length,
  }
  return { ...result, evaluationHash: digest(result) }
}
