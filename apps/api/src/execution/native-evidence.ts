import type { Prisma } from '../generated/prisma/client.js'
import { nativeAdapters } from './native-plan.js'
import { digest } from '../assessments/assessment-digest.js'
import {
  verifyNativeReceipt,
  type NativeReceiptExpected,
} from './native-receipt.js'
export type NativeEvidenceRecord = {
  id: string
  controllerJobId: string | null
  organizationId: string
  repositoryGithubId: string
  sourceSha: string
  sourceHash: string | null
  selectionId: string
  planHash: string
  plan: unknown
  ruleIds: unknown
  state: string
  runtimeApprovalHash: string | null
  receiptHash: string | null
  receiptSignature: string | null
  requestedAt: Date | string
}
export function nativeEvidenceExpected(
  record: NativeEvidenceRecord,
): NativeReceiptExpected | null {
  if (
    !record.controllerJobId ||
    !record.sourceHash ||
    !record.runtimeApprovalHash ||
    !Array.isArray(record.ruleIds) ||
    record.ruleIds.some((id) => typeof id !== 'string')
  )
    return null
  return {
    requestId: record.id,
    attemptId: record.controllerJobId,
    organizationId: record.organizationId,
    repositoryId: record.repositoryGithubId,
    sourceSha: record.sourceSha,
    sourceHash: record.sourceHash,
    selectionId: record.selectionId,
    planHash: record.planHash,
    plan: record.plan,
    ruleIds: record.ruleIds,
    approvalHash: record.runtimeApprovalHash,
  }
}
/** All states participate: a later queued, cancelled or invalid attempt supersedes older results. */
export function latestNativeEvidence(
  records: NativeEvidenceRecord[],
  ruleId: string,
) {
  return [...records]
    .filter((r) => Array.isArray(r.ruleIds) && r.ruleIds.includes(ruleId))
    .sort(
      (a, b) =>
        new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime() ||
        b.id.localeCompare(a.id),
    )[0]
}
export function verifiedNativeEvidence(
  record: NativeEvidenceRecord,
  now = Date.now(),
) {
  const expected = nativeEvidenceExpected(record)
  if (
    !expected ||
    !['SUCCEEDED', 'FAILED', 'BLOCKED'].includes(record.state) ||
    !record.receiptSignature ||
    digest(record.receiptSignature) !== record.receiptHash
  )
    return null
  const receipt = verifyNativeReceipt(record.receiptSignature, expected, now)
  return receipt &&
    !receipt.cancelled &&
    receipt.checks.every((c) => c.cleanupConfirmed)
    ? receipt
    : null
}
/** Freeze only receipt-bearing attempts; source code, tool logs and report text never enter an assessment. */
export function freezeNativeEvidence(
  record: NativeEvidenceRecord,
): NativeEvidenceRecord {
  return {
    id: record.id,
    controllerJobId: record.controllerJobId,
    organizationId: record.organizationId,
    repositoryGithubId: record.repositoryGithubId,
    sourceSha: record.sourceSha,
    sourceHash: record.sourceHash,
    selectionId: record.selectionId,
    planHash: record.planHash,
    plan: record.plan,
    ruleIds: record.ruleIds,
    state: record.state,
    runtimeApprovalHash: record.runtimeApprovalHash,
    receiptHash: record.receiptHash,
    receiptSignature: record.receiptSignature,
    requestedAt: new Date(record.requestedAt).toISOString(),
  }
}

/** One newest attempt per fixed adapter, including uncompleted attempts; no arbitrary history window. */
export async function readLatestNativeEvidence(
  client: Pick<Prisma.TransactionClient, 'nativeExecutionRequest'>,
  where: Prisma.NativeExecutionRequestWhereInput,
) {
  const rows = await Promise.all(
    Object.keys(nativeAdapters).map((ruleId) =>
      client.nativeExecutionRequest.findFirst({
        where: { ...where, ruleIds: { array_contains: [ruleId] } },
        orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
      }),
    ),
  )
  return [
    ...new Map(
      rows.filter((row) => row !== null).map((row) => [row.id, row]),
    ).values(),
  ]
}
