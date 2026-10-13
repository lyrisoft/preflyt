import { digest } from '../assessments/assessment-digest.js'
import { nativeRuntimeApproval } from './native-runtime.js'
import {
  nativeAdapters,
  nativeToolReviews,
  type NativeRuleId,
} from './native-plan.js'
import type { NativeReceiptExpected } from './native-receipt.js'
/** Current deployment review and fixed tool contracts are checked before source materialization. */
export function nativeAdmission(input: NativeReceiptExpected) {
  if (
    !input ||
    Object.keys(input).sort().join(',') !==
      'approvalHash,attemptId,organizationId,plan,planHash,repositoryId,requestId,ruleIds,selectionId,sourceHash,sourceSha' ||
    Buffer.byteLength(JSON.stringify(input)) > 60000
  )
    throw new Error('Invalid native admission inputs')
  const reviewed = nativeRuntimeApproval(),
    tools = nativeToolReviews()
  if (
    !reviewed ||
    !tools ||
    input.approvalHash !== reviewed.approvalHash ||
    !reviewed.approval.organizationIds.includes(input.organizationId) ||
    !/^[a-f0-9-]{36}$/.test(input.requestId) ||
    !/^[a-f0-9-]{36}$/.test(input.attemptId) ||
    !/^[1-9]\d{0,15}$/.test(input.repositoryId) ||
    !/^[a-f0-9]{40}$/.test(input.sourceSha) ||
    !/^[a-f0-9]{64}$/.test(input.sourceHash) ||
    !/^[a-f0-9]{64}$/.test(input.planHash) ||
    !Array.isArray(input.ruleIds) ||
    !input.ruleIds.length ||
    input.ruleIds.length > 16 ||
    new Set(input.ruleIds).size !== input.ruleIds.length
  )
    throw new Error('Native admission unavailable')
  const plan = input.plan as any
  if (
    !plan ||
    digest(plan) !== input.planHash ||
    plan.version !== 1 ||
    plan.organizationId !== input.organizationId ||
    plan.repositoryId !== input.repositoryId ||
    plan.sourceSha !== input.sourceSha ||
    plan.selectionId !== input.selectionId ||
    plan.toolReviewHash !== tools.reviewHash ||
    !Array.isArray(plan.steps) ||
    ('toolReviewHash' in reviewed.approval &&
      reviewed.approval.toolReviewHash !== tools.reviewHash)
  )
    throw new Error('Native plan changed')
  const rules = input.ruleIds.map((id) => {
    const adapter = nativeAdapters[id as NativeRuleId],
      tool = tools.reviews.find((t) => t.ruleId === id)
    const step = plan.steps.find((s: any) => s.ruleId === id)
    if (
      !adapter ||
      !tool ||
      !step ||
      step.adapterId !== adapter.id ||
      step.image !== tool.image ||
      step.configHash !== tool.configHash ||
      step.toolVersion !== tool.toolVersion ||
      step.reviewDigest !== tool.reviewDigest ||
      step.reviewExpiresAt !== tool.expiresAt ||
      digest(step.command) !== digest(adapter.command) ||
      digest(step.args) !== digest(adapter.args)
    )
      throw new Error('Native tool changed')
    return id as NativeRuleId
  })
  return { reviewed, tools, rules }
}
