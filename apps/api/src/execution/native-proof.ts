import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import type { NativeApproval } from './native-approval.js'
export type NativeProbeInput = {
  nonce: string
  organizationId: string
  repositoryId: string
  approvalHash: string
}
export type NativeProbeResult = NativeProbeInput & {
  version: 1
  environmentId: string
  checkedAt: string
  verified: boolean
  failed: string[]
  controlsHash: string
}
export function validNativeProbe(value: any): value is NativeProbeInput {
  return (
    value &&
    Object.keys(value).sort().join(',') ===
      'approvalHash,nonce,organizationId,repositoryId' &&
    /^[a-f0-9]{64}$/.test(value.approvalHash) &&
    /^[a-f0-9-]{36}$/.test(value.nonce) &&
    /^[-a-zA-Z0-9]{1,80}$/.test(value.organizationId) &&
    /^[1-9]\d{0,15}$/.test(value.repositoryId)
  )
}
const proofType = 'preflyt.native-preflight.v1'
export function signNativeProbe(
  result: NativeProbeResult,
  privateKey: string,
  approval: NativeApproval,
) {
  const key = createPrivateKey(privateKey)
  if (
    key.asymmetricKeyType !== 'ed25519' ||
    !createPublicKey(key)
      .export({ type: 'spki', format: 'der' })
      .equals(
        createPublicKey(approval.controllerPublicKey).export({
          type: 'spki',
          format: 'der',
        }),
      )
  )
    throw new Error('Controller signing identity changed')
  const header = Buffer.from(
      JSON.stringify({ alg: 'EdDSA', typ: proofType }),
    ).toString('base64url'),
    payload = Buffer.from(JSON.stringify(result)).toString('base64url'),
    input = header + '.' + payload
  return input + '.' + sign(null, Buffer.from(input), key).toString('base64url')
}
export function verifyNativeProbe(
  token: string,
  expected: NativeProbeInput,
  approval: NativeApproval,
  now = Date.now(),
): NativeProbeResult | null {
  try {
    if (token.length > 16384) return null
    const parts = token.split('.')
    if (
      parts.length !== 3 ||
      parts.some((p) => !p || !/^[a-zA-Z0-9_-]+$/.test(p))
    )
      return null
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString())
    if (
      Object.keys(header).sort().join(',') !== 'alg,typ' ||
      header.alg !== 'EdDSA' ||
      header.typ !== proofType ||
      !verify(
        null,
        Buffer.from(parts[0] + '.' + parts[1]),
        createPublicKey(approval.controllerPublicKey),
        Buffer.from(parts[2], 'base64url'),
      )
    )
      return null
    const value = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
    if (
      Object.keys(value).sort().join(',') !==
        'approvalHash,checkedAt,controlsHash,environmentId,failed,nonce,organizationId,repositoryId,verified,version' ||
      value.version !== 1 ||
      value.environmentId !== approval.environmentId ||
      Object.entries(expected).some(([key, v]) => value[key] !== v)
    )
      return null
    const time = Date.parse(value.checkedAt)
    if (
      !Number.isFinite(time) ||
      time > now + 5000 ||
      time < now - 30000 ||
      typeof value.verified !== 'boolean' ||
      !Array.isArray(value.failed) ||
      value.failed.length > 16 ||
      value.failed.some(
        (s: unknown) => typeof s !== 'string' || s.length > 100,
      ) ||
      !/^[a-f0-9]{64}$/.test(value.controlsHash)
    )
      return null
    if (
      value.verified &&
      (value.failed.length || value.controlsHash !== approval.controlsHash)
    )
      return null
    if (!value.verified && !value.failed.length) return null
    return value
  } catch {
    return null
  }
}
