import { createPublicKey, verify } from 'node:crypto'
import { digest } from '../assessments/assessment-digest.js'
export const nativeApprovalType = 'preflyt.native-runtime-approval.v1'
export const isolationTests = [
  'escape',
  'metadata',
  'exfiltration',
  'crossRepository',
  'resourceAbuse',
  'cancellation',
] as const
export type NativeApproval = {
  version: 1
  environmentId: string
  organizationIds: string[]
  namespace: string
  namespaceUid: string
  runtimeClass: string
  runtimeHandler: 'runsc' | 'kata'
  networkPolicy: string
  resourceQuota: string
  limitRange: string
  serviceAccount: string
  clusterHash: string
  controlsHash: string
  controllerOrigin: string
  controllerPublicKey: string
  approvedAt: string
  expiresAt: string
  reviewDigest: string
  testDigests: Record<(typeof isolationTests)[number], string>
}
const hex = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
const name = (v: unknown) =>
  typeof v === 'string' && /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/.test(v)
export function parseNativeApproval(
  token = process.env.NATIVE_RUNTIME_APPROVAL ?? '',
  keys = process.env.NATIVE_RUNTIME_REVIEW_KEYS ?? '[]',
  now = Date.now(),
): { approval: NativeApproval; approvalHash: string } | null {
  try {
    if (!token || token.length > 32768 || keys.length > 65536) return null
    const parts = token.split('.')
    if (
      parts.length !== 3 ||
      parts.some((p) => !p || !/^[A-Za-z0-9_-]+$/.test(p))
    )
      return null
    const header = JSON.parse(
      Buffer.from(parts[0], 'base64url').toString('utf8'),
    )
    if (
      Object.keys(header).sort().join(',') !== 'alg,kid,typ' ||
      header.alg !== 'EdDSA' ||
      header.typ !== nativeApprovalType ||
      typeof header.kid !== 'string'
    )
      return null
    const trusted = JSON.parse(keys)
    if (
      !Array.isArray(trusted) ||
      trusted.length > 10 ||
      new Set(trusted.map((k) => k.kid)).size !== trusted.length
    )
      return null
    const key = trusted.find((k) => k.kid === header.kid)
    if (
      !key ||
      typeof key.publicKey !== 'string' ||
      key.publicKey.length > 8192 ||
      !key.publicKey.startsWith('-----BEGIN PUBLIC KEY-----')
    )
      return null
    const publicKey = createPublicKey(key.publicKey)
    if (
      publicKey.asymmetricKeyType !== 'ed25519' ||
      !verify(
        null,
        Buffer.from(parts[0] + '.' + parts[1]),
        publicKey,
        Buffer.from(parts[2], 'base64url'),
      )
    )
      return null
    const value = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8'),
    ) as NativeApproval
    const fields = [
      'version',
      'environmentId',
      'organizationIds',
      'namespace',
      'namespaceUid',
      'runtimeClass',
      'runtimeHandler',
      'networkPolicy',
      'resourceQuota',
      'limitRange',
      'serviceAccount',
      'clusterHash',
      'controlsHash',
      'controllerOrigin',
      'controllerPublicKey',
      'approvedAt',
      'expiresAt',
      'reviewDigest',
      'testDigests',
    ]
    if (
      Object.keys(value).sort().join(',') !== fields.sort().join(',') ||
      value.version !== 1 ||
      !['runsc', 'kata'].includes(value.runtimeHandler)
    )
      return null
    if (
      ![
        value.namespace,
        value.runtimeClass,
        value.networkPolicy,
        value.resourceQuota,
        value.limitRange,
        value.serviceAccount,
      ].every(name) ||
      !value.namespace.startsWith('preflyt-sandbox-')
    )
      return null
    if (
      !/^[a-f0-9-]{36}$/.test(value.namespaceUid) ||
      !/^[-a-zA-Z0-9]{1,80}$/.test(value.environmentId) ||
      ![value.clusterHash, value.controlsHash, value.reviewDigest].every(hex)
    )
      return null
    if (
      !Array.isArray(value.organizationIds) ||
      !value.organizationIds.length ||
      value.organizationIds.length > 100 ||
      value.organizationIds.some(
        (id) => typeof id !== 'string' || !/^[-a-zA-Z0-9]{1,80}$/.test(id),
      ) ||
      new Set(value.organizationIds).size !== value.organizationIds.length
    )
      return null
    const origin = new URL(value.controllerOrigin)
    if (
      origin.protocol !== 'https:' ||
      origin.origin !== value.controllerOrigin ||
      origin.username ||
      origin.password
    )
      return null
    const controllerKey = createPublicKey(value.controllerPublicKey)
    if (
      controllerKey.asymmetricKeyType !== 'ed25519' ||
      value.controllerPublicKey.length > 8192 ||
      !value.controllerPublicKey.startsWith('-----BEGIN PUBLIC KEY-----')
    )
      return null
    const start = Date.parse(value.approvedAt),
      end = Date.parse(value.expiresAt)
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start > now ||
      end <= now ||
      end <= start ||
      end - start > 30 * 86400000
    )
      return null
    if (
      !value.testDigests ||
      Object.keys(value.testDigests).sort().join(',') !==
        [...isolationTests].sort().join(',') ||
      !isolationTests.every((test) => hex(value.testDigests[test]))
    )
      return null
    return {
      approval: value,
      approvalHash: digest({ approval: value, reviewKey: key.publicKey }),
    }
  } catch {
    return null
  }
}
