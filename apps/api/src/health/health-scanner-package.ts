import { createPublicKey } from 'node:crypto'
import { digest } from '../assessments/assessment-digest.js'
import { buildNativePlan, nativeAdapters, nativeToolReviews, type NativeRuleId, type NativeToolReview } from '../execution/native-plan.js'
import type { NativeReceiptExpected } from '../execution/native-receipt.js'

export const healthScannerRules = ['secrets.scan', 'security.sast', 'security.dependencies', 'iac.policy', 'quality.reliability', 'quality.maintainability', 'quality.duplication', 'security.hotspots'] as const
export type HealthScannerPackage = {
  version: 1; environmentId: string; runtime: 'runc' | 'runsc' | 'kata';
  controlsHash: string; controllerPublicKey: string; createdAt: string; tools: NativeToolReview[]
}

/** Deployment-owned package, never a repository command, org approval or user-supplied image. */
export function healthScannerAuthority(value: HealthScannerPackage, organizationId: string) {
  if (!value || value.version !== 1 || !/^[-a-zA-Z0-9]{1,80}$/.test(value.environmentId) ||
    !['runc','runsc','kata'].includes(value.runtime) || !/^[a-f0-9]{64}$/.test(value.controlsHash) ||
    !Number.isFinite(Date.parse(value.createdAt)) || Date.parse(value.createdAt) > Date.now() ||
    !Array.isArray(value.tools) || value.tools.some(t => !healthScannerRules.includes(t.ruleId as any)) ||
    createPublicKey(value.controllerPublicKey).asymmetricKeyType !== 'ed25519' ||
    !/^[-a-zA-Z0-9]{1,80}$/.test(organizationId)) throw new Error('Invalid scanner package')
  const tools = nativeToolReviews(JSON.stringify(value.tools), Date.now(), 'health')
  if (!tools?.reviews.length) throw new Error('Scanner images unavailable')
  return {
    reviewed: {
      backend: 'docker' as const,
      approvalHash: digest({ kind: 'preflyt-health-scanners-v1', package: value, organizationId }),
      approval: { environmentId: value.environmentId, organizationIds: [organizationId],
        controllerPublicKey: value.controllerPublicKey, controlsHash: value.controlsHash,
        toolReviewHash: tools.reviewHash, approvedAt: value.createdAt, expiresAt: '2099-01-01T00:00:00Z' },
    }, tools,
  }
}

export function healthScannerPlan(pkg: HealthScannerPackage, input: { organizationId: string; repositoryId: string; sourceSha: string; selectionId: string; ruleIds: string[] }) {
  if (!/^health:[a-f0-9-]{36}$/.test(input.selectionId) || input.ruleIds.some(id => !healthScannerRules.includes(id as any)))
    throw new Error('Only fixed repository health scanners are available')
  const authority = healthScannerAuthority(pkg, input.organizationId)
  return buildNativePlan({ ...input, rules: input.ruleIds.map(id => ({ id, title: id, required: false, capability: 'execution' })) }, authority.tools)
}

export function admitHealthScan(pkg: HealthScannerPackage, expected: NativeReceiptExpected) {
  if (!expected || Object.keys(expected).sort().join(',') !== 'approvalHash,attemptId,organizationId,plan,planHash,repositoryId,requestId,ruleIds,selectionId,sourceHash,sourceSha' ||
    !/^[a-f0-9-]{36}$/.test(expected.requestId) || expected.attemptId !== expected.requestId ||
    expected.selectionId !== 'health:' + expected.requestId || !/^[a-f0-9]{64}$/.test(expected.sourceHash) ||
    !Array.isArray(expected.ruleIds) || !expected.ruleIds.length || expected.ruleIds.length > 8 || new Set(expected.ruleIds).size !== expected.ruleIds.length)
    throw new Error('Invalid health scan scope')
  const authority = healthScannerAuthority(pkg, expected.organizationId)
  const { planHash, ...plan } = healthScannerPlan(pkg, { ...expected, ruleIds: expected.ruleIds })
  if (expected.approvalHash !== authority.reviewed.approvalHash || expected.planHash !== planHash || digest(expected.plan) !== digest(plan))
    throw new Error('Health scanner package or scope changed')
  const rules = expected.ruleIds as NativeRuleId[]
  if (rules.some(id => !nativeAdapters[id] || !authority.tools.reviews.some(tool => tool.ruleId === id)))
    throw new Error('Health scanner unavailable')
  return { ...authority, rules }
}

/** Automatically inspected baseline for fixed static scanners. General repository-code execution uses its separate strong-isolation policy. */
export function healthDockerControls(info: any, runtime: string) {
  const options = info?.SecurityOptions
  if (info?.OSType !== 'linux' || typeof info.ID !== 'string' || !info.ID || !info.ServerVersion || !info.KernelVersion ||
    !info.Runtimes || !(runtime in info.Runtimes) || !Array.isArray(options) ||
    !options.some((option: string) => /^name=seccomp(?:,|$)/.test(option)) ||
    info.MemoryLimit !== true || info.PidsLimit !== true)
    throw new Error('Scanner isolation controls are unavailable')
  return digest({ version: 1, engine: info.ID, server: info.ServerVersion, kernel: info.KernelVersion, security: options,
    runtime, runtimeConfiguration: info.Runtimes[runtime], memory: true, pids: true,
    profile: 'non-root-readonly-no-network-no-capabilities-fixed-static-scanners-v1' })
}
