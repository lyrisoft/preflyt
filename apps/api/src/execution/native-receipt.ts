import { validFileAnalysis, fileAnalysisRules, type FileAnalysis } from '../health/health-file-analysis.js'
import { validDuplicationMeasurement, validCoverageMeasurement, type HealthMeasurement } from '../health/health-measurements.js'
import { validHealthFindings } from '../health/health-findings.js'
import type { ReportFinding } from '../findings/normalize-report-findings.js'
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { digest } from '../assessments/assessment-digest.js'
import {
  nativeAdapters,
  nativeToolReviews,
  type NativeRuleId,
} from './native-plan.js'
import { nativeRuntimeApproval } from './native-runtime.js'
import type { NativeCheckOutcome } from './native-result.js'

const receiptType = 'preflyt.native-execution.v1'
const hex = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
const sameKeys = (value: object, keys: string[]) =>
  Object.keys(value).sort().join(',') === [...keys].sort().join(',')
export type NativeReceiptScope = {
  requestId: string
  attemptId: string
  organizationId: string
  repositoryId: string
  sourceSha: string
  sourceHash: string
  selectionId: string
  planHash: string
}
export type NativeReceiptCheck = NativeCheckOutcome & {
  adapterId: string
  image: string
  toolVersion: string
  configHash: string
  commandHash: string
  exitCode: number | null
  cleanupConfirmed: boolean
  coverage: 'FULL_RULE' | 'PARTIAL'
  findings?: ReportFinding[]
  fileAnalysis?: FileAnalysis
  measurement?: HealthMeasurement
}
export type NativeReceipt = NativeReceiptScope & {
  version: 1
  approvalHash: string
  environmentId: string
  controlsHash: string
  toolReviewHash: string
  startedAt: string
  finishedAt: string
  cancelled: boolean
  checks: NativeReceiptCheck[]
}
export type NativeReceiptExpected = NativeReceiptScope & {
  approvalHash: string
  ruleIds: string[]
  plan: unknown
}
const counters = new Set([
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
])
/** Counters only; health findings use a separate bounded, redacted projection. Never sign source or logs. */
export function nativeReceiptSummary(value: Record<string, unknown> | null) {
  if (!value) return null
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, count]) =>
        counters.has(key) && Number.isSafeInteger(count) && Number(count) >= 0,
    ),
  )
}
export function signNativeReceipt(
  value: NativeReceipt,
  privateKey: string,
  publicKey: string,
) {
  const key = createPrivateKey(privateKey)
  if (
    key.asymmetricKeyType !== 'ed25519' ||
    !createPublicKey(key)
      .export({ type: 'spki', format: 'der' })
      .equals(
        createPublicKey(publicKey).export({ type: 'spki', format: 'der' }),
      )
  )
    throw new Error('Controller signing identity changed')
  const header = Buffer.from(
    JSON.stringify({ alg: 'EdDSA', typ: receiptType }),
  ).toString('base64url')
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url')
  if (payload.length > 40000) throw new Error('Native receipt exceeds bounds')
  const input = header + '.' + payload
  return input + '.' + sign(null, Buffer.from(input), key).toString('base64url')
}
/** Verify current approval, exact admission inputs and reviewed fixed adapters on every use. */
export function verifyNativeReceipt(
  token: unknown,
  expected: NativeReceiptExpected,
  now = Date.now(),
): NativeReceipt | null {
  try {
    const reviewed = nativeRuntimeApproval(),
      tools = nativeToolReviews(undefined, now)
    if (
      !reviewed ||
      !tools ||
      typeof token !== 'string' ||
      token.length > 41000 ||
      expected.approvalHash !== reviewed.approvalHash ||
      !reviewed.approval.organizationIds.includes(expected.organizationId)
    )
      return null
    const parts = token.split('.')
    if (
      parts.length !== 3 ||
      parts.some((p) => !p || !/^[A-Za-z0-9_-]+$/.test(p))
    )
      return null
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString())
    if (
      !sameKeys(header, ['alg', 'typ']) ||
      header.alg !== 'EdDSA' ||
      header.typ !== receiptType ||
      !verify(
        null,
        Buffer.from(parts[0] + '.' + parts[1]),
        createPublicKey(reviewed.approval.controllerPublicKey),
        Buffer.from(parts[2], 'base64url'),
      )
    )
      return null
    const value = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString(),
    ) as NativeReceipt
    const scopeKeys = [
      'requestId',
      'attemptId',
      'organizationId',
      'repositoryId',
      'sourceSha',
      'sourceHash',
      'selectionId',
      'planHash',
    ] as const
    if (
      !sameKeys(value, [
        ...scopeKeys,
        'version',
        'approvalHash',
        'environmentId',
        'controlsHash',
        'toolReviewHash',
        'startedAt',
        'finishedAt',
        'cancelled',
        'checks',
      ]) ||
      value.version !== 1 ||
      scopeKeys.some((key) => value[key] !== expected[key]) ||
      value.approvalHash !== reviewed.approvalHash ||
      value.environmentId !== reviewed.approval.environmentId ||
      value.controlsHash !== reviewed.approval.controlsHash ||
      value.toolReviewHash !== tools.reviewHash ||
      !/^[a-f0-9-]{36}$/.test(value.requestId) ||
      !/^[a-f0-9-]{36}$/.test(value.attemptId) ||
      !/^[a-f0-9]{40}$/.test(value.sourceSha) ||
      ![value.sourceHash, value.planHash].every(hex) ||
      typeof value.cancelled !== 'boolean'
    )
      return null
    if (
      'toolReviewHash' in reviewed.approval &&
      reviewed.approval.toolReviewHash !== tools.reviewHash
    )
      return null
    const plan = expected.plan as Record<string, any>
    if (
      !plan ||
      digest(plan) !== expected.planHash ||
      plan.version !== 1 ||
      plan.organizationId !== value.organizationId ||
      plan.repositoryId !== value.repositoryId ||
      plan.sourceSha !== value.sourceSha ||
      plan.selectionId !== value.selectionId ||
      plan.toolReviewHash !== tools.reviewHash ||
      !Array.isArray(plan.steps)
    )
      return null
    const start = Date.parse(value.startedAt),
      end = Date.parse(value.finishedAt)
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < Date.parse(reviewed.approval.approvedAt) ||
      end < start ||
      end > now + 5000 ||
      end >= Date.parse(reviewed.approval.expiresAt) ||
      end - start > 16 * 310000 ||
      !Array.isArray(value.checks) ||
      !value.checks.length ||
      value.checks.length > 16 ||
      !Array.isArray(expected.ruleIds) ||
      new Set(expected.ruleIds).size !== expected.ruleIds.length ||
      value.checks.length !== expected.ruleIds.length ||
      new Set(value.checks.map((c) => c.ruleId)).size !== value.checks.length
    )
      return null
    for (const check of value.checks) {
      const adapter = nativeAdapters[check.ruleId as NativeRuleId],
        tool = tools.reviews.find((t) => t.ruleId === check.ruleId)
      const step = plan.steps.find((s: any) => s.ruleId === check.ruleId)
      if (
        !sameKeys(check, [
          'ruleId',
          'state',
          'reason',
          'reportHash',
          'summary',
          'adapterId',
          'image',
          'toolVersion',
          'configHash',
          'commandHash',
          'exitCode',
          'cleanupConfirmed',
          'coverage',
          ...('findings' in check ? ['findings'] : []),
          ...('measurement' in check ? ['measurement'] : []),
          ...('fileAnalysis' in check ? ['fileAnalysis'] : []),
        ]) ||
        ('fileAnalysis' in check && (!value.selectionId.startsWith('health:') || !fileAnalysisRules.includes(check.ruleId) || !validFileAnalysis(check.fileAnalysis))) ||
        ('measurement' in check && (!value.selectionId.startsWith('health:') || !(check.ruleId === 'quality.duplication' ? validDuplicationMeasurement(check.measurement) : check.ruleId === 'tests.coverage' ? validCoverageMeasurement(check.measurement) : false))) ||
        ('findings' in check && (!value.selectionId.startsWith('health:') || !validHealthFindings(check.findings) || check.findings.some((finding: { category: string }) => finding.category !== (check.ruleId === 'quality.reliability' ? 'reliability' : check.ruleId === 'quality.maintainability' ? 'maintainability' : check.ruleId === 'quality.duplication' ? 'duplication' : check.ruleId === 'security.hotspots' ? 'hotspot' : 'security')))) ||
        !adapter ||
        !tool ||
        !step ||
        !expected.ruleIds.includes(check.ruleId) ||
        check.adapterId !== adapter.id ||
        check.image !== tool.image ||
        check.toolVersion !== tool.toolVersion ||
        check.configHash !== tool.configHash ||
        check.commandHash !== digest(adapter) ||
        step.adapterId !== adapter.id ||
        step.image !== tool.image ||
        step.configHash !== tool.configHash ||
        step.toolVersion !== tool.toolVersion ||
        digest(step.command) !== digest(adapter.command) ||
        digest(step.args) !== digest(adapter.args) ||
        !['PASS', 'FAIL', 'INCOMPLETE'].includes(check.state) ||
        (check.state === 'PASS' && check.reason !== 'CHECKS_PASSED') ||
        (check.state === 'FAIL' &&
          !['CHECK_FAILED', 'FINDINGS_REPORTED'].includes(check.reason)) ||
        typeof check.reason !== 'string' ||
        !/^[A-Z_]{1,80}$/.test(check.reason) ||
        typeof check.cleanupConfirmed !== 'boolean' ||
        !['FULL_RULE', 'PARTIAL'].includes(check.coverage) ||
        !(check.reportHash === null || hex(check.reportHash)) ||
        !(
          check.exitCode === null ||
          (Number.isInteger(check.exitCode) &&
            check.exitCode >= 0 &&
            check.exitCode <= 255)
        ) ||
        !(
          check.summary === null ||
          (typeof check.summary === 'object' &&
            !Array.isArray(check.summary) &&
            Object.entries(check.summary).every(
              ([k, n]) =>
                counters.has(k) && Number.isSafeInteger(n) && Number(n) >= 0,
            ))
        )
      )
        return null
      if (check.ruleId === 'quality.duplication' && check.state !== 'INCOMPLETE' && (!validDuplicationMeasurement(check.measurement) || check.measurement.analyzedLines === 0 || check.measurement.analyzedFiles === 0 || (check.state === 'PASS' ? check.measurement.clonePairs !== 0 : check.measurement.clonePairs === 0))) return null
      if(check.ruleId==='tests.coverage' && check.state!=='INCOMPLETE' && (check.state!=='PASS'||!validCoverageMeasurement(check.measurement))) return null
      // A signed success still requires execution, complete coverage and confirmed cleanup.
      if (check.state !== 'INCOMPLETE') {
        if (
          !check.cleanupConfirmed ||
          value.cancelled ||
          !check.reportHash ||
          !check.summary ||
          ![0, 1].includes(check.exitCode ?? -1)
        )
          return null
        const s = check.summary
        if (adapter.format === 'junit') {
          if (
            ['tests', 'passed', 'failures', 'errors', 'skipped'].some(
              (k) => !Number.isSafeInteger(s[k]),
            ) ||
            Number(s.tests) !==
              Number(s.passed) +
                Number(s.failures) +
                Number(s.errors) +
                Number(s.skipped) ||
            Number(s.passed) + Number(s.failures) + Number(s.errors) < 1 ||
            (check.state === 'PASS'
              ? check.exitCode !== 0 ||
                Number(s.failures) + Number(s.errors) + Number(s.skipped) !== 0
              : Number(s.failures) + Number(s.errors) === 0)
          )
            return null
        } else if (
          ['runs', 'results', 'suppressed'].some(
            (k) => !Number.isSafeInteger(s[k]),
          ) ||
          Number(s.runs) < 1 ||
          (check.state === 'PASS'
            ? check.exitCode !== 0 ||
              Number(s.results) + Number(s.suppressed) !== 0
            : Number(s.results) < 1)
        )
          return null
      }
    }
    return value
  } catch {
    return null
  }
}
