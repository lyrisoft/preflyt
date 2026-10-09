import { ConflictException } from '@nestjs/common'
import { digest } from './assessment-digest.js'
import type { evaluatePublishedPolicy } from './published-policy-evaluation.js'
import { previewGate } from './gate-preview.js'
import { readinessCheck } from '../github/ruleset-draft.js'
/** Historical observe assessments cannot authorize a successful required check. */
export function publicationPayload(
  snapshot: Parameters<typeof previewGate>[0],
  externalId: string,
  policyEvaluation?: ReturnType<typeof evaluatePublishedPolicy>,
) {
  if (
    digest({
      request: snapshot.request,
      plan: snapshot.plan,
      report: snapshot.report,
    }) !== snapshot.assessmentHash
  )
    throw new ConflictException('Assessment integrity check failed')
  if (
    policyEvaluation &&
    (policyEvaluation.sourceSha !== snapshot.sourceSha ||
      policyEvaluation.assessmentHash !== snapshot.assessmentHash)
  )
    throw new ConflictException(
      'Policy evaluation does not match this assessment',
    )
  const gate = policyEvaluation ?? previewGate(snapshot)
  const conclusion =
    policyEvaluation?.status === 'PASS'
      ? ('success' as const)
      : gate.status === 'BLOCK'
        ? ('failure' as const)
        : ('action_required' as const)
  const summary = [
    `Saved assessment: ${snapshot.assessmentHash}`,
    `Observed result: ${gate.status}. Required controls: ${gate.requiredRulesSatisfied}/${gate.requiredRules} satisfied; ${gate.requiredRulesBlocked} failed; ${gate.requiredRulesIncomplete} incomplete.`,
    policyEvaluation
      ? `Published policy: ${policyEvaluation.policyId}; policy hash: ${policyEvaluation.policyHash}; evaluation: ${policyEvaluation.evaluationHash}. Approved attested workflow reports and live run identity are required for passing execution evidence.`
      : 'This is a historical observe assessment, not verified merge readiness. A successful CI result or configuration inspection alone cannot make this check pass.',
    ...gate.rules
      .filter((rule: { status: string }) => rule.status !== 'PASS')
      .slice(0, 64)
      .map(
        (rule: { ruleId: string; status: string; reasons: string[] }) =>
          `${rule.ruleId}: ${rule.status} (${rule.reasons.join(', ')})`,
      ),
  ].join('\n\n')
  return {
    gate,
    payload: {
      name: readinessCheck,
      head_sha: snapshot.sourceSha,
      external_id: externalId,
      status: 'completed' as const,
      conclusion,
      output: {
        title:
          conclusion === 'success'
            ? 'Published engineering policy requirements met'
            : conclusion === 'failure'
              ? 'Required CI source failed'
              : 'Engineering readiness needs verification',
        summary,
      },
    },
  }
}
