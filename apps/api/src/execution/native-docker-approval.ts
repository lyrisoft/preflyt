import { createPublicKey, verify } from 'node:crypto'
import { digest } from '../assessments/assessment-digest.js'
import { isolationTests } from './native-approval.js'
export const dockerApprovalType = 'preflyt.native-docker-approval.v1'
export type DockerApproval = {
  version: 1
  environmentId: string
  organizationIds: string[]
  runtime: 'runsc' | 'kata'
  controlsHash: string
  toolReviewHash: string
  controllerOrigin: string
  controllerPublicKey: string
  approvedAt: string
  expiresAt: string
  reviewDigest: string
  testDigests: Record<(typeof isolationTests)[number], string>
}
const hex = (value: unknown) =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
/** Independent approval is required for real repositories; local Docker availability is not approval. */
export function nativeDockerApproval(
  token = process.env.NATIVE_DOCKER_APPROVAL ?? '',
  keys = process.env.NATIVE_RUNTIME_REVIEW_KEYS ?? '[]',
  now = Date.now(),
): { approval: DockerApproval; approvalHash: string } | null {
  try {
    if (!token || token.length > 32768 || keys.length > 65536) return null
    const parts = token.split('.')
    if (
      parts.length !== 3 ||
      parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))
    )
      return null
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString())
    if (
      Object.keys(header).sort().join(',') !== 'alg,kid,typ' ||
      header.alg !== 'EdDSA' ||
      header.typ !== dockerApprovalType ||
      typeof header.kid !== 'string'
    )
      return null
    const trusted = JSON.parse(keys) as Array<{
      kid: string
      publicKey: string
    }>
    if (
      !Array.isArray(trusted) ||
      trusted.length > 10 ||
      new Set(trusted.map((key) => key.kid)).size !== trusted.length
    )
      return null
    const signer = trusted.find((key) => key.kid === header.kid)
    if (
      !signer ||
      typeof signer.publicKey !== 'string' ||
      signer.publicKey.length > 8192
    )
      return null
    const key = createPublicKey(signer.publicKey)
    if (
      key.asymmetricKeyType !== 'ed25519' ||
      !verify(
        null,
        Buffer.from(parts[0] + '.' + parts[1]),
        key,
        Buffer.from(parts[2], 'base64url'),
      )
    )
      return null
    const approval = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString(),
    ) as DockerApproval
    if (
      Object.keys(approval).sort().join(',') !==
        'approvedAt,controllerOrigin,controllerPublicKey,controlsHash,environmentId,expiresAt,organizationIds,reviewDigest,runtime,testDigests,toolReviewHash,version' ||
      approval.version !== 1 ||
      !['runsc', 'kata'].includes(approval.runtime)
    )
      return null
    if (
      !/^[-a-zA-Z0-9]{1,80}$/.test(approval.environmentId) ||
      !Array.isArray(approval.organizationIds) ||
      !approval.organizationIds.length ||
      approval.organizationIds.length > 100 ||
      approval.organizationIds.some(
        (id) => typeof id !== 'string' || !/^[-a-zA-Z0-9]{1,80}$/.test(id),
      ) ||
      new Set(approval.organizationIds).size !== approval.organizationIds.length
    )
      return null
    if (
      ![
        approval.controlsHash,
        approval.toolReviewHash,
        approval.reviewDigest,
      ].every(hex) ||
      !approval.testDigests ||
      Object.keys(approval.testDigests).sort().join(',') !==
        [...isolationTests].sort().join(',') ||
      !isolationTests.every((test) => hex(approval.testDigests[test]))
    )
      return null
    const start = Date.parse(approval.approvedAt),
      end = Date.parse(approval.expiresAt)
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start > now ||
      end <= now ||
      end <= start ||
      end - start > 30 * 86400000
    )
      return null
    const origin = new URL(approval.controllerOrigin)
    if (
      origin.protocol !== 'https:' ||
      origin.origin !== approval.controllerOrigin ||
      origin.username ||
      origin.password ||
      approval.controllerPublicKey.length > 8192 ||
      createPublicKey(approval.controllerPublicKey).asymmetricKeyType !==
        'ed25519'
    )
      return null
    return {
      approval,
      approvalHash: digest({ approval, reviewKey: signer.publicKey }),
    }
  } catch {
    return null
  }
}

export function dockerControlsProjection(
  info: Record<string, unknown>,
  runtime: string,
) {
  if (
    !info.ID ||
    !info.ServerVersion ||
    !info.KernelVersion ||
    !info.OperatingSystem ||
    !info.Runtimes ||
    typeof info.Runtimes !== 'object' ||
    !(runtime in info.Runtimes)
  )
    throw new Error('Reviewed Docker runtime is unavailable')
  return {
    engineId: info.ID,
    serverVersion: info.ServerVersion,
    kernelVersion: info.KernelVersion,
    operatingSystem: info.OperatingSystem,
    driver: info.Driver,
    securityOptions: info.SecurityOptions,
    runtime,
    runtimeConfiguration: (info.Runtimes as Record<string, unknown>)[runtime],
  }
}
